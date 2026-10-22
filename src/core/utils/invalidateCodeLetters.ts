import type { QueryClient } from '@tanstack/react-query';

const consumers = new Set([
  'stage-management-registrations', 'stage-venue-portal', 'scheduleRegistrations',
  'itemRegistrations', 'festivalRegistrations', 'participantRegistrations', 'participantConflicts',
]);

// Only registration-label consumers need refreshing; marks and scores do not change.
export function invalidateCodeLetters(queryClient: QueryClient, scope: { scheduleId?: string; festivalId?: string; venueId?: string } = {}) {
  return queryClient.invalidateQueries({ predicate: (query) => {
    const [consumer, key, festival, schedule] = query.queryKey;
    if (!consumers.has(String(consumer))) return false;
    if (consumer === 'scheduleRegistrations' && scope.scheduleId) return key === scope.scheduleId;
    if (consumer === 'festivalRegistrations' && scope.festivalId) return key === scope.festivalId;
    if (consumer === 'stage-management-registrations') {
      return (!scope.festivalId || festival === scope.festivalId)
        && (!scope.scheduleId || schedule === 'festival' || schedule === scope.scheduleId);
    }
    if (consumer === 'stage-venue-portal') {
      if (scope.venueId) return key === scope.venueId;
      const data = query.state.data as { schedules?: { id: string; festival_id: string }[] } | undefined;
      return data?.schedules?.some(row => (!scope.scheduleId || row.id === scope.scheduleId)
        && (!scope.festivalId || row.festival_id === scope.festivalId)) ?? false;
    }
    // Conflicts for OTHER schedules depend on this assignment as well.
    return true;
  } });
}
