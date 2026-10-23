/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const helperPath = path.join(__dirname, '../src/core/utils/scheduleLifecycle.ts');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helperModule = { exports: {} };
new Function('require', 'module', 'exports', compiled)(require, helperModule, helperModule.exports);
const { getCompletedScheduleCount, getScheduleLifecycleLabel, normalizeScheduleLifecycleStatus } = helperModule.exports;

test('schedule lifecycle status maps legacy live states to Started and preserves unknown display values', () => {
  assert.equal(normalizeScheduleLifecycleStatus(' scheduled '), 'scheduled');
  assert.equal(normalizeScheduleLifecycleStatus('in_progress'), 'ongoing');
  assert.equal(normalizeScheduleLifecycleStatus('LIVE'), 'ongoing');
  assert.equal(normalizeScheduleLifecycleStatus('completed'), 'completed');
  assert.equal(normalizeScheduleLifecycleStatus('finished'), 'completed');
  assert.equal(normalizeScheduleLifecycleStatus('published'), null);
  assert.equal(getScheduleLifecycleLabel('ongoing'), 'Started');
  assert.equal(getScheduleLifecycleLabel('published'), 'published');
});

test('completed-event total counts only completed schedule rows', () => {
  assert.equal(getCompletedScheduleCount([
    { event_status: 'scheduled' },
    { event_status: 'ongoing' },
    { event_status: 'completed' },
    { event_status: ' COMPLETED ' },
  ]), 2);
  assert.equal(getCompletedScheduleCount([]), 0);
});

test('schedule status RPCs restrict values, scope mutations, and audit the changed schedule', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/20261023120000_schedule_lifecycle_status.sql'),
    'utf8',
  );
  assert.equal((migration.match(/v_status IS NULL OR v_status NOT IN \('scheduled', 'ongoing', 'completed'\)/g) || []).length, 2);
  assert.match(migration, /public\.stage_assert_admin_access\(\)/);
  assert.match(migration, /s\.tenant_id = v_tenant_id/);
  assert.match(migration, /stage_portal_private\.assert_pin\(p_venue_id, p_pin\)/);
  assert.match(migration, /s\.venue_id = p_venue_id/);
  assert.match(migration, /schedule_lifecycle_status_updated/);
  assert.match(migration, /stage_venue_schedule_status_updated/);
});
