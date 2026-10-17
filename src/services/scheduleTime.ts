export type ScheduleTimeParts = {
  hour: string;
  minute: string;
  period: 'AM' | 'PM';
};

export const timePartsTo24Hour = (value: ScheduleTimeParts): string | null => {
  const hour = Number(value.hour);
  const minute = Number(value.minute);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }
  const hour24 = value.period === 'AM'
    ? (hour === 12 ? 0 : hour)
    : (hour === 12 ? 12 : hour + 12);
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const isoToScheduleTimeParts = (value?: string | null): ScheduleTimeParts => {
  const date = value ? new Date(value) : new Date();
  const hour24 = date.getHours();
  return {
    hour: String(hour24 % 12 || 12).padStart(2, '0'),
    minute: String(date.getMinutes()).padStart(2, '0'),
    period: hour24 >= 12 ? 'PM' : 'AM',
  };
};

export const localDateTimeToIso = (date: string, time: ScheduleTimeParts): string | null => {
  const normalized = timePartsTo24Hour(time);
  if (!date || !normalized) return null;
  const parsed = new Date(`${date}T${normalized}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
