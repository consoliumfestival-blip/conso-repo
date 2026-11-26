const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const helperPath = path.join(__dirname, '../src/core/utils/scheduleTopicSetup.ts');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helperModule = { exports: {} };
new Function('require', 'module', 'exports', compiled)(require, helperModule, helperModule.exports);
const { topicDurationMinutesToSeconds, topicPoolsMatch } = helperModule.exports;

test('participant duration accepts bounded whole minutes and stores seconds', () => {
  assert.equal(topicDurationMinutesToSeconds('5'), 300);
  assert.equal(topicDurationMinutesToSeconds('1'), 60);
  assert.equal(topicDurationMinutesToSeconds('1440'), 86400);
  for (const invalid of ['', '0', '1.5', '-1', '1441', '1e2', '  ']) {
    assert.equal(topicDurationMinutesToSeconds(invalid), null, `expected ${JSON.stringify(invalid)} to be rejected`);
  }
});

test('new-schedule topic retry recognizes the same saved pool regardless of database ordering', () => {
  assert.equal(topicPoolsMatch(
    [{ topic_text: ' First ' }, { topic_text: 'Second' }],
    [{ topic_text: 'Second ' }, { topic_text: 'First' }, { topic_text: '  ' }],
  ), true);
  assert.equal(topicPoolsMatch([{ topic_text: 'Same' }, { topic_text: 'Same' }], [{ topic_text: 'Same' }]), false);
  assert.equal(topicPoolsMatch([], [{ topic_text: 'Missing' }]), false);
  assert.equal(topicPoolsMatch([], [{ topic_text: '   ' }]), true);
});

test('topic setup migration validates duration and preserves the existing tenant-scoped topic save RPC', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/20261126070448_schedule_topic_participant_duration.sql'),
    'utf8',
  );
  assert.match(migration, /topic_draw_duration_seconds BETWEEN 60 AND 86400/);
  assert.match(migration, /topic_draw_duration_seconds % 60 = 0/);
  assert.match(migration, /public\.stage_assert_admin_access\(\)/);
  assert.match(migration, /v_schedule\.tenant_id <> v_actor_tenant_id/);
  assert.match(migration, /RETURN public\.admin_save_schedule_topics\(p_schedule_id, p_topics\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_save_schedule_topics\(uuid, jsonb, integer\) FROM PUBLIC, anon/);
});
