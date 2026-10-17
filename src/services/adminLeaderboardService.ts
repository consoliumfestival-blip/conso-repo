import { adminLeaderboardRepository } from '../lib/repositories/adminLeaderboardRepository';
import { LeaderboardRow } from './leaderboardService';

const throwIfError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const toNumber = (value: unknown) => Number(value ?? 0);

export const adminLeaderboardService = {
  async listAdminLeaderboard(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<LeaderboardRow[]> {
    const { data, error } = await adminLeaderboardRepository.listAdminLeaderboard<LeaderboardRow>(
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
    }));
  },
};
