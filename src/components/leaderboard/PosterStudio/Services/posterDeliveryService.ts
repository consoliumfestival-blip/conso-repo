import { db, PosterStudioDatabase } from '../Database/db';
import {
  claimPosterDelivery,
  getPosterDelivery,
  updateClaimedPosterDelivery,
} from '../Database/posterDeliveryRepository';
import type { finalizePosterDelivery, lookupPosterGeneration } from '../Database/posterGenerationClient';
import type {
  PosterDeliveryProgress,
} from '../Database/posterDeliveryRepository';
import type {
  PosterDeliveryRecord,
  PosterDeliveryScope,
  PosterVerifiedOutput,
} from '../Database/posterDesignSnapshot';
import type { storageService } from '../../../../services/storage/storageService';
import type { VerifiedStorageObject } from '../../../../providers/storage/storageProvider';
import { FILE_LIMITS } from '../../../../services/storage/storageLimits';

const DELIVERY_LEASE_MS = 120_000;

interface PosterDeliveryRepositoryPort {
  get(operationId: string, scope: PosterDeliveryScope, database: PosterStudioDatabase): Promise<PosterDeliveryRecord | null>;
  claim(
    operationId: string,
    scope: PosterDeliveryScope,
    ownerId: string,
    now: number,
    leaseDurationMs: number,
    database: PosterStudioDatabase,
  ): Promise<PosterDeliveryRecord | null>;
  update(
    operationId: string,
    scope: PosterDeliveryScope,
    ownerId: string,
    progress: PosterDeliveryProgress,
    now: number,
    database: PosterStudioDatabase,
  ): Promise<PosterDeliveryRecord | null>;
}

export interface PosterDeliveryDependencies {
  database?: PosterStudioDatabase;
  repository?: PosterDeliveryRepositoryPort;
  lookup?: typeof lookupPosterGeneration;
  finalize?: typeof finalizePosterDelivery;
  verifyObject?: typeof storageService.verifyPosterObject;
  uploadAtKey?: typeof storageService.uploadPosterObjectAtKey;
  now?: () => number;
  leaseDurationMs?: number;
  leaseHeartbeatIntervalMs?: number;
  isScopeActive?: (scope: PosterDeliveryScope) => boolean | Promise<boolean>;
}

export type PosterDeliveryRunResult =
  | { status: 'missing' }
  | { status: 'busy' }
  | { status: 'synced'; result: Awaited<ReturnType<typeof finalizePosterDelivery>> }
  | { status: 'failed'; stage: PosterDeliveryRecord['stage']; error: string; localStateSaved: boolean };

function getOperationUuid(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Secure operation IDs require crypto.randomUUID in this browser.');
  }
  return globalThis.crypto.randomUUID();
}

export function createPosterOperationId(): string {
  return getOperationUuid();
}

export function createPosterObjectKey(
  festivalId: string,
  operationId: string,
  outputId: string,
  contentType: string,
): string {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const extension = extensions[contentType];
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(festivalId) || !uuidPattern.test(operationId)
    || !extension || !/^[a-zA-Z0-9_-]+$/.test(outputId)) {
    throw new TypeError('Poster output key requires a safe output ID and supported image type.');
  }
  return `cons-assets/posters/${festivalId}/${operationId}/${outputId}.${extension}`;
}

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Poster upload failed.';
  return raw
    .replace(/https?:\/\/[^\s)]+/gi, '[redacted URL]')
    .replace(/(authorization|access[_-]?token|refresh[_-]?token|signature)=([^\s&]+)/gi, '$1=[redacted]')
    .slice(0, 500);
}

function verifiedOutput(
  output: PosterDeliveryRecord['outputs'][number],
  verification: VerifiedStorageObject,
  verifiedAt: string,
): PosterVerifiedOutput {
  return {
    outputId: output.outputId,
    storageKey: verification.objectKey,
    contentType: verification.contentType,
    byteSize: verification.contentLength,
    width: output.width,
    height: output.height,
    resolutions: output.resolutions,
    etag: verification.eTag,
    verifiedAt,
  };
}

function assertGenerationResult(
  result: Awaited<ReturnType<typeof finalizePosterDelivery>>,
  expectedOperationId: string,
): void {
  if (
    result.operationId !== expectedOperationId
    || !result.generationId.trim()
    || result.assetIds.length === 0
    || result.assetIds.some((assetId) => typeof assetId !== 'string' || !assetId.trim())
  ) {
    throw new Error('Poster generation response does not match the requested operation.');
  }
}

async function withLeaseHeartbeat<T>(
  operationId: string,
  scope: PosterDeliveryScope,
  ownerId: string,
  repository: PosterDeliveryRepositoryPort,
  database: PosterStudioDatabase,
  now: () => number,
  leaseDurationMs: number,
  heartbeatIntervalMs: number,
  action: () => Promise<T>,
): Promise<T> {
  let renewal: Promise<void> | null = null;
  let renewalError: Error | null = null;
  const renew = () => {
    if (renewal || renewalError) return;
    renewal = repository.update(operationId, scope, ownerId, {
      leaseExpiresAt: now() + leaseDurationMs,
    }, now(), database)
      .then((record) => {
        if (!record) renewalError = new Error('Poster delivery lease was lost. Retry the saved operation.');
      })
      .catch((error: unknown) => {
        renewalError = error instanceof Error ? error : new Error('Poster delivery lease could not be renewed.');
      })
      .finally(() => { renewal = null; });
  };
  const timer = setInterval(renew, heartbeatIntervalMs);
  try {
    const result = await action();
    if (renewal) await renewal;
    if (renewalError) throw renewalError;
    return result;
  } finally {
    clearInterval(timer);
    if (renewal) await renewal;
  }
}

async function isAuthenticatedScopeActive(scope: PosterDeliveryScope): Promise<boolean> {
  const { useAuthStore } = await import('../../../../core/store/authStore');
  const auth = useAuthStore.getState();
  return auth.user?.id === scope.userId
    && (auth.tenant_id === scope.tenantId || auth.is_superadmin === true);
}

async function callInActiveScope<T>(
  scope: PosterDeliveryScope,
  isScopeActive: (scope: PosterDeliveryScope) => boolean | Promise<boolean>,
  action: () => Promise<T>,
): Promise<T> {
  if (!await isScopeActive(scope)) throw new Error('Account or tenant changed; poster delivery was paused.');
  const result = await action();
  if (!await isScopeActive(scope)) throw new Error('Account or tenant changed; poster delivery was paused.');
  return result;
}

export async function runPosterDelivery(
  operationId: string,
  scope: PosterDeliveryScope,
  ownerId: string,
  dependencies: PosterDeliveryDependencies = {},
): Promise<PosterDeliveryRunResult> {
  const database = dependencies.database ?? db;
  const now = dependencies.now ?? Date.now;
  const repository = dependencies.repository ?? {
    get: getPosterDelivery,
    claim: claimPosterDelivery,
    update: updateClaimedPosterDelivery,
  };
  let lookup = dependencies.lookup;
  let finalize = dependencies.finalize;
  let verifyObject = dependencies.verifyObject;
  let uploadAtKey = dependencies.uploadAtKey;
  const leaseDurationMs = dependencies.leaseDurationMs ?? DELIVERY_LEASE_MS;
  const leaseHeartbeatIntervalMs = dependencies.leaseHeartbeatIntervalMs ?? Math.floor(leaseDurationMs / 3);
  const isScopeActive = dependencies.isScopeActive ?? isAuthenticatedScopeActive;
  if (leaseDurationMs <= 0 || leaseHeartbeatIntervalMs <= 0) {
    throw new TypeError('Poster delivery lease duration and heartbeat interval must be positive.');
  }

  let record: PosterDeliveryRecord | null = null;
  let stage: PosterDeliveryRecord['stage'] = 'upload';
  let localStateSaved = false;

  try {
    if (!await isScopeActive(scope)) {
      return {
        status: 'failed',
        stage,
        error: 'Account or tenant changed; poster delivery was paused.',
        localStateSaved: false,
      };
    }
    record = await repository.get(operationId, scope, database);
    if (!record) return { status: 'missing' };

    record = await repository.claim(operationId, scope, ownerId, now(), leaseDurationMs, database);
    if (!record) return { status: 'busy' };

    if (!lookup || !finalize) {
      const generationClient = await import('../Database/posterGenerationClient');
      lookup ??= generationClient.lookupPosterGeneration;
      finalize ??= generationClient.finalizePosterDelivery;
    }
    if (!verifyObject || !uploadAtKey) {
      const configuredStorage = (await import('../../../../services/storage/storageService')).storageService;
      verifyObject ??= configuredStorage.verifyPosterObject;
      uploadAtKey ??= configuredStorage.uploadPosterObjectAtKey;
    }
    const lookupOperation = lookup;
    const finalizeOperation = finalize;
    const verifyStorageObject = verifyObject;
    const uploadStorageObject = uploadAtKey;

    const alreadyFinalized = await callInActiveScope(scope, isScopeActive, () => withLeaseHeartbeat(
      operationId, scope, ownerId, repository, database, now,
      leaseDurationMs, leaseHeartbeatIntervalMs, () => lookupOperation(operationId),
    ));
    if (alreadyFinalized) {
      stage = 'finalize';
      assertGenerationResult(alreadyFinalized, operationId);
      const reconciled = await repository.update(operationId, scope, ownerId, {
        status: 'synced',
        stage,
        serverGenerationId: alreadyFinalized.generationId,
        serverAssetIds: alreadyFinalized.assetIds,
        serverVisibilityStatus: alreadyFinalized.visibilityStatus,
        lastError: null,
        releaseLease: true,
      }, now(), database);
      if (!reconciled) throw new Error('Saved generation was found, but local status could not be reconciled. Retry safely.');
      return { status: 'synced', result: alreadyFinalized };
    }

    const verifiedByOutputId = new Map(record.verifiedOutputs.map((output) => [output.outputId, output]));
    const verifiedOutputs: PosterVerifiedOutput[] = [];
    for (const output of record.outputs) {
      if (output.blob.size > FILE_LIMITS.generated_asset) {
        throw new Error(`Poster exceeds the existing ${FILE_LIMITS.generated_asset / 1024 / 1024} MB generated-asset limit.`);
      }
      stage = 'upload';
      const previousVerification = verifiedByOutputId.get(output.outputId);
      // A new key has no object to verify. The create-only PUT handles a retry
      // after an interrupted upload and verifies an existing key on conflict.
      let verification = previousVerification ? await callInActiveScope(scope, isScopeActive, () => withLeaseHeartbeat(
        operationId, scope, ownerId, repository, database, now,
        leaseDurationMs, leaseHeartbeatIntervalMs,
        () => verifyStorageObject(output.storageKey, output.contentType, output.blob.size),
      )) : null;
      if (verification && previousVerification && verification.eTag !== previousVerification.etag) {
        throw new Error('Saved poster bytes changed at the retry key; the upload was stopped.');
      }

      if (!verification) {
        verification = await callInActiveScope(scope, isScopeActive, () => withLeaseHeartbeat(
          operationId, scope, ownerId, repository, database, now,
          leaseDurationMs, leaseHeartbeatIntervalMs,
          () => uploadStorageObject({
            file: output.blob,
            objectKey: output.storageKey,
            contentType: output.contentType,
            visibility: 'private',
            expectedSize: output.blob.size,
          }),
        ));
        if (previousVerification && verification.eTag !== previousVerification.etag) {
          throw new Error('Retried poster bytes do not match the previously verified upload.');
        }
      }

      stage = 'verify';
      verifiedOutputs.push(verifiedOutput(output, verification, new Date(now()).toISOString()));
      record = await repository.update(operationId, scope, ownerId, {
        status: 'uploading',
        stage,
        verifiedOutputs: [...verifiedOutputs],
        lastError: null,
        leaseExpiresAt: now() + leaseDurationMs,
      }, now(), database);
      if (!record) throw new Error('Verified upload progress could not be saved locally. Download the saved poster now.');
      localStateSaved = true;
    }

    stage = 'finalize';
    record = await repository.update(operationId, scope, ownerId, {
      status: 'pending_finalize',
      stage,
      verifiedOutputs,
      lastError: null,
      leaseExpiresAt: now() + leaseDurationMs,
    }, now(), database);
    if (!record) throw new Error('Uploaded poster is waiting for finalization, but local progress could not be saved. Download the saved poster now.');
    localStateSaved = true;

    const result = await callInActiveScope(scope, isScopeActive, () => withLeaseHeartbeat(
      operationId, scope, ownerId, repository, database, now,
      leaseDurationMs, leaseHeartbeatIntervalMs, () => finalizeOperation(record!),
    ));
    assertGenerationResult(result, operationId);
    const confirmed = await repository.update(operationId, scope, ownerId, {
      status: 'synced',
      serverGenerationId: result.generationId,
      serverAssetIds: result.assetIds,
      serverVisibilityStatus: result.visibilityStatus,
      lastError: null,
      releaseLease: true,
    }, now(), database);
    if (!confirmed) throw new Error('Server accepted the poster, but local confirmation could not be saved. Retry to reconcile it.');
    return { status: 'synced', result };
  } catch (error) {
    let errorMessage = safeErrorMessage(error);
    if (record) {
      try {
        const failed = await repository.update(operationId, scope, ownerId, {
          status: 'failed',
          stage,
          lastError: errorMessage,
          releaseLease: true,
        }, now(), database);
        localStateSaved = Boolean(failed);
      } catch (persistenceError) {
        errorMessage = `${errorMessage} Local retry status could not be saved: ${safeErrorMessage(persistenceError)}`.slice(0, 500);
        localStateSaved = false;
      }
    }
    return { status: 'failed', stage, error: errorMessage, localStateSaved };
  }
}
