const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/core/utils/scheduleTabletLayout.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', code)(mod, mod.exports);
const { showScheduleCardActions, getCompactScheduleActionOrientation, getScheduleActionRows, shouldShowTabletLandscapeScheduleCategory, shouldUseTabletScheduleTable } = mod.exports;

test('schedule card workflow actions are visible at constrained card-layout widths independent of device detection', () => {
  for (const width of [600, 700, 768, 1024, 1194, 1366, 1399]) {
    assert.equal(showScheduleCardActions(width), true, `${width}px card layout`);
  }
  for (const width of [390, 599, 1400, 1920]) {
    assert.equal(showScheduleCardActions(width), false, `${width}px phone or wide-table layout`);
  }
});

test('compact schedule action layout covers tablets and small laptop viewports while preserving phone and wide desktop layouts', () => {
  assert.equal(getCompactScheduleActionOrientation(true, 768, 1024, 768, 1024, 0), 'portrait');
  assert.equal(getCompactScheduleActionOrientation(true, 1024, 768, 1024, 768, 0), 'landscape');
  assert.equal(getCompactScheduleActionOrientation(false, 768, 1024, 768, 1024, 5), 'portrait');
  assert.equal(getCompactScheduleActionOrientation(false, 1024, 768, 1024, 1668, 5), 'landscape', 'large tablet screen');
  assert.equal(getCompactScheduleActionOrientation(false, 1280, 800, 1920, 1080, 0), 'landscape', 'small laptop viewport');
  assert.equal(getCompactScheduleActionOrientation(false, 844, 390, 390, 844, 5), null, 'phone landscape');
  assert.equal(getCompactScheduleActionOrientation(false, 1024, 768, 1920, 1080, 0), 'landscape', 'constrained desktop viewport');
  assert.equal(getCompactScheduleActionOrientation(true, 599, 900, 768, 1024, 0), null, 'below tablet content width');
  assert.equal(getCompactScheduleActionOrientation(true, 1400, 900, 1400, 900, 0), null, 'wide desktop table');
});

test('compact schedule actions are arranged as two buttons in each of two rows', () => {
  assert.deepEqual(getScheduleActionRows(['Check-in', 'Codes', 'Marks', 'Results']), [
    ['Check-in', 'Codes'],
    ['Marks', 'Results'],
  ]);
});

test('small tablet schedules use cards while wider tablets retain the row table', () => {
  for (const width of [600, 768, 1024, 1194, 1199]) {
    assert.equal(shouldUseTabletScheduleTable(true, width), false, `${width}px tablet uses cards`);
  }
  for (const width of [1200, 1280, 1376, 1399]) {
    assert.equal(shouldUseTabletScheduleTable(true, width), true, `${width}px tablet keeps table`);
  }
  assert.equal(shouldUseTabletScheduleTable(false, 1024), false, 'non-tablet does not switch layout by this rule');
});

test('schedule categories are shown only in the tablet landscape table layout', () => {
  assert.equal(shouldShowTabletLandscapeScheduleCategory(true, 'landscape'), true);
  assert.equal(shouldShowTabletLandscapeScheduleCategory(true, 'portrait'), false);
  assert.equal(shouldShowTabletLandscapeScheduleCategory(false, 'landscape'), false);
  assert.equal(shouldShowTabletLandscapeScheduleCategory(false, null), false);
});
