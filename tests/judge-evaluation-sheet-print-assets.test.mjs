import assert from 'node:assert/strict';
import test from 'node:test';
import * as printAssets from '../src/core/utils/judgeEvaluationSheetPrint.ts';

test('waits until the QR and fully loaded logo are available before preparing the sheet', async () => {
  assert.equal(typeof printAssets.waitForJudgeEvaluationSheetAssets, 'function');
  let frame = 0;
  const qr = {};
  const logo = { complete: true, naturalWidth: 48 };

  const assets = await printAssets.waitForJudgeEvaluationSheetAssets(
    () => frame < 3 ? { qr: null, logo: null } : { qr, logo },
    async () => { frame += 1; },
    5,
  );

  assert.equal(assets.qr, qr);
  assert.equal(assets.logo, logo);
  assert.equal(frame, 3);
});

test('does not treat a failed logo load as ready', async () => {
  assert.equal(typeof printAssets.waitForJudgeEvaluationSheetAssets, 'function');
  await assert.rejects(
    printAssets.waitForJudgeEvaluationSheetAssets(
      () => ({ qr: {}, logo: { complete: true, naturalWidth: 0 } }),
      async () => {},
      2,
    ),
    /QR code or logo did not finish loading/i,
  );
});
