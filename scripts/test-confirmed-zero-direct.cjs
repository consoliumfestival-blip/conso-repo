const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('src/core/utils/completeDirectMarks.ts', 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
vm.runInNewContext(output, { module: loaded, exports: loaded.exports });
const { completeDirectMarks } = loaded.exports;

test('fills absent judge slots while preserving entered scores and the original state', () => {
  const current = { 1: 15, 2: 0 };
  const completed = completeDirectMarks(current, 3);
  assert.equal(completed[1], 15);
  assert.equal(completed[2], 0);
  assert.equal(completed[3], 0);
  assert.equal(current[3], undefined);
});

test('supports an entirely blank roster entry and rejects an invalid judge count', () => {
  const completed = completeDirectMarks({}, 2);
  assert.equal(completed[1], 0);
  assert.equal(completed[2], 0);
  assert.throws(() => completeDirectMarks({}, 0));
});
