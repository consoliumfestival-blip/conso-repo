import { databaseProvider } from '../../providers/database';

export const superRepository = {
  getSuperAdminStats() {
    return databaseProvider.getSuperAdminStats();
  },

  listGlobalOrganisations<T>() {
    return databaseProvider.listGlobalOrganisations<T>();
  },

  createGlobalOrganisation<T>(payload: Record<string, unknown>) {
    return databaseProvider.createGlobalOrganisation<T>(payload);
  },

  deleteGlobalOrganisation(id: string) {
    return databaseProvider.deleteGlobalOrganisation(id);
  },

  listTenantAccounts<T>() {
    return databaseProvider.listTenantAccounts<T>();
  },

  revokeTenantAccess(orgId: string) {
    return databaseProvider.revokeTenantAccess(orgId);
  },

  disableTenantAccess(orgId: string, reason?: string) {
    return databaseProvider.disableTenantAccess(orgId, reason);
  },

  enableTenantAccess(orgId: string, reason?: string) {
    return databaseProvider.enableTenantAccess(orgId, reason);
  },

  getTenantLeaderboardAgentPrompt<T>(tenantId: string) {
    return databaseProvider.getTenantLeaderboardAgentPrompt<T>(tenantId);
  },
};
