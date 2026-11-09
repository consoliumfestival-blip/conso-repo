import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleLocalDateKey, sortStageSchedulesAroundToday } from '../src/core/utils/stageScheduleDate.ts';

const at = (day, hour) => new Date(2026, 10, day, hour).toISOString();

test('Stage calendars use local dates and put today first without hiding other days', () => {
  const now = new Date(2026, 10, 7, 12).getTime();
  const schedules = [
    { id: 'past', start_time: at(6, 10) },
    { id: 'future-later', start_time: at(9, 10) },
    { id: 'today-earlier', start_time: at(7, 9) },
    { id: 'today-next', start_time: at(7, 14) },
    { id: 'future-next', start_time: at(8, 10) },
    { id: 'undated', start_time: null },
  ];
  assert.equal(scheduleLocalDateKey(at(7, 14)), '2026-11-07');
  assert.equal(scheduleLocalDateKey('invalid'), null);
  assert.deepEqual(sortStageSchedulesAroundToday(schedules, now).map((row) => row.id),
    ['today-next', 'today-earlier', 'future-next', 'future-later', 'past', 'undated']);
  assert.equal(schedules[0].id, 'past', 'sorting leaves the fetched array intact');
  assert.deepEqual(schedules.filter((row) => scheduleLocalDateKey(row.start_time) === '2026-11-08').map((row) => row.id),
    ['future-next'], 'calendar selection uses the same local day as sorting');
});
