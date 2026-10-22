import { supabase } from '../core/config/supabase';

export type ChestTeam = { id: string; name: string; slot_number: number | null; total: number; numeric: number };
export type ChestOrderState = {
  festival_id: string; template: 'team' | 'category'; range: number;
  locked: boolean; revision: number; teams: ChestTeam[];
};

const snapshot = (state: ChestOrderState) => ({
  p_festival_id: state.festival_id,
  p_expected_revision: state.revision,
  p_expected_team_ids: state.teams.map(team => team.id),
  p_expected_range: state.range,
});

async function call(name: string, args: Record<string, unknown>): Promise<ChestOrderState> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  if (!data || !Array.isArray(data.teams)) throw new Error('Unable to load chest-number settings.');
  return data as ChestOrderState;
}

export const chestNumberService = {
  get: (festivalId: string) => call('get_festival_chest_order', { p_festival_id: festivalId }),
  save: (state: ChestOrderState, teamIds: string[]) => call('save_festival_chest_order', { ...snapshot(state), p_team_ids: teamIds }),
  setLock: (state: ChestOrderState, locked: boolean, code?: string) => call('set_festival_chest_lock', {
    ...snapshot(state), p_locked: locked, p_unlock_code: code?.trim() ?? null,
  }),
};
