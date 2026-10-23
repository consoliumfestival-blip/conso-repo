/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const helperPath = path.join(__dirname, '../src/core/utils/teamDashboardFlow.ts');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helperModule = { exports: {} };
const scheduleLifecyclePath = path.join(__dirname, '../src/core/utils/scheduleLifecycle.ts');
const scheduleLifecycleSource = fs.readFileSync(scheduleLifecyclePath, 'utf8');
const scheduleLifecycleCompiled = ts.transpileModule(scheduleLifecycleSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const scheduleLifecycleModule = { exports: {} };
new Function('require', 'module', 'exports', scheduleLifecycleCompiled)(require, scheduleLifecycleModule, scheduleLifecycleModule.exports);
const helperRequire = (specifier) => {
  if (specifier === '@/core/utils/scheduleLifecycle') return scheduleLifecycleModule.exports;
  return require(specifier);
};
new Function('require', 'module', 'exports', compiled)(helperRequire, helperModule, helperModule.exports);
const { getTeamDashboardEventsToday, getTeamDashboardUpcomingEvents, isTeamEventInProgress } = helperModule.exports;

function event(id, values = {}) {
  return {
    schedule_id: id,
    item_id: `item-${id}`,
    item_code: id,
    item_name: id,
    category_codes: [],
    venue_name: null,
    start_time: null,
    end_time: null,
    event_status: 'scheduled',
    participant_count: 0,
    checked_in_count: 0,
    ...values,
  };
}

test('dashboard includes live and upcoming events, keeps untimed entries, and excludes completed or ended events', () => {
  const now = Date.parse('2026-10-23T12:00:00.000Z');
  const rows = [
    event('active', { start_time: '2026-10-23T11:00:00.000Z', end_time: '2026-10-23T12:45:00.000Z', event_status: 'ongoing' }),
    event('in-progress', { start_time: '2026-10-23T11:00:00.000Z', event_status: 'in_progress' }),
    event('upcoming', { start_time: '2026-10-24T09:00:00.000Z' }),
    event('untimed'),
    event('completed', { start_time: '2026-10-24T10:00:00.000Z', event_status: 'completed' }),
    event('ended', { start_time: '2026-10-23T09:00:00.000Z', end_time: '2026-10-23T11:00:00.000Z' }),
    event('stale-live', { start_time: '2026-10-23T09:00:00.000Z', end_time: '2026-10-23T11:00:00.000Z', event_status: 'ongoing' }),
  ];

  assert.deepEqual(getTeamDashboardUpcomingEvents(rows, now).map((row) => row.schedule_id), [
    'active', 'in-progress', 'upcoming', 'untimed',
  ]);
  assert.equal(isTeamEventInProgress(rows[0], now), true);
  assert.equal(isTeamEventInProgress(rows[2], now), false);
  assert.deepEqual(getTeamDashboardUpcomingEvents(rows, now, 2).map((row) => row.schedule_id), ['active', 'in-progress']);
});

test("today's dashboard count includes events crossing midnight and excludes other days or untimed events", () => {
  const now = Date.parse('2026-10-23T12:00:00.000Z');
  const localToday = new Date(now);
  const dayStart = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate()).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const rows = [
    event('cross-midnight', { start_time: new Date(dayStart - 30 * 60 * 1000).toISOString(), end_time: new Date(dayStart + 30 * 60 * 1000).toISOString() }),
    event('today', { start_time: new Date(dayStart + 60 * 60 * 1000).toISOString() }),
    event('tomorrow', { start_time: new Date(dayEnd + 60 * 60 * 1000).toISOString() }),
    event('untimed'),
  ];

  assert.deepEqual(getTeamDashboardEventsToday(rows, now).map((row) => row.schedule_id), ['cross-midnight', 'today']);
});
