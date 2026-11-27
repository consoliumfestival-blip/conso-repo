import type { Table } from 'dexie';
import { PosterStudioDatabase, db as defaultDatabase } from './db';
import type {
  PosterDeliveryRecord,
  PosterDeliveryScope,
  PosterDeliveryStatus,
} from './posterDesignSnapshot';

export interface PosterDeliveryListOptions {
  statuses?: PosterDeliveryStatus[];
  limit?: number;
}

export type PosterDeliveryProgress = Partial<Pick<
  PosterDeliveryRecord,
  'stage' | 'status' | 'verifiedOutputs' | 'serverGenerationId' | 'serverAssetIds' | 'serverVisibilityStatus' | 'lastError'
>> & {
  leaseExpiresAt?: number | null;
  releaseLease?: boolean;
};

export class PosterDeliveryPersistenceError extends Error {
  readonly code = 'POSTER_DELIVERY_PERSIST_FAILED';

  constructor(cause: unknown) {
    super('Poster image and editable snapshot could not be saved on this device.', { cause });
    this.name = 'PosterDeliveryPersistenceError';
  }
}

let storagePersistenceRequest: Promise<boolean> | null = null;

async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage) return false;
  if (!storagePersistenceRequest) {
    storagePersistenceRequest = (async () => {
      try {
        if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
        return navigator.storage.persist ? await navigator.storage.persist() : false;
      } catch {
        return false;
      }
    })();
  }
  try {
    const granted = await storagePersistenceRequest;
    if (!granted) storagePersistenceRequest = null;
    return granted;
  } catch {
    storagePersistenceRequest = null;
    return false;
  }
}

function isValidScope(scope: PosterDeliveryScope): boolean {
  return Boolean(scope.userId.trim() && scope.tenantId.trim() && scope.festivalId.trim());
}

function matchesScope(record: PosterDeliveryRecord, scope: PosterDeliveryScope): boolean {
  return record.userId === scope.userId
    && record.tenantId === scope.tenantId
    && record.festivalId === scope.festivalId;
}

function assertValidRecord(record: PosterDeliveryRecord): void {
  if (!record.operationId.trim() || !isValidScope(record)) {
    throw new TypeError('A poster delivery requires an operation ID and complete user, tenant, and festival scope.');
  }
  if (!matchesScope(record, record.snapshot)) {
    throw new TypeError('Poster snapshot scope must match its delivery scope.');
  }
  if (!record.outputs.length || record.outputs.some((output) => (
    !output.outputId.trim()
    || !(output.blob instanceof Blob)
    || !output.storageKey.trim()
    || /^https?:\/\//i.test(output.storageKey)
    || output.width <= 0
    || output.height <= 0
  ))) {
    throw new TypeError('Each poster output requires a Blob, dimensions, and a stable storage key.');
  }
  if (
    record.snapshot.snapshotVersion !== 1
    || !record.snapshot.templateId.trim()
    || (!record.snapshot.itemId && !record.snapshot.resultId)
    || !Number.isFinite(record.snapshot.templateVersion)
    || record.snapshot.width <= 0
    || record.snapshot.height <= 0
  ) {
    throw new TypeError('Poster snapshot version or dimensions are invalid.');
  }
}

function cloneRecord(record: PosterDeliveryRecord): PosterDeliveryRecord {
  return structuredClone(record);
}

async function scopedTableQuery(
  table: Table<PosterDeliveryRecord>,
  scope: PosterDeliveryScope,
): Promise<PosterDeliveryRecord[]> {
  return table.where('[userId+tenantId+festivalId]')
    .equals([scope.userId, scope.tenantId, scope.festivalId])
    .toArray();
}

export async function savePendingPosterDelivery(
  record: PosterDeliveryRecord,
  database: PosterStudioDatabase = defaultDatabase,
): Promise<void> {
  assertValidRecord(record);
  await requestPersistentStorage();
  const durableCopy = cloneRecord(record);

  try {
    await database.transaction('rw', database.poster_deliveries, async () => {
      await database.poster_deliveries.add(durableCopy);
    });
  } catch (cause) {
    throw new PosterDeliveryPersistenceError(cause);
  }
}

export async function getPosterDelivery(
  operationId: string,
  scope: PosterDeliveryScope,
  database: PosterStudioDatabase = defaultDatabase,
): Promise<PosterDeliveryRecord | null> {
  if (!isValidScope(scope)) return null;
  const record = await database.poster_deliveries.get(operationId);
  if (!record || !matchesScope(record, scope)) return null;
  return record;
}

export async function listPosterDeliveries(
  scope: PosterDeliveryScope,
  options: PosterDeliveryListOptions = {},
  database: PosterStudioDatabase = defaultDatabase,
): Promise<PosterDeliveryRecord[]> {
  if (!isValidScope(scope)) return [];

  let records = await scopedTableQuery(database.poster_deliveries, scope);
  if (options.statuses?.length) {
    const statuses = new Set(options.statuses);
    records = records.filter((record) => statuses.has(record.status));
  }
  records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (options.limit !== undefined) {
    records = records.slice(0, Math.max(0, Math.floor(options.limit)));
  }
  return records;
}

export async function claimPosterDelivery(
  operationId: string,
  scope: PosterDeliveryScope,
  ownerId: string,
  now = Date.now(),
  leaseDurationMs = 30_000,
  database: PosterStudioDatabase = defaultDatabase,
): Promise<PosterDeliveryRecord | null> {
  if (!isValidScope(scope) || !ownerId.trim() || leaseDurationMs <= 0) return null;

  return database.transaction('rw', database.poster_deliveries, async () => {
    const record = await database.poster_deliveries.get(operationId);
    if (!record || !matchesScope(record, scope) || record.status === 'synced') return null;
    if (record.leaseExpiresAt !== null && record.leaseExpiresAt > now) return null;

    const claimed: PosterDeliveryRecord = {
      ...record,
      status: record.stage === 'finalize' ? 'pending_finalize' : 'uploading',
      attemptCount: record.attemptCount + 1,
      updatedAt: new Date(now).toISOString(),
      leaseOwnerId: ownerId,
      leaseExpiresAt: now + leaseDurationMs,
    };
    await database.poster_deliveries.put(claimed);
    return claimed;
  });
}

export async function updateClaimedPosterDelivery(
  operationId: string,
  scope: PosterDeliveryScope,
  ownerId: string,
  progress: PosterDeliveryProgress,
  now = Date.now(),
  database: PosterStudioDatabase = defaultDatabase,
): Promise<PosterDeliveryRecord | null> {
  return database.transaction('rw', database.poster_deliveries, async () => {
    const record = await database.poster_deliveries.get(operationId);
    if (
      !record
      || !matchesScope(record, scope)
      || record.leaseOwnerId !== ownerId
      || record.leaseExpiresAt === null
      || record.leaseExpiresAt <= now
    ) return null;

    const { releaseLease = false, leaseExpiresAt, ...changes } = progress;
    const next: PosterDeliveryRecord = {
      ...record,
      ...changes,
      updatedAt: new Date(now).toISOString(),
      leaseOwnerId: releaseLease ? null : record.leaseOwnerId,
      leaseExpiresAt: releaseLease ? null : (leaseExpiresAt ?? record.leaseExpiresAt),
    };
    if (record.status === 'synced' && next.status !== 'synced') return null;
    await database.poster_deliveries.put(next);
    return next;
  });
}
