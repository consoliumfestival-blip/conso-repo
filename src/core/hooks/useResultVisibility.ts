import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resultVisibilityService, ResultStatus } from '../../services/resultVisibilityService';
import { LEADERBOARD_QUERY_KEYS } from '../../constants/leaderboard';

export const useResultVisibility = (
  tenantId?: string | null,
  festivalId?: string | null,
) => {
  const queryClient = useQueryClient();
  const queryKey = LEADERBOARD_QUERY_KEYS.festivalResults(tenantId, festivalId);

  const results = useQuery({
    queryKey,
    queryFn: () => resultVisibilityService.listFestivalResults(tenantId, festivalId),
    enabled: !!festivalId || !!tenantId,
  });

  const invalidateAll = () => {
    // Invalidate the admin result list (item-results page)
    queryClient.invalidateQueries({ queryKey });
    // Invalidate admin leaderboard and ALL variants of public-leaderboard (prefix match)
    // This covers: public page (no params), unit-rankings (tenant+festival), admin layout
    queryClient.invalidateQueries({ queryKey: ['admin-leaderboard'] });
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        (query.queryKey[0] === 'public-leaderboard' || query.queryKey[0] === 'public-published-results'),
    });
  };

  const updateVisibility = useMutation({
    mutationFn: ({ resultId, status }: { resultId: string; status: ResultStatus }) =>
      resultVisibilityService.updateResultVisibility(resultId, status),
    onSuccess: invalidateAll,
  });

  const bulkUpdateVisibility = useMutation({
    mutationFn: ({ resultIds, status }: { resultIds: string[]; status: ResultStatus }) =>
      resultVisibilityService.bulkUpdateResultVisibility(resultIds, status),
    onSuccess: invalidateAll,
  });

  return {
    results: results.data ?? [],
    error: results.error,
    isLoading: results.isLoading,
    isRefetching: results.isRefetching,
    refetch: results.refetch,
    updateVisibility,
    bulkUpdateVisibility,
  };
};
