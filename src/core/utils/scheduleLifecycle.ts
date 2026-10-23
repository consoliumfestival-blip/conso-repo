import type { TeamLeaderScheduleRow } from '@/services/teamLeaderPortalService';

export type ScheduleLifecycleStatus = 'scheduled' | 'ongoing' | 'completed';

export function normalizeScheduleLifecycleStatus(status: string | null | undefined): ScheduleLifecycleStatus | null {
  const value = status?.trim().toLowerCase();
  if (value === 'scheduled' || value === 'upcoming') return 'scheduled';
  if (value === 'ongoing' || value === 'in_progress' || value === 'live' || value === 'started') return 'ongoing';
  if (value === 'completed' || value === 'complete' || value === 'finished') return 'completed';
  return null;
}

export function getScheduleLifecycleLabel(status: string | null | undefined): string {
  const normalized = normalizeScheduleLifecycleStatus(status);
  if (normalized === 'ongoing') return 'Started';
  if (normalized === 'completed') return 'Completed';
  if (normalized === 'scheduled') return 'Scheduled';
  return status?.trim() || 'Scheduled';
}

export function getCompletedScheduleCount(schedule: readonly Pick<TeamLeaderScheduleRow, 'event_status'>[]): number {
  return schedule.filter((event) => normalizeScheduleLifecycleStatus(event.event_status) === 'completed').length;
}
