const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/core/utils/scheduleTabletLayout.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', code)(mod, mod.exports);
const { showScheduleCardActions } = mod.exports;

test('schedule card workflow actions are visible at constrained card-layout widths independent of device detection', () => {
  for (const width of [600, 700, 768, 1024, 1194, 1366, 1399]) {
    assert.equal(showScheduleCardActions(width), true, `${width}px card layout`);
  }
  for (const width of [390, 599, 1400, 1920]) {
    assert.equal(showScheduleCardActions(width), false, `${width}px phone or wide-table layout`);
  }
});
