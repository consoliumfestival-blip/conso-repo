const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const helperSource = fs.readFileSync(path.join(__dirname, '../src/core/utils/scheduleJudgePanelRules.ts'), 'utf8');
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helperModule = { exports: {} };
new Function('require', 'module', 'exports', compiled)(require, helperModule, helperModule.exports);
const rules = helperModule.exports;

test('judge panel uses only a valid required slot count and preserves the existing default of three', () => {
  assert.equal(rules.getRequiredJudgeCount(4), 4);
  assert.equal(rules.getRequiredJudgeCount(0), 3);
  assert.equal(rules.getRequiredJudgeCount(6), 3);
  assert.equal(rules.getRequiredJudgeCount(null), 3);
});

test('any existing judge can be added, already assigned judges can be removed, and capacity is enforced', () => {
  assert.deepEqual(rules.toggleAssignedJudge(['judge-a'], 'judge-b', 2), {
    judgeIds: ['judge-a', 'judge-b'], changed: true,
  });
  assert.deepEqual(rules.toggleAssignedJudge(['judge-a', 'judge-b'], 'judge-c', 2), {
    judgeIds: ['judge-a', 'judge-b'], changed: false,
  });
  assert.deepEqual(rules.toggleAssignedJudge(['judge-a', 'judge-b'], 'judge-a', 1), {
    judgeIds: ['judge-b'], changed: true,
  });
});
