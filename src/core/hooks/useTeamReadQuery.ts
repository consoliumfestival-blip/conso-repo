import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { useAuthStore } from '@/core/store/authStore';

import { isTeamAuthorizationError, teamReadKey } from '@/core/utils/teamReadCache';

export function useTeamReadQuery<T>(resource: string, fetcher: () => Promise<T>) {
  const { context, loading, refetch: refreshContext, invalidateAccess } = useTeamLeaderContext();
  const userId = useAuthStore(state => state.user?.id);
  const tenantId = useAuthStore(state => state.tenant_id);
  const role = useAuthStore(state => state.role);
  const enabled = !!userId && role === 'team_leader' && !!context?.assignment_id && !loading;
  const queryKey = teamReadKey({ userId, tenantId, role, assignmentId: context?.assignment_id, parentTenantId: context?.parent_tenant_id, festivalId: context?.festival_id, festivalTeamId: context?.festival_team_id, organisationId: context?.organisation_id }, resource);
  const query = useQuery({
    queryKey,
    queryFn: fetcher,
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (count, error) => !isTeamAuthorizationError(error) && count < 1,
  });
  const queryRef = useRef(query);
  queryRef.current = query;
  const scopeIdentity = JSON.stringify(queryKey);
  useFocusEffect(useCallback(() => {
    void scopeIdentity;
    const current = queryRef.current;
    if (enabled && current.isStale && current.data !== undefined && !current.isFetching && !current.isError) void current.refetch();
  }, [enabled, scopeIdentity]));
  useEffect(() => {
    if (isTeamAuthorizationError(query.error)) invalidateAccess();
  }, [query.error, invalidateAccess]);
  const authorized = enabled && !isTeamAuthorizationError(query.error);
  const retry = () => enabled ? query.refetch() : refreshContext();
  return { ...query, data: authorized ? query.data : undefined, authorized, retry };
}
