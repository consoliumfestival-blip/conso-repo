import { supabase } from '../core/config/supabase';

export type ServerPointCalculation = {
  total: number;
  rank_points: number;
  grade_points: number;
  bracket_key: string;
  bracket_label: string;
  rule12_applied: boolean;
  rule12_behavior: 'grade_only' | 'rank_and_grade' | 'no_points';
  grade_only: boolean;
  config_version: number;
  points_mode: 'official' | 'hybrid' | 'custom';
  // NEW: separated fields
  group_size: number;
  competing_teams_count: number;
  is_group: boolean;
};

export const pointsService = {
  async calculateAward(payload: {
    festivalId: string;
    grade: string | null;
    rank: number | null;
    /** How many members per team entry (used to pick the point bracket) */
    groupSize: number;
    /** How many teams are competing in total (used for Rule 12 check) */
    competingTeamsCount: number;
    isGroup: boolean;
    bracketOverride?: string | null;
  }): Promise<ServerPointCalculation> {
    const { data, error } = await supabase.rpc('calculate_festival_points', {
      p_festival_id:          payload.festivalId,
      p_grade:                payload.grade,
      p_rank:                 payload.rank,
      p_group_size:           payload.groupSize,
      p_competing_teams_count: payload.competingTeamsCount,
      p_is_group:             payload.isGroup,
      p_bracket_override:     payload.bracketOverride ?? null,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error('The server did not return a points calculation.');
    return data as ServerPointCalculation;
  },
};
