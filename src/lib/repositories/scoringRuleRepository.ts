import { supabase } from '../../core/config/supabase';

export const scoringRuleRepository = {
  async listRules<T>(tenantId?: string) {
    let query = supabase
      .from('scoring_rules')
      .select('*, scoring_criteria(*)')
      .order('event_name', { ascending: true });
      
    if (tenantId) {
      // Fetch default rules (tenant_id is null) AND tenant-specific rules
      query = query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    } else {
      query = query.is('tenant_id', null);
    }

    return await query;
  },

  async getRule<T>(id: string) {
    return await supabase
      .from('scoring_rules')
      .select('*, scoring_criteria(*)')
      .eq('id', id)
      .single();
  },

  async createRule<T>(payload: Record<string, unknown>) {
    return await supabase.from('scoring_rules').insert(payload).select().single();
  },

  async updateRule<T>(id: string, payload: Record<string, unknown>) {
    return await supabase.from('scoring_rules').update(payload).eq('id', id).select().single();
  },

  async deleteRule(id: string) {
    return await supabase.from('scoring_rules').delete().eq('id', id);
  },

  // Criteria Operations
  async createCriterion<T>(payload: Record<string, unknown>) {
    return await supabase.from('scoring_criteria').insert(payload).select().single();
  },

  async updateCriterion<T>(id: string, payload: Record<string, unknown>) {
    return await supabase.from('scoring_criteria').update(payload).eq('id', id).select().single();
  },

  async deleteCriterion(id: string) {
    return await supabase.from('scoring_criteria').delete().eq('id', id);
  }
};
