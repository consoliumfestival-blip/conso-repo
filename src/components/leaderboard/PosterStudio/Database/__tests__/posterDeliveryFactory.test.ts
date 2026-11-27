import test from 'node:test';
import assert from 'node:assert/strict';
import type { LayerData } from '../../Stores/layerStore';
import type { PosterAssetReference } from '../posterDesignSnapshot';
import {
  createPendingPosterDelivery,
  createPosterDesignSnapshot,
  stablePosterAssetReference,
} from '../../Services/posterDeliveryFactory';

const tenantId = '10000000-0000-4000-8000-000000000001';
const festivalId = '20000000-0000-4000-8000-000000000002';
const templateId = '30000000-0000-4000-8000-000000000003';

test('creates an immutable snapshot with stable asset and custom font references', () => {
  const layers = [
    { id: 'text', type: 'text', name: 'Title', text: '{event_name}', fontFamily: 'Tenant Malayalam', x: 0, y: 0, width: 100, height: 40 },
    { id: 'logo', type: 'image', name: 'Logo', src: 'https://cdn.example.test/festivals/festival-a/logos/logo.png?signature=expired', x: 4, y: 4, width: 32, height: 32 },
  ] as LayerData[];
  const customFontReferences: PosterAssetReference[] = [{
    assetKey: 'tenants/tenant-a/fonts/malayalam.woff2',
    assetId: 'font-record-a',
    contentType: 'font/woff2',
    fontFamily: 'Tenant Malayalam',
  }];
  const snapshot = createPosterDesignSnapshot({
    scope: { userId: 'user-a', tenantId, festivalId },
    template: {
      id: templateId,
      template_version: 4,
      width: 1080,
      height: 1350,
      background_url: 'https://cdn.example.test/festivals/festival-a/background.jpg?signature=expired',
      background_transform: { scale: 1.2, x: -4, y: 8 },
    },
    itemId: 'item-a',
    resultId: 'result-a',
    layers,
    variables: { event_name: 'POOJA' },
    typographyMode: 'A',
    sourceResultFingerprint: 'source-a',
    customFontReferences,
    createdAt: '2026-11-26T00:00:00.000Z',
  });
  layers[0].text = 'changed after snapshot';

  assert.equal(snapshot.layers[0].text, '{event_name}');
  assert.equal(snapshot.layers[1].src, 'https://cdn.example.test/festivals/festival-a/logos/logo.png');
  assert.equal(snapshot.backgroundAsset?.assetKey, 'https://cdn.example.test/festivals/festival-a/background.jpg');
  assert.deepEqual(snapshot.assetReferences.map((reference) => reference.assetKey), [
    'https://cdn.example.test/festivals/festival-a/background.jpg',
    'https://cdn.example.test/festivals/festival-a/logos/logo.png',
  ]);
  assert.equal(snapshot.customFontReferences[0].fontFamily, 'Tenant Malayalam');
  assert.equal(stablePosterAssetReference('r2:///a/b.png')?.assetKey, 'a/b.png');
  assert.equal(stablePosterAssetReference('data:image/png;base64,abc'), null);
});

test('creates one persisted output descriptor with the captured dimensions and stable key', () => {
  const operationId = '40000000-0000-4000-8000-000000000004';
  const snapshot = createPosterDesignSnapshot({
    scope: { userId: 'user-a', tenantId, festivalId },
    template: {
      id: templateId,
      template_version: 1,
      width: 1080,
      height: 1080,
      background_url: 'r2://festivals/festival-a/background.jpg',
    },
    itemId: 'item-a',
    resultId: 'result-a',
    layers: [],
    variables: {},
    typographyMode: 'A',
    sourceResultFingerprint: 'source-a',
  });
  const blob = new Blob(['poster image'], { type: 'image/jpeg' });
  const record = createPendingPosterDelivery({
    operationId,
    scope: { userId: 'user-a', tenantId, festivalId },
    snapshot,
    blob,
    width: 2160,
    height: 2160,
    createdAt: '2026-11-26T00:00:00.000Z',
  });

  assert.equal(record.outputs.length, 1);
  assert.equal(record.outputs[0].blob, blob);
  assert.equal(record.outputs[0].width, 2160);
  assert.equal(record.outputs[0].height, 2160);
  assert.deepEqual(record.outputs[0].resolutions, ['hd', 'standard']);
  assert.equal(record.outputs[0].storageKey, `cons-assets/posters/${festivalId}/${operationId}/poster.jpg`);
  assert.deepEqual(record.snapshot.assetReferences, [{ assetKey: 'festivals/festival-a/background.jpg' }]);
  assert.deepEqual(record.missingSourceAssetKeys, []);
});
