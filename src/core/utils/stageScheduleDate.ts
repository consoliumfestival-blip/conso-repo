type DatedSchedule = { id: string; start_time: string | null };

export function scheduleLocalDateKey(value: string | number | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Today's upcoming events, today's earlier events, future events, then past events. */
export function sortStageSchedulesAroundToday<T extends DatedSchedule>(schedules: T[], now: number): T[] {
  const today = scheduleLocalDateKey(now);
  const rank = (schedule: T) => {
    const date = scheduleLocalDateKey(schedule.start_time);
    const start = schedule.start_time ? Date.parse(schedule.start_time) : NaN;
    if (!date || !Number.isFinite(start)) return { bucket: 4, start: 0 };
    if (date === today) return { bucket: start >= now ? 0 : 1, start };
    return { bucket: date > (today ?? '') ? 2 : 3, start };
  };
  return [...schedules].sort((a, b) => {
    const left = rank(a);
    const right = rank(b);
    return left.bucket - right.bucket
      || (left.bucket === 1 || left.bucket === 3 ? right.start - left.start : left.start - right.start)
      || a.id.localeCompare(b.id);
  });
}
