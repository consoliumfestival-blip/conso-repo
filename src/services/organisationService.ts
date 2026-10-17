import { organisationRepository } from '../lib/repositories/organisationRepository';
import { tenantProvisioningService } from './tenantProvisioningService';

const throwIfError = (error: { message: string } | null, dataError?: string) => {
  if (error) throw new Error(error.message);
  if (dataError) throw new Error(dataError);
};

export const organisationService = {
  async getMyOrganisation(tenantId: string) {
    const { data, error } = await organisationRepository.getOrganisation(tenantId);
    throwIfError(error);
    return data;
  },

  async getChildOrganisations(parentId: string) {
    const { data, error } = await organisationRepository.getChildOrganisations(parentId);
    throwIfError(error);
    return data || [];
  },

  async archiveChildOrganisation(orgId: string) {
    const { data, error } = await organisationRepository.archiveChildOrganisation(orgId);
    throwIfError(error, data && !data.success ? data.error : undefined);
    return data;
  },

  async createSubOrganisation(
    parentId: string,
    orgName: string,
    orgType: string = 'unit',
    username: string,
    idempotencyKey?: string
  ) {
    // Provisioning is delegated to the trusted server-side endpoint: it creates
    // the Auth user, generates the temporary credential (never persisted),
    // finalises the database link transactionally and compensates on failure.
    return tenantProvisioningService.provisionChildOrganisation({
      parentId,
      orgName,
      orgType,
      username,
      idempotencyKey,
    });
  },

  async resetOrganisationCredential(organisationId: string) {
    // The client identifies the target by organisation id + target type; the
    // backend resolves the actual admin Auth user server-side.
    const data = await tenantProvisioningService.resetCredential({
      targetType: 'child_admin',
      organisationId,
    });
    if (!data.success) throw new Error(data.message || 'Credential reset failed');
    return data;
  }
};
