import { databaseProvider } from '../providers/database';

export const adminDashboardService = {
  async getDashboardStats(tenantId: string) {
    if (!tenantId) throw new Error('Tenant ID is required');
    const { data, error } = await databaseProvider.getAdminDashboardStats(tenantId);
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No data returned');
    return data;
  }
};
