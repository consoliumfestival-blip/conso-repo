const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/core/utils/codeLetters.ts'), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext },
}).outputText, context);
const { codeLetterAt, codeLetterOrder, compareCodeLetters, codeLetterPreview, codeLetterTarget } = context.exports;

test('code letters continue in bijective base 26 and sort numerically', () => {
  const cases = [[0, 'A'], [25, 'Z'], [26, 'AA'], [51, 'AZ'], [52, 'BA'], [701, 'ZZ'], [702, 'AAA']];
  for (const [index, label] of cases) {
    assert.equal(codeLetterAt(index), label);
    assert.equal(codeLetterOrder(label), BigInt(index));
  }
  assert.deepEqual(['AA', 'Z', 'AB', 'A'].sort(compareCodeLetters), ['A', 'Z', 'AA', 'AB']);
});

test('printable labels and manual edit matching support multi-letter codes', () => {
  assert.equal(codeLetterAt(26), 'AA');
  assert.equal(codeLetterAt(27), 'AB');
  assert.equal(codeLetterAt(89), 'CL');
  assert.equal(codeLetterPreview('Z', 'AA'), 'Z → AA. This letter will stay fixed during draws and redraws.');
  assert.equal(codeLetterTarget([
    { id: 'target', code_letter: 'AA', status: 'approved', is_verified: true },
  ], 'source', 'aa')?.id, 'target');
  assert.throws(() => codeLetterAt(-1), error => error.name === 'RangeError');
  assert.throws(() => codeLetterOrder('A1'));
});
