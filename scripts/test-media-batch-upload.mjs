import test from 'node:test';
import assert from 'node:assert/strict';
import {
  abortableSleep,
  buildMediaFingerprint,
  cleanMediaFileTitle,
  generateUniqueRenderHash,
  runMediaBatchUpload,
} from '../src/services/storage/mediaBatchUploadCore.ts';

function makeFakeFile(name, size = 1024, type = 'image/jpeg') {
  const blob = new Blob([new Uint8Array(size)], { type });
  return Object.assign(blob, { name, lastModified: 1700000000000 });
}

test('buildMediaFingerprint and cleanMediaFileTitle format identifiers and titles safely', () => {
  assert.equal(buildMediaFingerprint({ name: ' Stage_01.JPG ', size: 4200 }), 'stage_01.jpg::4200');
  assert.equal(cleanMediaFileTitle('C:\\photos\\day_2-stage_shot.png'), 'day 2 stage shot');
  assert.equal(cleanMediaFileTitle('folder/img-09.webp', 'Finals'), 'Finals - img 09');
  assert.equal(cleanMediaFileTitle('...png', ''), 'Media Photo');

  const h1 = generateUniqueRenderHash('manual_media');
  const h2 = generateUniqueRenderHash('manual_media');
  assert.match(h1, /^manual_media_/);
  assert.notEqual(h1, h2);
});

test('filters non-images, skips intra-batch and existing duplicates, chunks into 10-item batches, and guards invalid batchSize/concurrency', async () => {
  const files = [
    makeFakeFile('notes.txt', 100, 'text/plain'),
    makeFakeFile('dup_existing.jpg', 500, 'image/jpeg'),
    makeFakeFile('photo_1.jpg', 600, 'image/jpeg'),
    makeFakeFile('photo_1.jpg', 600, 'image/jpeg'), // intra-batch dup
    ...Array.from({ length: 22 }, (_, i) => makeFakeFile(`img_${i + 2}.png`, 700 + i, 'image/png')),
  ];

  const insertedBatches = [];
  let uploads = 0;

  const res = await runMediaBatchUpload(
    {
      files,
      festivalId: 'fest-1',
      tenantId: 'tenant-1',
      existingFingerprints: new Set(['dup_existing.jpg::500']),
      batchSize: 10,
      concurrency: 3,
    },
    {
      convertToDualWebp: async (file) => ({
        hdBlob: new Blob([new Uint8Array(10)], { type: 'image/webp' }),
        hdExt: 'webp',
        thumbBlob: new Blob([new Uint8Array(5)], { type: 'image/webp' }),
      }),
      uploadObject: async ({ extension }) => {
        uploads++;
        return {
          object_key: `festivals/fest-1/posters/gen_${uploads}.${extension}`,
          file_url: `r2://festivals/fest-1/posters/gen_${uploads}.${extension}`,
        };
      },
      insertAssets: async (rows) => {
        insertedBatches.push(rows);
      },
      deleteObject: async () => {},
    },
  );

  assert.equal(res.completed, 23);
  assert.equal(res.failed, 0);
  assert.equal(res.skipped, 3); // notes.txt + dup_existing + intra-batch dup
  assert.equal(res.cancelled, false);
  assert.deepEqual(res.errors, []);
  assert.equal(insertedBatches.length, 3);
  assert.equal(insertedBatches[0].length, 20); // 10 hd + 10 thumb
  assert.equal(insertedBatches[1].length, 20); // 10 hd + 10 thumb
  assert.equal(insertedBatches[2].length, 6);  // 3 hd + 3 thumb

  // Unique render hashes across all 23 uploaded items
  const uniqueHashes = new Set(insertedBatches.flat().map((r) => r.render_hash));
  assert.equal(uniqueHashes.size, 23);

  // Guard invalid batchSize / concurrency (0, NaN, -5) -> clamps safely to >= 1
  const guardInserts = [];
  const guardRes = await runMediaBatchUpload(
    {
      files: [makeFakeFile('a.jpg', 100), makeFakeFile('b.jpg', 101)],
      festivalId: 'fest-1',
      tenantId: 'tenant-1',
      batchSize: Number.NaN,
      concurrency: -4,
    },
    {
      convertToDualWebp: async () => ({
        hdBlob: new Blob([new Uint8Array(5)], { type: 'image/webp' }),
        hdExt: 'webp',
        thumbBlob: null,
      }),
      uploadObject: async () => ({ object_key: 'festivals/fest-1/posters/k.webp', file_url: 'r2://k.webp' }),
      insertAssets: async (rows) => { guardInserts.push(rows); },
      deleteObject: async () => {},
    },
  );
  assert.equal(guardRes.completed, 2);
  assert.equal(guardInserts.length, 1); // fallback DEFAULT_BATCH_SIZE=10
});

test('accounts DB bulk-insert failure against failed (not completed) and deletes orphaned R2 objects', async () => {
  const deletedKeys = [];
  let seq = 0;

  const res = await runMediaBatchUpload(
    {
      files: [makeFakeFile('one.jpg', 100), makeFakeFile('two.jpg', 101)],
      festivalId: 'fest-1',
      tenantId: 'tenant-1',
      batchSize: 10,
      concurrency: 2,
    },
    {
      convertToDualWebp: async () => ({
        hdBlob: new Blob([new Uint8Array(10)], { type: 'image/webp' }),
        hdExt: 'webp',
        thumbBlob: new Blob([new Uint8Array(5)], { type: 'image/webp' }),
      }),
      uploadObject: async () => {
        seq++;
        return { object_key: `festivals/fest-1/posters/obj_${seq}.webp`, file_url: `r2://obj_${seq}.webp` };
      },
      insertAssets: async () => {
        const abortFast = new Error('permission denied for table generated_assets');
        abortFast.name = 'Error';
        throw abortFast;
      },
      deleteObject: async (key) => {
        deletedKeys.push(key);
      },
    },
  );

  assert.equal(res.completed, 0);
  assert.equal(res.failed, 2);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /Batch 1 DB save failed/);
  assert.equal(deletedKeys.length, 4); // 2 hd + 2 thumb cleaned up
});

test('propagates AbortError during thumbnail upload, aborts backoff sleep immediately, and emits lastBatchIndex', async () => {
  // 1. Abortable sleep rejects immediately when signal aborts
  const sleepCtrl = new AbortController();
  const sleepStart = Date.now();
  const sleepPromise = abortableSleep(5000, sleepCtrl.signal);
  setTimeout(() => sleepCtrl.abort(), 15);
  await assert.rejects(sleepPromise, { name: 'AbortError' });
  assert.ok(Date.now() - sleepStart < 1000);

  // 2. Abort during thumbnail upload does not swallow cancellation and emits lastBatchIndex = 1 (not totalBatches = 3)
  const batchCtrl = new AbortController();
  const progressEvents = [];
  const inserted = [];
  const abortedDeletedKeys = [];

  const res = await runMediaBatchUpload(
    {
      files: [makeFakeFile('f1.jpg', 10), makeFakeFile('f2.jpg', 11), makeFakeFile('f3.jpg', 12)],
      festivalId: 'fest-1',
      tenantId: 'tenant-1',
      batchSize: 1,
      concurrency: 1,
      signal: batchCtrl.signal,
      onProgress: (p) => progressEvents.push(p),
    },
    {
      convertToDualWebp: async () => ({
        hdBlob: new Blob([new Uint8Array(10)], { type: 'image/webp' }),
        hdExt: 'webp',
        thumbBlob: new Blob([new Uint8Array(5)], { type: 'image/webp' }),
      }),
      uploadObject: async ({ blob }) => {
        if (blob.size === 5) {
          batchCtrl.abort();
          const err = new Error('Upload cancelled');
          err.name = 'AbortError';
          throw err;
        }
        return { object_key: 'festivals/fest-1/posters/hd.webp', file_url: 'r2://hd.webp' };
      },
      insertAssets: async (rows) => { inserted.push(rows); },
      deleteObject: async (key) => { abortedDeletedKeys.push(key); },
    },
  );

  assert.equal(res.cancelled, true);
  assert.equal(res.completed, 0);
  assert.equal(inserted.length, 0);
  assert.deepEqual(abortedDeletedKeys, ['festivals/fest-1/posters/hd.webp']);
  const lastEvent = progressEvents.at(-1);
  assert.equal(lastEvent.totalBatches, 3);
  assert.equal(lastEvent.batchIndex, 1);
});
