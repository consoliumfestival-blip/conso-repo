import { databaseProvider } from '../../providers/database';

export const leaderboardRepository = {
  listPublicLeaderboard<T>(tenantId?: string | null, festivalId?: string | null) {
    return databaseProvider.listPublicLeaderboard<T>(tenantId, festivalId);
  },
  getLeaderboardPreview<T>(tenantId?: string | null, festivalId?: string | null, rankingMode?: string, itemLimit?: number | null, usePublicOnly = false) {
    // @ts-ignore
    return databaseProvider.getLeaderboardPreview<T>(tenantId, festivalId, rankingMode, itemLimit, usePublicOnly);
  },
  listPublicPublishedResults<T>(
    tenantId?: string | null,
    festivalId?: string | null,
    includeParticipantDetails = true,
  ) {
    return databaseProvider.listPublicPublishedResults<T>(tenantId, festivalId, includeParticipantDetails);
  },
  getPublicLeaderboardSettings<T>(tenantId?: string | null, festivalId?: string | null) {
    return databaseProvider.getPublicLeaderboardSettings<T>(tenantId, festivalId);
  },
};
