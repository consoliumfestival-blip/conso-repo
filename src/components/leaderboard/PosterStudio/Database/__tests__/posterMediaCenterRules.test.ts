import test from 'node:test';
import assert from 'node:assert/strict';
import type { PosterDeliveryRecord } from '../posterDesignSnapshot';
import { shouldShowLocalPosterDelivery } from '../../Services/posterMediaCenterRules';

function makeDelivery(overrides: Partial<PosterDeliveryRecord> = {}): PosterDeliveryRecord {
  return {
    operationId: 'operation-a',
    userId: 'user-a',
    tenantId: 'tenant-a',
    festivalId: 'festival-a',
    snapshot: { itemId: 'item-a', resultId: 'result-a' } as PosterDeliveryRecord['snapshot'],
    outputs: [{ outputId: 'poster', storageKey: 'festivals/festival-a/posters/operation-a/poster.jpg' } as PosterDeliveryRecord['outputs'][number]],
    sourceAssets: [],
    missingSourceAssetKeys: [],
    status: 'pending_upload',
    stage: 'upload',
    attemptCount: 0,
    createdAt: '2026-11-26T00:00:00.000Z',
    updatedAt: '2026-11-26T00:00:00.000Z',
    leaseOwnerId: null,
    leaseExpiresAt: null,
    verifiedOutputs: [],
    serverGenerationId: null,
    serverAssetIds: [],
    lastError: null,
    ...overrides,
  };
}

test('keeps a pending local revision beside the existing current cloud poster', () => {
  const pending = makeDelivery();
  assert.equal(shouldShowLocalPosterDelivery(
    pending,
    new Set(['festivals/festival-a/posters/old-operation/poster.jpg']),
    new Set(['old-asset']),
    true,
  ), true);
});

test('hides a locally failed poster when cloud metadata proves the same object committed', () => {
  const responseLost = makeDelivery({ status: 'failed', stage: 'finalize' });
  assert.equal(shouldShowLocalPosterDelivery(
    responseLost,
    new Set([responseLost.outputs[0].storageKey]),
    new Set(),
    true,
  ), false);
});

test('uses the local image offline but replaces a synced placeholder when cloud data returns', () => {
  const synced = makeDelivery({ status: 'synced', serverAssetIds: ['asset-a'] });
  assert.equal(shouldShowLocalPosterDelivery(synced, new Set(), new Set(), false), true);
  assert.equal(shouldShowLocalPosterDelivery(synced, new Set(), new Set(), true), false);
  assert.equal(shouldShowLocalPosterDelivery(synced, new Set(), new Set(['asset-a']), false), false);
});
