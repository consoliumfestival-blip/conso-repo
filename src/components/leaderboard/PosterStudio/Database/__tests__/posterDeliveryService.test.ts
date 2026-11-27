import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PosterStudioDatabase } from '../db';
import {
  claimPosterDelivery,
  getPosterDelivery,
  savePendingPosterDelivery,
  updateClaimedPosterDelivery,
} from '../posterDeliveryRepository';
import type { PosterDeliveryRecord, PosterDeliveryScope } from '../posterDesignSnapshot';
import type { PosterGenerationResult } from '../posterGenerationClient';
import { runPosterDelivery } from '../../Services/posterDeliveryService';

function makeScope(): PosterDeliveryScope {
  return { userId: 'user-a', tenantId: 'tenant-a', festivalId: 'festival-a' };
}

function makeRecord(scope = makeScope()): PosterDeliveryRecord {
  const createdAt = new Date('2026-11-26T00:00:00.000Z').toISOString();
  const operationId = crypto.randomUUID();
  return {
    operationId,
    ...scope,
    snapshot: {
      snapshotVersion: 1,
      ...scope,
      templateId: 'template-a',
      templateVersion: 1,
      itemId: 'item-a',
      resultId: 'result-a',
      width: 1080,
      height: 1080,
      backgroundAsset: null,
      backgroundTransform: null,
      layers: [],
      variables: {},
      typographyMode: 'A',
      assetReferences: [],
      customFontReferences: [],
      sourceResultFingerprint: 'result-fingerprint',
      createdAt,
    },
    outputs: [{
      outputId: 'poster',
      resolutions: ['standard'],
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

function generationResult(operationId: string): PosterGenerationResult {
  return {
    generationId: `generation-${operationId}`,
    operationId,
    assetIds: [`asset-${operationId}`],
    renderHash: 'render-hash',
    visibilityStatus: 'draft',
    isCurrent: true,
  };
}

async function withDatabase<T>(run: (database: PosterStudioDatabase) => Promise<T>): Promise<T> {
  const database = new PosterStudioDatabase(`PosterDeliveryService_${crypto.randomUUID()}`);
  try {
    await database.open();
    return await run(database);
  } finally {
    database.close();
    await database.delete();
  }
}

function repository() {
  return {
    get: getPosterDelivery,
    claim: claimPosterDelivery,
    update: updateClaimedPosterDelivery,
  };
}

const verifiedObject = (objectKey: string) => ({
  objectKey,
  contentType: 'image/jpeg',
  contentLength: new Blob(['poster bytes']).size,
  eTag: 'poster-etag',
});

test('uploads at the persisted key and stores the confirmed server identity', async () => {
  await withDatabase(async (database) => {
    const record = makeRecord();
    await savePendingPosterDelivery(record, database);
    const uploadKeys: string[] = [];
    let preUploadVerifications = 0;
    const finalizedRecords: PosterDeliveryRecord[] = [];
    const result = await runPosterDelivery(record.operationId, makeScope(), 'tab-a', {
      database,
      repository: repository(),
      now: () => Date.parse(record.createdAt),
      isScopeActive: () => true,
      lookup: async () => null,
      verifyObject: async () => {
        preUploadVerifications += 1;
        throw new Error('A new poster key must not be verified before upload.');
      },
      uploadAtKey: async (input) => {
        uploadKeys.push(input.objectKey);
        return verifiedObject(input.objectKey);
      },
      finalize: async (submitted) => {
        finalizedRecords.push(submitted);
        return generationResult(record.operationId);
      },
    });

    const saved = await getPosterDelivery(record.operationId, makeScope(), database);
    assert.equal(result.status, 'synced');
    assert.deepEqual(uploadKeys, [record.outputs[0].storageKey]);
    assert.equal(preUploadVerifications, 0);
    assert.equal(finalizedRecords[0]?.operationId, record.operationId);
    assert.equal(finalizedRecords[0]?.verifiedOutputs[0].etag, 'poster-etag');
    assert.equal(saved?.status, 'synced');
    assert.equal(saved?.serverGenerationId, `generation-${record.operationId}`);
    assert.deepEqual(saved?.serverAssetIds, [`asset-${record.operationId}`]);
    assert.equal(saved?.leaseOwnerId, null);
  });
});

test('retry after finalize failure verifies and reuses the same uploaded object', async () => {
  await withDatabase(async (database) => {
    const record = makeRecord();
    await savePendingPosterDelivery(record, database);
    let objectExists = false;
    let retryVerifications = 0;
    const uploadKeys: string[] = [];
    let finalizeAttempts = 0;
    const dependencies = {
      database,
      repository: repository(),
      now: () => Date.parse(record.createdAt),
      isScopeActive: () => true,
      lookup: async () => null,
      verifyObject: async (key: string) => {
        retryVerifications += 1;
        return objectExists ? verifiedObject(key) : null;
      },
      uploadAtKey: async (input: { objectKey: string }) => {
        objectExists = true;
        uploadKeys.push(input.objectKey);
        return verifiedObject(input.objectKey);
      },
      finalize: async () => {
        finalizeAttempts += 1;
        if (finalizeAttempts === 1) throw new Error('temporary finalizer failure');
        return generationResult(record.operationId);
      },
    };

    const first = await runPosterDelivery(record.operationId, makeScope(), 'tab-a', dependencies);
    const afterFailure = await getPosterDelivery(record.operationId, makeScope(), database);
    const retry = await runPosterDelivery(record.operationId, makeScope(), 'tab-b', dependencies);
    const afterRetry = await getPosterDelivery(record.operationId, makeScope(), database);

    assert.equal(first.status, 'failed');
    assert.equal(first.status === 'failed' && first.stage, 'finalize');
    assert.equal(afterFailure?.status, 'failed');
    assert.equal(afterFailure?.verifiedOutputs[0].etag, 'poster-etag');
    assert.equal(retry.status, 'synced');
    assert.equal(afterRetry?.status, 'synced');
    assert.deepEqual(uploadKeys, [record.outputs[0].storageKey]);
    assert.equal(retryVerifications, 1);
    assert.equal(finalizeAttempts, 2);
  });
});

test('retry after upload failure reuses the saved operation and object key', async () => {
  await withDatabase(async (database) => {
    const record = makeRecord();
    await savePendingPosterDelivery(record, database);
    let uploadAttempts = 0;
    let finalizeAttempts = 0;
    const uploadKeys: string[] = [];
    const dependencies = {
      database,
      repository: repository(),
      now: () => Date.parse(record.createdAt),
      isScopeActive: () => true,
      lookup: async () => null,
      verifyObject: async () => null,
      uploadAtKey: async (input: { objectKey: string }) => {
        uploadAttempts += 1;
        uploadKeys.push(input.objectKey);
        if (uploadAttempts === 1) throw new Error('temporary upload transport failure');
        return verifiedObject(input.objectKey);
      },
      finalize: async () => {
        finalizeAttempts += 1;
        return generationResult(record.operationId);
      },
    };

    const first = await runPosterDelivery(record.operationId, makeScope(), 'tab-a', dependencies);
    const afterFailure = await getPosterDelivery(record.operationId, makeScope(), database);
    const retry = await runPosterDelivery(record.operationId, makeScope(), 'tab-b', dependencies);
    const afterRetry = await getPosterDelivery(record.operationId, makeScope(), database);

    assert.equal(first.status, 'failed');
    assert.equal(first.status === 'failed' && first.stage, 'upload');
    assert.equal(afterFailure?.status, 'failed');
    assert.match(afterFailure?.lastError ?? '', /temporary upload transport failure/);
    assert.equal(retry.status, 'synced');
    assert.equal(afterRetry?.status, 'synced');
    assert.equal(uploadAttempts, 2);
    assert.deepEqual(uploadKeys, [record.outputs[0].storageKey, record.outputs[0].storageKey]);
    assert.equal(finalizeAttempts, 1);
  });
});

test('lost finalize response is reconciled through operation lookup without another upload', async () => {
  await withDatabase(async (database) => {
    const record = makeRecord();
    await savePendingPosterDelivery(record, database);
    let committed: PosterGenerationResult | null = null;
    let uploadCount = 0;
    let finalizeCount = 0;
    const dependencies = {
      database,
      repository: repository(),
      now: () => Date.parse(record.createdAt),
      isScopeActive: () => true,
      lookup: async () => committed,
      verifyObject: async () => null,
      uploadAtKey: async (input: { objectKey: string }) => {
        uploadCount += 1;
        return verifiedObject(input.objectKey);
      },
      finalize: async () => {
        finalizeCount += 1;
        committed = generationResult(record.operationId);
        throw new Error('connection closed after server commit');
      },
    };

    const first = await runPosterDelivery(record.operationId, makeScope(), 'tab-a', dependencies);
    const retry = await runPosterDelivery(record.operationId, makeScope(), 'tab-b', dependencies);
    const saved = await getPosterDelivery(record.operationId, makeScope(), database);

    assert.equal(first.status, 'failed');
    assert.equal(retry.status, 'synced');
    assert.equal(uploadCount, 1);
    assert.equal(finalizeCount, 1);
    assert.equal(saved?.serverGenerationId, `generation-${record.operationId}`);
  });
});

test('reconciles a server commit after local completion write fails', async () => {
  await withDatabase(async (database) => {
    const record = makeRecord();
    await savePendingPosterDelivery(record, database);
    let committed: PosterGenerationResult | null = null;
    let uploadCount = 0;
    let finalizeCount = 0;
    let failNextCompletionWrite = true;
    const realRepository = repository();
    const failingRepository = {
      ...realRepository,
      update: (
        operationId: string,
        scope: PosterDeliveryScope,
        ownerId: string,
        progress: Parameters<typeof updateClaimedPosterDelivery>[3],
        now: number,
        db: PosterStudioDatabase,
      ) => {
        if (progress.status === 'synced' && failNextCompletionWrite) {
          failNextCompletionWrite = false;
          return Promise.resolve(null);
        }
        return realRepository.update(operationId, scope, ownerId, progress, now, db);
      },
    };
    const dependencies = {
      database,
      repository: failingRepository,
      now: () => Date.parse(record.createdAt),
      isScopeActive: () => true,
      lookup: async () => committed,
      verifyObject: async () => null,
      uploadAtKey: async (input: { objectKey: string }) => {
        uploadCount += 1;
        return verifiedObject(input.objectKey);
      },
      finalize: async () => {
        finalizeCount += 1;
        committed = generationResult(record.operationId);
        return committed;
      },
    };

    const first = await runPosterDelivery(record.operationId, makeScope(), 'tab-a', dependencies);
    const afterFailure = await getPosterDelivery(record.operationId, makeScope(), database);
    const retry = await runPosterDelivery(record.operationId, makeScope(), 'tab-b', dependencies);
    const afterRetry = await getPosterDelivery(record.operationId, makeScope(), database);

    assert.equal(first.status, 'failed');
    assert.equal(first.status === 'failed' && first.stage, 'finalize');
    assert.equal(afterFailure?.status, 'failed');
    assert.equal(afterFailure?.serverGenerationId, null);
    assert.equal(retry.status, 'synced');
    assert.equal(afterRetry?.status, 'synced');
    assert.equal(afterRetry?.serverGenerationId, `generation-${record.operationId}`);
    assert.equal(uploadCount, 1);
    assert.equal(finalizeCount, 1);
  });
});

test('rejects a server result that belongs to another operation', async () => {
  await withDatabase(async (database) => {
    const record = makeRecord();
    await savePendingPosterDelivery(record, database);
    const wrongOperation = generationResult('another-operation');
    const outcome = await runPosterDelivery(record.operationId, makeScope(), 'tab-a', {
      database,
      repository: repository(),
      now: () => Date.parse(record.createdAt),
      isScopeActive: () => true,
      lookup: async () => wrongOperation,
      finalize: async () => generationResult(record.operationId),
      verifyObject: async () => null,
      uploadAtKey: async (input: { objectKey: string }) => verifiedObject(input.objectKey),
    });

    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.status === 'failed' && outcome.stage, 'finalize');
    assert.equal((await getPosterDelivery(record.operationId, makeScope(), database))?.status, 'failed');
  });
});

test('renews the active tab lease during a long upload', async () => {
  await withDatabase(async (database) => {
    const record = makeRecord();
    await savePendingPosterDelivery(record, database);
    let clock = Date.parse(record.createdAt);
    let heartbeatUpdates = 0;
    let competitorClaim: PosterDeliveryRecord | null = null;
    const realRepository = repository();
    const heartbeatRepository = {
      ...realRepository,
      update: (operationId: string, scope: PosterDeliveryScope, ownerId: string, progress: Parameters<typeof updateClaimedPosterDelivery>[3], now: number, db: PosterStudioDatabase) => {
        if (Object.keys(progress).length === 1 && 'leaseExpiresAt' in progress) heartbeatUpdates += 1;
        return realRepository.update(operationId, scope, ownerId, progress, now, db);
      },
    };
    const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

    const outcome = await runPosterDelivery(record.operationId, makeScope(), 'tab-a', {
      database,
      repository: heartbeatRepository,
      now: () => clock,
      leaseDurationMs: 20,
      leaseHeartbeatIntervalMs: 2,
      isScopeActive: () => true,
      lookup: async () => null,
      verifyObject: async () => null,
      uploadAtKey: async (input) => {
        await wait(10);
        clock += 10;
        await wait(10);
        clock += 15;
        await wait(10);
        competitorClaim = await claimPosterDelivery(record.operationId, makeScope(), 'tab-b', clock, 20, database);
        return verifiedObject(input.objectKey);
      },
      finalize: async () => generationResult(record.operationId),
    });

    assert.equal(outcome.status, 'synced');
    assert.ok(heartbeatUpdates >= 2);
    assert.equal(competitorClaim, null);
  });
});

test('pauses delivery when account scope changes during operation lookup', async () => {
  await withDatabase(async (database) => {
    const record = makeRecord();
    await savePendingPosterDelivery(record, database);
    let scopeActive = true;
    let uploadCount = 0;
    const outcome = await runPosterDelivery(record.operationId, makeScope(), 'tab-a', {
      database,
      repository: repository(),
      now: () => Date.parse(record.createdAt),
      isScopeActive: () => scopeActive,
      lookup: async () => {
        scopeActive = false;
        return null;
      },
      finalize: async () => generationResult(record.operationId),
      verifyObject: async () => null,
      uploadAtKey: async (input) => {
        uploadCount += 1;
        return verifiedObject(input.objectKey);
      },
    });

    assert.equal(outcome.status, 'failed');
    assert.equal(uploadCount, 0);
    assert.match(outcome.status === 'failed' ? outcome.error : '', /Account or tenant changed/);
  });
});
