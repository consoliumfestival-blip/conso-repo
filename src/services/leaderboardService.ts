import { leaderboardRepository } from '../lib/repositories/leaderboardRepository';

export type LeaderboardRow = {
  organisation_id: string | null;
  organisation_name: string;
  organisation_type: string | null;
  parent_id: string | null;
  total_points: number;
  first_place_count: number;
  second_place_count: number;
  third_place_count: number;
  grade_a_plus_count: number;
  grade_a_count: number;
  grade_b_count: number;
  grade_c_count: number;
  result_count: number;
  latest_published_at: string | null;
  grace_marks_awarded?: number;
};

export type PublicPublishedResultRow = {
  result_id: string;
  registration_id: string | null;
  item_id: string | null;
  item_name: string;
  item_name_ml: string;
  is_group: boolean;
  item_category_codes: string[];
  organisation_id: string | null;
  organisation_name: string;
  organisation_type: string | null;
  participant_id: string | null;
  participant_name: string;
  participant_profile_slug: string | null;
  chest_number: string;
  participant_category_code: string | null;
  rank: number | null;
  grade: string | null;
  points_awarded: number;
  published_at: string | null;
  festival_level: string | null;
  item_code?: string;
  public_result_no?: number;
};

const throwIfError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const toNumber = (value: unknown) => Number(value ?? 0);

export const leaderboardService = {
  async listPublicLeaderboard(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<LeaderboardRow[]> {
    const { data, error } = await leaderboardRepository.listPublicLeaderboard<LeaderboardRow>(
      tenantId,
      festivalId,
    );
    throwIfError(error);

    return data.map((row) => ({
      ...row,
      total_points: toNumber(row.total_points),
      first_place_count: toNumber(row.first_place_count),
      second_place_count: toNumber(row.second_place_count),
      third_place_count: toNumber(row.third_place_count),
      grade_a_plus_count: toNumber(row.grade_a_plus_count),
      grade_a_count: toNumber(row.grade_a_count),
      grade_b_count: toNumber(row.grade_b_count),
      grade_c_count: toNumber(row.grade_c_count),
      result_count: toNumber(row.result_count),
      grace_marks_awarded: toNumber(row.grace_marks_awarded),
    }));
  },

  async getLeaderboardPreview(
    tenantId?: string | null,
    festivalId?: string | null,
    rankingMode?: string,
    itemLimit?: number | null,
    usePublicOnly = false
  ): Promise<LeaderboardRow[]> {
    const { data, error } = await leaderboardRepository.getLeaderboardPreview<LeaderboardRow>(
      tenantId,
      festivalId,
      rankingMode,
      itemLimit,
      usePublicOnly
    );
    if (error) throw error;
    
    return data.map((row) => ({
      ...row,
      total_points: toNumber(row.total_points),
      first_place_count: toNumber(row.first_place_count),
      second_place_count: toNumber(row.second_place_count),
      third_place_count: toNumber(row.third_place_count),
      grade_a_plus_count: toNumber(row.grade_a_plus_count),
      grade_a_count: toNumber(row.grade_a_count),
      grade_b_count: toNumber(row.grade_b_count),
      grade_c_count: toNumber(row.grade_c_count),
      result_count: toNumber(row.result_count),
      grace_marks_awarded: toNumber(row.grace_marks_awarded),
    }));
  },

  async listPublicPublishedResults(
    tenantId?: string | null,
    festivalId?: string | null,
    includeParticipantDetails = true,
  ): Promise<PublicPublishedResultRow[]> {
    const { data, error } = await leaderboardRepository.listPublicPublishedResults<PublicPublishedResultRow>(
      tenantId,
      festivalId,
      includeParticipantDetails,
    );
    throwIfError(error);

    return data.map((row) => ({
      ...row,
      item_category_codes: Array.isArray(row.item_category_codes) ? row.item_category_codes : [],
      rank: row.rank === null || row.rank === undefined ? null : toNumber(row.rank),
      points_awarded: toNumber(row.points_awarded),
    }));
  },
};
