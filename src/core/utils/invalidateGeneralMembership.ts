import type { QueryClient } from '@tanstack/react-query';

export function invalidateGeneralMembership(client: QueryClient, festivalId: string, participantIds: string[]) {
  const members = new Set(participantIds);
  return client.invalidateQueries({
    predicate(query) {
      const [kind, second, third] = query.queryKey;
      if (kind === 'general-team-entries') return second === festivalId;
      if (kind === 'stage-management-registrations') return third === festivalId;
      if (kind === 'participantGeneralTeamResults') return typeof second === 'string' && members.has(second);
      if (kind === 'publicCandidateProfile') {
        const data = query.state.data as { profile?: { id?: string } } | undefined;
        return !!data?.profile?.id && members.has(data.profile.id);
      }
      return false;
    },
  });
}
