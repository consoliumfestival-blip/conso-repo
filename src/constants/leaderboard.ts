/**
 * Leaderboard Constants
 *
 * IMPORTANT: When you have multiple active festivals, set the current one here.
 * The public leaderboard page uses this to always display the correct festival
 * without requiring a login. If null, the RPC will try to auto-detect the
 * most recent active festival (requires auth).
 *
 * Set to the festival ID from festival_calendar table.
 */
export const DEFAULT_FESTIVAL_ID: string | null = null; // set null = auto-detect via RPC

/**
 * Leaderboard React Query keys — centralised so invalidation is always consistent.
 */
export const LEADERBOARD_QUERY_KEYS = {
  adminLeaderboard: (tenantId?: string | null, festivalId?: string | null) =>
    ['admin-leaderboard', tenantId ?? 'all', festivalId ?? 'active'],
  publicLeaderboard: (tenantId?: string | null, festivalId?: string | null) =>
    ['public-leaderboard', tenantId ?? 'all', festivalId ?? 'active'],
  publicPublishedResults: (tenantId?: string | null, festivalId?: string | null, includeParticipantDetails = true) =>
    ['public-published-results', tenantId ?? 'all', festivalId ?? 'active', includeParticipantDetails ? 'with-participants' : 'items-only'],
  publicLeaderboardSettings: (tenantId?: string | null, festivalId?: string | null) =>
    ['public-leaderboard-settings', tenantId ?? 'all', festivalId ?? 'active'],
  festivalResults: (tenantId?: string | null, festivalId?: string | null) =>
    ['festival-results', tenantId, festivalId],
};
