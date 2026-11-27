import assert from 'node:assert/strict';
import test from 'node:test';
import { isPosterDesignSnapshot, type PosterDesignSnapshot } from '../posterDesignSnapshot';

const validSnapshot: PosterDesignSnapshot = {
  snapshotVersion: 1,
  userId: 'user-1',
  tenantId: 'tenant-1',
  festivalId: 'festival-1',
  templateId: 'template-1',
  templateVersion: 1,
  itemId: 'item-1',
  resultId: 'result-1',
  width: 1080,
  height: 1350,
  backgroundAsset: null,
  backgroundTransform: null,
  layers: [],
  variables: { event_name: 'Final' },
  typographyMode: 'A',
  assetReferences: [],
  customFontReferences: [],
  sourceResultFingerprint: 'result-fingerprint',
  createdAt: '2026-11-26T00:00:00.000Z',
};

test('accepts a complete editable design snapshot', () => {
  assert.equal(isPosterDesignSnapshot(validSnapshot), true);
});

test('rejects a snapshot with an incomplete layer', () => {
  assert.equal(isPosterDesignSnapshot({ ...validSnapshot, layers: [{ id: 'layer-1' }] }), false);
});

test('rejects a snapshot without an official item or result', () => {
  assert.equal(isPosterDesignSnapshot({ ...validSnapshot, itemId: null, resultId: null }), false);
});
