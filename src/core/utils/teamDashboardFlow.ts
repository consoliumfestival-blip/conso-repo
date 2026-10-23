import type { TeamLeaderScheduleRow } from '@/services/teamLeaderPortalService';

const LIVE_STATUSES = new Set(['ongoing', 'in_progress']);

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isTeamEventInProgress(event: TeamLeaderScheduleRow, now = Date.now()): boolean {
  const status = event.event_status?.trim().toLowerCase();
  if (status && LIVE_STATUSES.has(status)) {
    const endsAt = parseTimestamp(event.end_time);
    return endsAt === null || endsAt >= now;
  }

  const startsAt = parseTimestamp(event.start_time);
  const endsAt = parseTimestamp(event.end_time);
  return startsAt !== null && endsAt !== null && startsAt <= now && endsAt >= now;
}

/**
 * Schedule RPC results are ordered by start time, with untimed entries last.
 * Keep that order while retaining active events whose start time has passed.
 */
export function getTeamDashboardUpcomingEvents(
  schedule: readonly TeamLeaderScheduleRow[],
  now = Date.now(),
  limit = 5,
): TeamLeaderScheduleRow[] {
  return schedule.filter((event) => {
    const status = event.event_status?.trim().toLowerCase();
    if (status === 'completed') return false;

    const endsAt = parseTimestamp(event.end_time);
    if (endsAt !== null && endsAt < now) return false;

    const startsAt = parseTimestamp(event.start_time);
    return startsAt === null || startsAt >= now || isTeamEventInProgress(event, now);
  }).slice(0, Math.max(0, limit));
}

/** Count competitions whose scheduled interval overlaps the viewer's local day. */
export function getTeamDashboardEventsToday(
  schedule: readonly TeamLeaderScheduleRow[],
  now = Date.now(),
): TeamLeaderScheduleRow[] {
  const today = new Date(now);
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  return schedule.filter((event) => {
    const startsAt = parseTimestamp(event.start_time);
    if (startsAt === null) return false;
    const endsAt = parseTimestamp(event.end_time) ?? startsAt;
    return startsAt < dayEnd && endsAt >= dayStart;
  });
}
