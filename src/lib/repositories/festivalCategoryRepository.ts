import { supabase } from '../../core/config/supabase';
import type { FestivalCategory, FestivalCategoryInput } from '../../types/festivalCategory';

export const festivalCategoryRepository = {
  async list(festivalId: string, activeOnly = false) {
    let query = supabase
      .from('festival_categories')
      .select('*')
      .eq('festival_id', festivalId)
      .order('sort_order')
      .order('name');
    if (activeOnly) query = query.eq('is_active', true);
    return query.returns<FestivalCategory[]>();
  },

  create(tenantId: string, festivalId: string, input: FestivalCategoryInput) {
    return supabase
      .from('festival_categories')
      .insert({ tenant_id: tenantId, festival_id: festivalId, ...input })
      .select('*')
      .single<FestivalCategory>();
  },

  update(id: string, input: Partial<FestivalCategoryInput>) {
    return supabase.from('festival_categories').update(input).eq('id', id).select('*').single<FestivalCategory>();
  },

  setActive(id: string, isActive: boolean) {
    return supabase
      .from('festival_categories')
      .update({ is_active: isActive, archived_at: isActive ? null : new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single<FestivalCategory>();
  },

  remove(id: string) {
    return supabase.rpc('delete_festival_category_safely', { p_category_id: id });
  },
};
