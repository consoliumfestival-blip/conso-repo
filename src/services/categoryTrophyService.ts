import { supabase } from '@/core/config/supabase';

export type CategoryTrophyStanding = {
  category_code: string;
  category_name: string;
  category_sort_order: number;
  organisation_id: string;
  organisation_name: string;
  total_points: number;
  first_place_count: number;
  second_place_count: number;
  third_place_count: number;
  result_count: number;
  rank_position: number;
  is_winner: boolean;
};

export type CategoryTrophyMode = {
  enabled: boolean;
  public_visible: boolean;
};

const numberValue = (value: unknown) => Number(value ?? 0);

const normalizeStanding = (row: any): CategoryTrophyStanding => ({
  category_code: String(row.category_code ?? ''),
  category_name: String(row.category_name ?? row.category_code ?? 'Category'),
  category_sort_order: numberValue(row.category_sort_order),
  organisation_id: String(row.organisation_id ?? ''),
  organisation_name: String(row.organisation_name ?? 'Unassigned'),
  total_points: numberValue(row.total_points),
  first_place_count: numberValue(row.first_place_count),
  second_place_count: numberValue(row.second_place_count),
  third_place_count: numberValue(row.third_place_count),
  result_count: numberValue(row.result_count),
  rank_position: numberValue(row.rank_position),
  is_winner: row.is_winner === true,
});

export const categoryTrophyService = {
  async getMode(tenantId: string, festivalId: string): Promise<CategoryTrophyMode> {
    const { data, error } = await supabase.rpc('get_category_trophy_mode', {
      p_tenant_id: tenantId,
      p_festival_id: festivalId,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      enabled: row?.enabled === true,
      public_visible: row?.public_visible === true,
    };
  },

  async listPublic(tenantId: string, festivalId: string): Promise<CategoryTrophyStanding[]> {
    const { data, error } = await supabase.rpc('get_public_category_trophy_standings', {
      p_tenant_id: tenantId,
      p_festival_id: festivalId,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map(normalizeStanding);
  },

  async listAdmin(tenantId: string, festivalId: string): Promise<CategoryTrophyStanding[]> {
    const { data, error } = await supabase.rpc('get_admin_category_trophy_standings', {
      p_tenant_id: tenantId,
      p_festival_id: festivalId,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map(normalizeStanding);
  },

  async getSuperMode(tenantId: string, festivalId: string): Promise<{ enabled: boolean }> {
    const { data, error } = await supabase.rpc('super_get_festival_category_trophy_mode', {
      p_tenant_id: tenantId,
      p_festival_id: festivalId,
    });
    if (error) throw new Error(error.message);
    return { enabled: data?.enabled === true };
  },

  async setSuperMode(tenantId: string, festivalId: string, enabled: boolean, expectedEnabled: boolean): Promise<{ enabled: boolean }> {
    const { data, error } = await supabase.rpc('super_set_festival_category_trophy_mode', {
      p_tenant_id: tenantId,
      p_festival_id: festivalId,
      p_enabled: enabled,
      p_expected_enabled: expectedEnabled,
    });
    if (error) throw new Error(error.message);
    return { enabled: data?.enabled === true };
  },
};
