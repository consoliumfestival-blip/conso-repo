import { supabase } from '../core/config/supabase';

export type GraceWorkspace = {
  config_version: number; enabled: boolean;
  fields: { id: string; name: string; max_marks: number }[];
  teams: { id: string; name: string }[];
  entries: Record<string, Record<string, number>>;
  revision: number; draft_config_version: number | null;
  last_submission: { id: string; revision: number; config_version: number; created_at: string } | null;
};
export type GraceEntries = Record<string, Record<string, number>>;
export const graceMarksService = {
  async getWorkspace(festivalId: string): Promise<GraceWorkspace> {
    const { data, error } = await supabase.rpc('get_grace_workspace', { p_festival_id: festivalId });
    if (error) throw new Error(error.message);
    return data as GraceWorkspace;
  },
  async saveDraft(festivalId: string, version: number, revision: number, entries: GraceEntries): Promise<GraceWorkspace> {
    const { data, error } = await supabase.rpc('save_grace_draft', {
      p_festival_id: festivalId, p_expected_version: version, p_expected_revision: revision, p_entries: entries,
    });
    if (error) throw new Error(error.message);
    return data as GraceWorkspace;
  },
  async submitAll(festivalId: string, version: number, revision: number): Promise<{ submission_id: string }> {
    const { data, error } = await supabase.rpc('submit_all_grace_marks', {
      p_festival_id: festivalId, p_expected_version: version, p_expected_revision: revision,
    });
    if (error) throw new Error(error.message);
    return data;
  },
};
