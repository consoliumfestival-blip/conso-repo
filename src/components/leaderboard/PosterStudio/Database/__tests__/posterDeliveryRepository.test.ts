import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PosterStudioDatabase } from '../db';
import {
  claimPosterDelivery,
  getPosterDelivery,
  listPosterDeliveries,
  savePendingPosterDelivery,
  updateClaimedPosterDelivery,
  PosterDeliveryPersistenceError,
} from '../posterDeliveryRepository';
import type {
  PosterDeliveryRecord,
  PosterDesignSnapshot,
  PosterDeliveryScope,
} from '../posterDesignSnapshot';

function makeScope(overrides: Partial<PosterDeliveryScope> = {}): PosterDeliveryScope {
  return { userId: 'user-a', tenantId: 'tenant-a', festivalId: 'festival-a', ...overrides };
}

function makeRecord(scope = makeScope(), operationId = crypto.randomUUID()): PosterDeliveryRecord {
  const createdAt = new Date('2026-11-26T00:00:00.000Z').toISOString();
  const snapshot: PosterDesignSnapshot = {
    snapshotVersion: 1,
    userId: scope.userId,
    tenantId: scope.tenantId,
    festivalId: scope.festivalId,
    templateId: 'template-a',
    templateVersion: 3,
    itemId: 'item-a',
    resultId: 'result-a',
    width: 1080,
    height: 1080,
    backgroundAsset: null,
    backgroundTransform: { scale: 1, x: 0, y: 0 },
    layers: [],
    variables: { event_name: 'Speech', result_no: '24' },
    typographyMode: 'A',
    assetReferences: [],
    customFontReferences: [],
    sourceResultFingerprint: 'fingerprint-a',
    createdAt,
  };

  return {
    operationId,
    ...scope,
    snapshot,
    outputs: [{
      outputId: 'poster',
      resolutions: ['hd', 'standard'],
      blob: new Blob(['poster bytes'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
      width: 1080,
      height: 1080,
      storageKey: `cons-assets/posters/${scope.festivalId}/${operationId}/poster.jpg`,
    }],
    sourceAssets: [],
    missingSourceAssetKeys: [],
    status: 'pending_upload',
    stage: 'upload',
    attemptCount: 0,
    createdAt,
    updatedAt: createdAt,
    leaseOwnerId: null,
    leaseExpiresAt: null,
    verifiedOutputs: [],
    serverGenerationId: null,
    serverAssetIds: [],
    lastError: null,
  };
}

async function withDatabase<T>(name: string, run: (database: PosterStudioDatabase) => Promise<T>) {
  const database = new PosterStudioDatabase(name);
  try {
    await database.open();
    return await run(database);
  } finally {
    database.close();
    await database.delete();
  }
}

test('v2 drafts and result overrides survive the additive v3 upgrade', async () => {
  const name = `PosterStudioDatabase_upgrade_${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(1).stores({ templates: 'id, updatedAt' });
  legacy.version(2).stores({
    templates: 'id, updatedAt',
    result_overrides: 'id, templateId, resultId, updatedAt',
  });
  await legacy.open();
  await legacy.table('templates').add({ id: 'template-a', updatedAt: 'now' });
  await legacy.table('result_overrides').add({
    id: 'template-a_result-a', templateId: 'template-a', resultId: 'result-a', updatedAt: 'now', overrides: {},
  });
  legacy.close();

  await withDatabase(name, async (database) => {
    assert.equal((await database.templates.get('template-a'))?.id, 'template-a');
    assert.equal((await database.result_overrides.get('template-a_result-a'))?.resultId, 'result-a');
    assert.equal(await database.poster_deliveries.count(), 0);
  });
});

test('stores the image Blob and complete design snapshot across a database reopen', async () => {
  const name = `PosterStudioDatabase_reload_${crypto.randomUUID()}`;
  const first = new PosterStudioDatabase(name);
  const record = makeRecord();
  await first.open();
  await savePendingPosterDelivery(record, first);
  first.close();

  await withDatabase(name, async (database) => {
    const loaded = await getPosterDelivery(record.operationId, makeScope(), database);
    assert.equal(loaded?.snapshot.variables.result_no, '24');
    assert.equal(loaded?.outputs[0].blob.size, record.outputs[0].blob.size);
    assert.equal(loaded?.outputs[0].blob.type, 'image/jpeg');
  });
});

test('lists only records belonging to the exact user, tenant, and festival scope', async () => {
  await withDatabase(`PosterStudioDatabase_scope_${crypto.randomUUID()}`, async (database) => {
    const owned = makeRecord(makeScope());
    const otherUser = makeRecord(makeScope({ userId: 'user-b' }));
    const otherFestival = makeRecord(makeScope({ festivalId: 'festival-b' }));
    await Promise.all([
      savePendingPosterDelivery(owned, database),
      savePendingPosterDelivery(otherUser, database),
      savePendingPosterDelivery(otherFestival, database),
    ]);

    const visible = await listPosterDeliveries(makeScope(), {}, database);
    assert.deepEqual(visible.map((record) => record.operationId), [owned.operationId]);
    assert.equal(await getPosterDelivery(otherUser.operationId, makeScope(), database), null);
  });
});

test('two tabs cannot claim the same active delivery lease', async () => {
  await withDatabase(`PosterStudioDatabase_claim_${crypto.randomUUID()}`, async (database) => {
    const record = makeRecord();
    await savePendingPosterDelivery(record, database);
    const now = Date.parse(record.createdAt);
    const claims = await Promise.all([
      claimPosterDelivery(record.operationId, makeScope(), 'tab-a', now, 30_000, database),
      claimPosterDelivery(record.operationId, makeScope(), 'tab-b', now, 30_000, database),
    ]);

    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal((await getPosterDelivery(record.operationId, makeScope(), database))?.attemptCount, 1);
  });
});

test('a failed or expired lease can be claimed again by a later owner', async () => {
  await withDatabase(`PosterStudioDatabase_reclaim_${crypto.randomUUID()}`, async (database) => {
    const record = makeRecord();
    await savePendingPosterDelivery(record, database);
    const firstNow = Date.parse(record.createdAt);
    await claimPosterDelivery(record.operationId, makeScope(), 'tab-a', firstNow, 100, database);

    const reclaimed = await claimPosterDelivery(
      record.operationId,
      makeScope(),
      'tab-b',
      firstNow + 101,
      100,
      database,
    );

    assert.equal(reclaimed?.leaseOwnerId, 'tab-b');
    assert.equal(reclaimed?.attemptCount, 2);
  });
});

test('reports local persistence failures as an actionable delivery error', async () => {
  const error = new DOMException('storage quota reached', 'QuotaExceededError');
  const failingDatabase = {
    transaction: async (_mode: string, _tables: unknown, run: () => Promise<void>) => run(),
    poster_deliveries: { add: async () => { throw error; } },
  } as unknown as PosterStudioDatabase;

  await assert.rejects(
    savePendingPosterDelivery(makeRecord(), failingDatabase),
    (caught: unknown) => caught instanceof PosterDeliveryPersistenceError
      && caught.code === 'POSTER_DELIVERY_PERSIST_FAILED'
      && caught.cause === error,
  );
});

test('only the current lease owner can update delivery progress', async () => {
  await withDatabase(`PosterStudioDatabase_owner_${crypto.randomUUID()}`, async (database) => {
    const record = makeRecord();
    await savePendingPosterDelivery(record, database);
    const now = Date.parse(record.createdAt);
    await claimPosterDelivery(record.operationId, makeScope(), 'tab-a', now, 30_000, database);

    const rejected = await updateClaimedPosterDelivery(
      record.operationId,
      makeScope(),
      'tab-b',
      { status: 'synced', serverGenerationId: 'generation-a' },
      now + 1,
      database,
    );
    const accepted = await updateClaimedPosterDelivery(
      record.operationId,
      makeScope(),
      'tab-a',
      { status: 'pending_finalize', stage: 'finalize', verifiedOutputs: [] },
      now + 1,
      database,
    );

    assert.equal(rejected, null);
    assert.equal(accepted?.status, 'pending_finalize');
    assert.equal(accepted?.stage, 'finalize');
    assert.equal(accepted?.snapshot.sourceResultFingerprint, record.snapshot.sourceResultFingerprint);
  });
});
