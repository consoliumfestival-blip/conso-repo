import { databaseProvider } from '../../providers/database';

export const adminLeaderboardRepository = {
  listAdminLeaderboard<T>(tenantId?: string | null, festivalId?: string | null) {
    return databaseProvider.listAdminLeaderboard<T>(tenantId, festivalId);
  },
};
