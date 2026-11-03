const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/core/utils/scheduleTabletLayout.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', code)(mod, mod.exports);
const { showScheduleCardActions, getTabletScheduleOrientation, getTabletScheduleActionRows } = mod.exports;

test('schedule card workflow actions are visible at constrained card-layout widths independent of device detection', () => {
  for (const width of [600, 700, 768, 1024, 1194, 1366, 1399]) {
    assert.equal(showScheduleCardActions(width), true, `${width}px card layout`);
  }
  for (const width of [390, 599, 1400, 1920]) {
    assert.equal(showScheduleCardActions(width), false, `${width}px phone or wide-table layout`);
  }
});

test('tablet card redesign distinguishes portrait and landscape without changing phone or desktop layouts', () => {
  assert.equal(getTabletScheduleOrientation(true, 768, 1024, 768, 1024, 0), 'portrait');
  assert.equal(getTabletScheduleOrientation(true, 1024, 768, 1024, 768, 0), 'landscape');
  assert.equal(getTabletScheduleOrientation(false, 768, 1024, 768, 1024, 5), 'portrait');
  assert.equal(getTabletScheduleOrientation(false, 1024, 768, 1024, 768, 5), 'landscape');
  assert.equal(getTabletScheduleOrientation(false, 844, 390, 844, 390, 5), null, 'phone landscape');
  assert.equal(getTabletScheduleOrientation(false, 1024, 768, 1920, 1080, 0), null, 'desktop viewport');
  assert.equal(getTabletScheduleOrientation(true, 599, 900, 768, 1024, 0), null, 'below tablet content width');
  assert.equal(getTabletScheduleOrientation(true, 1400, 900, 1400, 900, 0), null, 'wide desktop table');
});

test('tablet schedule actions are arranged as two buttons in each of two rows', () => {
  assert.deepEqual(getTabletScheduleActionRows(['Check-in', 'Codes', 'Marks', 'Results']), [
    ['Check-in', 'Codes'],
    ['Marks', 'Results'],
  ]);
});
