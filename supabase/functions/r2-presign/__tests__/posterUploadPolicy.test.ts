import test from 'node:test';
import assert from 'node:assert/strict';
import { isPosterGenerationObjectKey, posterGenerationPutConditions } from '../posterUploadPolicy';

test('uses create-only R2 writes for immutable Poster Studio generation keys', () => {
  const key = 'cons-assets/posters/123e4567-e89b-12d3-a456-426614174000/123e4567-e89b-12d3-a456-426614174001/poster.jpg';
  assert.equal(isPosterGenerationObjectKey(key), true);
  assert.deepEqual(posterGenerationPutConditions(key), { IfNoneMatch: '*' });
});

test('keeps immutable retries for operations saved with the legacy generation path', () => {
  const legacyKey = 'festivals/123e4567-e89b-12d3-a456-426614174000/posters/123e4567-e89b-12d3-a456-426614174001/poster.jpg';
  assert.equal(isPosterGenerationObjectKey(legacyKey), true);
  assert.deepEqual(posterGenerationPutConditions(legacyKey), { IfNoneMatch: '*' });
});

test('preserves overwrite behavior for existing generic poster upload paths', () => {
  const legacyKey = 'festivals/123e4567-e89b-12d3-a456-426614174000/posters/generated_event.jpg';
  assert.equal(isPosterGenerationObjectKey(legacyKey), false);
  assert.deepEqual(posterGenerationPutConditions(legacyKey), {});
});
