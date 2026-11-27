import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePreparedImage } from '../src/components/leaderboard/PosterStudio/Utils/imageCompressor.ts';

test('keeps the original when a prepared image does not materially reduce upload size', () => {
  const original = { size: 1_000, type: 'image/jpeg' };
  const prepared = { size: 920, type: 'image/jpeg' };

  assert.equal(choosePreparedImage(original, prepared), original);
});

test('uses a prepared image only when it reaches the minimum size saving', () => {
  const original = { size: 1_000, type: 'image/jpeg' };
  const prepared = { size: 900, type: 'image/jpeg' };

  assert.equal(choosePreparedImage(original, prepared), prepared);
});

test('keeps the source when a browser encoder changes the requested MIME type', () => {
  const original = { size: 1_000, type: 'image/png' };
  const prepared = { size: 100, type: 'image/jpeg' };

  assert.equal(choosePreparedImage(original, prepared), original);
});

test('keeps the source when the browser returns an empty prepared image', () => {
  const original = { size: 1_000, type: 'image/png' };
  const prepared = { size: 0, type: 'image/png' };

  assert.equal(choosePreparedImage(original, prepared), original);
});
