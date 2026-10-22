import { supabase } from '../core/config/supabase';
import { CompetitionPublication, competitionArguments } from '../types/scoring';

export const pointsService = {
  async preview(input: CompetitionPublication): Promise<any> {
    const { data, error } = await supabase.rpc('preview_competition_points', competitionArguments(input));
    if (error) throw new Error(error.message);
    return data;
  },
  async getJudgeContext(token: string): Promise<any> {
    const { data, error } = await supabase.rpc('get_judge_scoring_context', { p_token: token });
    if (error) throw new Error(error.message);
    return data;
  },
};
