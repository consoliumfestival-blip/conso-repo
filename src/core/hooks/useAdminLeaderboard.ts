import { useQuery } from '@tanstack/react-query';
import { LEADERBOARD_QUERY_KEYS } from '../../constants/leaderboard';
import { adminLeaderboardService } from '../../services/adminLeaderboardService';

export const useAdminLeaderboard = (tenantId?: string | null, festivalId?: string | null) => {
  return useQuery({
    queryKey: LEADERBOARD_QUERY_KEYS.adminLeaderboard(tenantId, festivalId),
    queryFn: () => adminLeaderboardService.listAdminLeaderboard(tenantId, festivalId),
    enabled: !!festivalId || !!tenantId,
  });
};
