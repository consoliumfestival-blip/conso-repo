import { superRepository } from '../lib/repositories/superRepository';

const throwIfError = (error: { message: string } | null) => {
  if (error) {
    throw new Error(error.message);
  }
};

export const superService = {
  async getSuperAdminStats() {
    const { data, error } = await superRepository.getSuperAdminStats();
    throwIfError(error);
    return data;
  },

  async listGlobalOrganisations<T>() {
    const { data, error } = await superRepository.listGlobalOrganisations<T>();
    throwIfError(error);
    return data;
  },

  async createGlobalOrganisation<T>(payload: Record<string, unknown>) {
    const { data, error } = await superRepository.createGlobalOrganisation<T>(payload);
    throwIfError(error);
    return data;
  },

  async deleteGlobalOrganisation(id: string) {
    const { error } = await superRepository.deleteGlobalOrganisation(id);
    throwIfError(error);
  },

  async listTenantAccounts<T>() {
    const { data, error } = await superRepository.listTenantAccounts<T>();
    throwIfError(error);
    return data;
  },

  async revokeTenantAccess(orgId: string) {
    const { error } = await superRepository.revokeTenantAccess(orgId);
    throwIfError(error);
  },

  async disableTenantAccess(orgId: string, reason?: string) {
    const { error } = await superRepository.disableTenantAccess(orgId, reason);
    throwIfError(error);
  },

  async enableTenantAccess(orgId: string, reason?: string) {
    const { error } = await superRepository.enableTenantAccess(orgId, reason);
    throwIfError(error);
  },

  async getTenantLeaderboardAgentPrompt<T>(tenantId: string) {
    const { data, error } = await superRepository.getTenantLeaderboardAgentPrompt<T>(tenantId);
    throwIfError(error);
    return data;
  },
};
