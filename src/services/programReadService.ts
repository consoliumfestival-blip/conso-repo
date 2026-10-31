import { supabase } from '../core/config/supabase';

export type ProgramItem = { id: string; item_code: string; item_name_en?: string; item_name_ml?: string; category_codes?: string[] | string | null; participation_type?: string; item_type?: string | null; max_participants_per_team?: number | null; gender?: string | null; is_active?: boolean; group_min_members?: number | null; group_max_members?: number | null };
export type ProgramCard = { item: ProgramItem; category: string; kind: 'participant' | 'general_team'; is_complete: boolean; assigned_count: number; over_limit_teams: number };
export type ProgramPage = { cards: ProgramCard[]; total: number; section_total: number; completed: number; options: { type: string[]; stage: string[]; category: string[] } };
export const programCacheOptions = { staleTime: 120_000, refetchInterval: false as const, refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: false };
// Details are still fetched only when opened; stale cached details refresh on that explicit open.
export const programDetailCacheOptions = { ...programCacheOptions, refetchOnMount: true };
export const programReadService = {
  async page(input: { tenantId: string; festivalId: string; section: string; search: string; type: string; stage: string; status: string; category: string; page: number }, signal?: AbortSignal): Promise<ProgramPage> {
    let request = supabase.rpc('admin_program_cards_page', {
      p_tenant_id: input.tenantId, p_festival_id: input.festivalId, p_section: input.section,
      p_search: input.search, p_type: input.type, p_stage: input.stage, p_status: input.status,
      p_category: input.category, p_page: input.page,
    });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    return data as ProgramPage;
  },
  async detail(tenantId: string, festivalId: string, itemId: string, category: string, includeEligible: boolean, signal?: AbortSignal): Promise<{ participants: any[]; registrations: any[]; organisation_ids: string[] }> {
    let request = supabase.rpc('admin_program_detail', { p_tenant_id: tenantId, p_festival_id: festivalId, p_item_id: itemId, p_category: category, p_include_eligible: includeEligible });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    return data as { participants: any[]; registrations: any[]; organisation_ids: string[] };
  },
};
