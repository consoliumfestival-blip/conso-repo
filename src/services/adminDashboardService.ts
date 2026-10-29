import { supabase } from '../core/config/supabase';

export type DashboardData = { orgName: string; orgType: string; participantsCount: number; itemsCount: number; activeSchedulesCount: number; categoryGraph: { id: string; name: string; count: number }[]; unitGraph: { id: string | null; name: string; count: number }[] };

export const adminDashboardService = {
  async getDashboardStats(tenantId: string, festivalId: string | null, signal?: AbortSignal): Promise<DashboardData> {
    if (!tenantId) throw new Error('Tenant ID is required');
    let query = supabase.rpc('admin_dashboard_aggregates', { p_tenant_id: tenantId, p_festival_id: festivalId });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No data returned');
    return data as unknown as DashboardData;
  }
};
