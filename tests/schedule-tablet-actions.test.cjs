const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/core/utils/scheduleTabletLayout.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', code)(mod, mod.exports);
const { showTabletScheduleActions, isIpadDesktopMode } = mod.exports;

test('tablet actions support tablet portrait and landscape while preserving desktop and phone layouts', () => {
  for (const [width, height] of [[600, 960], [768, 1024], [1024, 768], [1194, 834], [1366, 1024]]) {
    assert.equal(showTabletScheduleActions(true, width, height), true, `${width}x${height}`);
    assert.equal(showTabletScheduleActions(false, width, height), false, `desktop ${width}x${height}`);
  }
  assert.equal(showTabletScheduleActions(false, 390, 844), false);
  assert.equal(showTabletScheduleActions(false, 844, 390), false);
  assert.equal(showTabletScheduleActions(true, 599, 960), false);
  assert.equal(showTabletScheduleActions(true, 1400, 900), false);
  assert.equal(showTabletScheduleActions(true, 1024, 599), false);
});

test('iPad desktop mode and tablet emulation are detected with a single touch point', () => {
  assert.equal(isIpadDesktopMode('MacIntel', 1), true);
  assert.equal(isIpadDesktopMode('MacIntel', 0), false);
  assert.equal(isIpadDesktopMode('Win32', 10), false);
});
