import { supabase } from '../../core/config/supabase';

export const organisationRepository = {
  async getOrganisation(tenantId: string) {
    return await supabase
      .from('organisations')
      .select('id, org_type')
      .eq('tenant_id', tenantId)
      .single();
  },

  async getChildOrganisations(parentId: string) {
    return await supabase
      .from('organisations')
      .select('id, tenant_id, name, org_type, parent_id, admin_email, archived_at, created_at')
      .eq('parent_id', parentId)
      .is('archived_at', null)
      .order('created_at', { ascending: false });
  },

  async archiveChildOrganisation(orgId: string) {
    return await supabase.rpc('delete_child_organisation', {
      p_org_id: orgId
    });
  },
};
