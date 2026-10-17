import { leaderboardSettingsRepository } from '../lib/repositories/leaderboardSettingsRepository';

export type LeaderboardSettings = {
  id?: string;
  tenant_id: string;
  festival_id: string;
  is_public_visible: boolean;
  auto_refresh_enabled: boolean;
  auto_refresh_interval: number;
  show_rank_movement: boolean;
  show_timestamps: boolean;
  show_grade_summary: boolean;
  is_frozen: boolean;
  preview_visibility: string; // 'draft' or 'public'
  poster_enabled: boolean;
  certificate_enabled: boolean;
  poster_top_count: number;
  show_individual_rankings: boolean;
  theme_config: Record<string, any>;
  team_point_status?: string | null;
  theme_config?: Record<string, any>;
  public_festival_name?: string | null;
  ranking_mode?: string;
  item_limit?: number | null;
};

export type PublicLeaderboardSettings = {
  festival_id: string;
  festival_level: string | null;
  is_public_visible: boolean;
  show_individual_rankings: boolean;
  team_point_status?: string | null;
  public_festival_name?: string | null;
  ranking_mode?: string;
  item_limit?: number | null;
};

export type PosterTemplate = {
  id?: string;
  tenant_id: string;
  festival_id: string;
  name: string;
  version: number;
  background_url: string;
  width: number;
  height: number;
  aspect_ratio: string;
  field_mappings: Record<string, any>;
  is_active: boolean;
};

export type GeneratedPoster = {
  id?: string;
  tenant_id: string;
  festival_id: string;
  template_id: string;
  template_version: number;
  file_url: string;
  object_key: string;
  leaderboard_snapshot: Record<string, any>;
};

const notFoundCode = 'PGRST116';

const throwIfUnexpected = (error: { code?: string; message: string } | null) => {
  if (error && error.code !== notFoundCode) {
    throw new Error(error.message);
  }
};

export const leaderboardSettingsService = {
  async getLeaderboardSettings(festivalId: string): Promise<LeaderboardSettings | null> {
    const { data, error } = await leaderboardSettingsRepository.getLeaderboardSettings<LeaderboardSettings>(festivalId);
    throwIfUnexpected(error);
    return data;
  },

  async getPublicLeaderboardSettings(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<PublicLeaderboardSettings | null> {
    const { data, error } = await leaderboardSettingsRepository.getPublicLeaderboardSettings<PublicLeaderboardSettings>(
      tenantId,
      festivalId,
    );
    throwIfUnexpected(error);
    return data;
  },

  async updateLeaderboardSettings(
    tenantId: string,
    festivalId: string,
    payload: Partial<LeaderboardSettings>
  ): Promise<LeaderboardSettings> {
    const { data, error } = await leaderboardSettingsRepository.upsertLeaderboardSettings<LeaderboardSettings>({
      ...payload,
      tenant_id: tenantId,
      festival_id: festivalId,
    });

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Leaderboard settings were not returned after update');
    return data;
  },

  async getPosterTemplates(festivalId: string): Promise<PosterTemplate[]> {
    const { data, error } = await leaderboardSettingsRepository.getPosterTemplates<PosterTemplate>(festivalId);
    if (error) throw new Error(error.message);
    return data;
  },

  async updatePosterTemplate(
    tenantId: string,
    festivalId: string,
    payload: Partial<PosterTemplate> & { name: string; background_url: string }
  ): Promise<PosterTemplate> {
    const { data, error } = await leaderboardSettingsRepository.upsertPosterTemplate<PosterTemplate>({
      ...payload,
      tenant_id: tenantId,
      festival_id: festivalId,
    });

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Poster template was not returned after update');
    return data;
  },

  async deletePosterTemplate(templateId: string): Promise<void> {
    const { error } = await leaderboardSettingsRepository.deletePosterTemplate(templateId);
    if (error) throw new Error(error.message);
  },

  async saveGeneratedPoster(payload: Omit<GeneratedPoster, 'id'>): Promise<GeneratedPoster> {
    const { data, error } = await leaderboardSettingsRepository.saveGeneratedPoster<GeneratedPoster>(payload);
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Failed to save generated poster metadata');
    return data;
  },
};
