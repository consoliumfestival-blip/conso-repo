import { useQuery } from '@tanstack/react-query';
import { leaderboardService } from '../../services/leaderboardService';
import { LEADERBOARD_QUERY_KEYS } from '../../constants/leaderboard';
import { Platform } from 'react-native';
import { usePublicSnapshot } from './usePublicSnapshot';
import { useFreshPublicQuery } from './useFreshPublicQuery';

export const usePublicLeaderboard = (
  tenantId?: string | null,
  festivalId?: string | null,
  enabled = true,
) => {
  const snapshot = usePublicSnapshot(tenantId);
  const direct = useQuery({
    queryKey: LEADERBOARD_QUERY_KEYS.publicLeaderboard(tenantId, festivalId),
    queryFn: () => leaderboardService.listPublicLeaderboard(tenantId, festivalId),
    enabled: Platform.OS !== 'web' && enabled && !!tenantId && !!festivalId,
    staleTime: 0,
    gcTime: 30_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  const freshDirect = useFreshPublicQuery(direct, enabled && !!tenantId && !!festivalId);
  if (Platform.OS !== 'web') return freshDirect;
  const active = enabled && !!festivalId && snapshot.data?.festival_id === festivalId;
  return {
    ...snapshot,
    data: active ? snapshot.data?.leaderboard : undefined,
    isLoading: enabled && snapshot.isLoading,
    isRefetching: enabled && snapshot.isRefetching,
  };
};

export const useLeaderboardPreview = (
  tenantId?: string | null,
  festivalId?: string | null,
  rankingMode?: string,
  itemLimit?: number | null,
  enabled = true,
) => {
  return useQuery({
    queryKey: ['leaderboard-preview', tenantId, festivalId, rankingMode, itemLimit],
    queryFn: () => leaderboardService.getLeaderboardPreview(tenantId, festivalId, rankingMode, itemLimit, true),
    enabled: enabled && !!tenantId && !!festivalId,
  });
};

export const usePublicPublishedResults = (
  tenantId?: string | null,
  festivalId?: string | null,
  enabled = true,
  includeParticipantDetails = true,
  scope: 'results' | 'participant_results' = 'results',
) => {
  const snapshot = usePublicSnapshot(tenantId);
  const direct = useQuery({
    queryKey: LEADERBOARD_QUERY_KEYS.publicPublishedResults(tenantId, festivalId, includeParticipantDetails, scope),
    queryFn: () => leaderboardService.listPublicPublishedResults(tenantId, festivalId, includeParticipantDetails, scope),
    enabled: Platform.OS !== 'web' && enabled,
    staleTime: 0,
    gcTime: 30_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  const freshDirect = useFreshPublicQuery(direct, enabled && !!tenantId && !!festivalId);
  if (Platform.OS !== 'web') return freshDirect;
  const active = enabled && !!festivalId && snapshot.data?.festival_id === festivalId;
  return {
    ...snapshot,
    data: active ? (scope === 'participant_results' ? snapshot.data?.participant_results : snapshot.data?.results) : undefined,
    isLoading: enabled && snapshot.isLoading,
    isRefetching: enabled && snapshot.isRefetching,
  };
};
