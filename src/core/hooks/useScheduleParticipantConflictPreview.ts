import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  scheduleParticipantConflictService,
  type ScheduleConflictCandidate,
} from '../../services/scheduleParticipantConflictService';

export function useScheduleParticipantConflictPreview(
  festivalId: string | null | undefined,
  candidates: ScheduleConflictCandidate[],
) {
  const candidatePayload = React.useMemo(() => JSON.stringify(candidates), [candidates]);
  const [debouncedPayload, setDebouncedPayload] = React.useState(candidatePayload);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedPayload(candidatePayload), 400);
    return () => clearTimeout(timer);
  }, [candidatePayload]);

  const debouncedCandidates = React.useMemo(
    () => JSON.parse(debouncedPayload) as ScheduleConflictCandidate[],
    [debouncedPayload],
  );

  const query = useQuery({
    queryKey: ['schedule-participant-conflict-preview', festivalId, debouncedPayload],
    queryFn: () => scheduleParticipantConflictService.preview(festivalId!, debouncedCandidates),
    enabled: !!festivalId && debouncedCandidates.length > 0,
    staleTime: 0,
    retry: false,
  });

  return {
    ...query,
    isInputSettling: candidatePayload !== debouncedPayload,
  };
}
