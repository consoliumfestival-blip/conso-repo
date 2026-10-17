import { databaseProvider } from '../../providers/database';

export const leaderboardSettingsRepository = {
  async getLeaderboardSettings<T>(festivalId: string) {
    return databaseProvider.getLeaderboardSettings<T>(festivalId);
  },

  async upsertLeaderboardSettings<T>(payload: Record<string, unknown>) {
    return databaseProvider.upsertLeaderboardSettings<T>(payload);
  },
  async getPublicLeaderboardSettings<T>(tenantId?: string | null, festivalId?: string | null) {
    return databaseProvider.getPublicLeaderboardSettings<T>(tenantId, festivalId);
  },

  async getPosterTemplates<T>(festivalId: string) {
    return databaseProvider.getPosterTemplates<T>(festivalId);
  },

  async upsertPosterTemplate<T>(payload: Record<string, unknown>) {
    return databaseProvider.upsertPosterTemplate<T>(payload);
  },

  async deletePosterTemplate(templateId: string) {
    return databaseProvider.deletePosterTemplate(templateId);
  },

  async saveGeneratedPoster<T>(payload: Record<string, unknown>) {
    return databaseProvider.saveGeneratedPoster<T>(payload);
  },
};
