const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/core/utils/groupParticipation.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exported });

test('General Individual stays in Individual while every group category uses Group items', () => {
  for (const code of ['GN', 'HS', 'UP']) {
    assert.equal(exported.isGroupCompetition({ participation_type: 'individual', category_codes: [code] }), false);
    assert.equal(exported.isGroupCompetition({ participation_type: 'group', category_codes: [code] }), true);
  }
});

test('General welcomes existing categories, ordinary groups keep category eligibility', () => {
  assert.equal(exported.matchesCompetitionCategory('HS', 'GN'), true);
  assert.equal(exported.matchesCompetitionCategory('UP', 'GENERAL'), true);
  assert.equal(exported.matchesCompetitionCategory('HS', 'UP'), false);
  assert.equal(exported.matchesCompetitionCategory('JUNIOR', 'JR'), true);
});

test('group display uses leader chest with a legacy fallback', () => {
  assert.equal(exported.groupEntryChest({ leader: { chest_number: '102' }, entry_chest_number: 'GE-1' }), '102');
  assert.equal(exported.groupEntryChest({ leader: null, entry_chest_number: 'GE-1' }), 'GE-1');
});

test('old completion stays visible until a current group completion is saved', () => {
  const old = { item_id: 'item', category_code: 'HS', entry_kind: 'participant', is_complete: true };
  assert.equal(exported.programIntakeComplete([old], 'item', 'HS', 'general_team'), true);
  assert.equal(exported.programIntakeComplete([old, { ...old, entry_kind: 'general_team', is_complete: false }], 'item', 'HS', 'general_team'), false);
});
