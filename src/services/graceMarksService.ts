import { supabase } from '../core/config/supabase';

export type GraceMark = {
  id: string;
  tenant_id: string;
  festival_id: string;
  org_id: string;
  points: number;
  reason?: string | null;
  created_at: string;
  updated_at: string;
};

export const graceMarksService = {
  async getGraceMarks(festivalId: string): Promise<GraceMark[]> {
    const { data, error } = await supabase
      .from('grace_marks')
      .select('*')
      .eq('festival_id', festivalId);

    if (error) throw new Error(error.message);
    return data as GraceMark[];
  },

  async upsertGraceMark(payload: {
    festival_id: string;
    org_id: string;
    points: number;
    reason?: string;
  }): Promise<GraceMark> {
    const { data, error } = await supabase
      .from('grace_marks')
      .upsert(
        {
          festival_id: payload.festival_id,
          org_id: payload.org_id,
          points: payload.points,
          reason: payload.reason || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'festival_id,org_id' }
      )
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as GraceMark;
  },
};
