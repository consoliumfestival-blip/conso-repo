type ScheduleTimeFormatOptions = {
  /** Preserve a surface's existing explicit timezone; omitted means device-local time. */
  timeZone?: string;
};

/** Formats a schedule timestamp as a consistent, zero-padded 12-hour clock. */
export function formatScheduleTime(
  value: string | number | Date | null | undefined,
  options: ScheduleTimeFormatOptions = {},
): string {
  if (value == null || value === '') return '';

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  const period = parts.find((part) => part.type === 'dayPeriod')?.value.toUpperCase();

  return hour && minute && period ? `${hour}:${minute} ${period}` : '';
}
