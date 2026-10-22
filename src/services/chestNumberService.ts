import { supabase } from '../core/config/supabase';

export type ChestTeam = { id: string; name: string; slot_number: number | null; total: number; numeric: number };
export type ChestCategory = { code: string; name: string; total: number };
export type ChestOrderState = {
  festival_id: string; template: 'team' | 'category'; range: number;
  locked: boolean; revision: number; teams: ChestTeam[];
  category_order_enabled: boolean; categories: ChestCategory[]; category_order_available: boolean;
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
  // Old database versions still support the existing team-order flow. The new
  // control only appears after its migration has been applied.
  return {
    ...data,
    category_order_available: Array.isArray(data.categories),
    category_order_enabled: data.category_order_enabled === true,
    categories: Array.isArray(data.categories) ? data.categories : [],
  } as ChestOrderState;
}

export const chestNumberService = {
  get: (festivalId: string) => call('get_festival_chest_order', { p_festival_id: festivalId }),
  save: (state: ChestOrderState, teamIds: string[]) => call('save_festival_chest_order', { ...snapshot(state), p_team_ids: teamIds }),
  saveWithCategories: (state: ChestOrderState, teamIds: string[], categoryCodes: string[], enabled: boolean) =>
    !state.category_order_available ? chestNumberService.save(state, teamIds) :
    call('save_festival_chest_order_with_categories', {
      ...snapshot(state), p_team_ids: teamIds,
      p_expected_category_codes: state.categories.map(category => category.code),
      p_category_codes: categoryCodes, p_category_order_enabled: enabled,
    }),
  setLock: (state: ChestOrderState, locked: boolean, code?: string) => call('set_festival_chest_lock', {
    ...snapshot(state), p_locked: locked, p_unlock_code: code?.trim() ?? null,
  }),
};
