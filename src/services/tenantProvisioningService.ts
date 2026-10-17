import { FestivalTemplate, provisioningRepository, ProvisioningResponse, ResetTargetType } from '../lib/repositories/provisioningRepository';
import { FEATURE_FLAGS } from '../core/config/features';

export interface ProvisionRootTenantInput {
  orgId: string;
  orgName: string;
  orgType: string;
  adminEmail: string;
  festivalTemplate: FestivalTemplate;
}

export interface ProvisionChildOrganisationInput {
  parentId: string;
  orgName: string;
  orgType: string;
  username: string;
  // Stable per creation attempt: the UI generates it when the form opens and
  // reuses it on retry so a failure can never create a second account.
  idempotencyKey?: string;
}

export interface ProvisioningStatusInput {
  operationType: 'root_tenant' | 'child_organisation';
  idempotencyKey: string;
}

// Credential reset contract: the client identifies the target by
// organisation + target type ONLY. The Auth user id is resolved
// server-side by the Edge Function / database; the client never sends it.
export interface ResetCredentialInput {
  targetType: ResetTargetType;
  organisationId: string;
}

// Stable key per root organisation: retries of the same org resume the same
// operation and can never create a second account.
export const rootTenantIdempotencyKey = (orgId: string) => `root-${orgId}`;

const assertOnboardingEnabled = () => {
  if (!FEATURE_FLAGS.ENABLE_ONBOARDING) {
    throw new Error('Onboarding temporarily unavailable.');
  }
};

export const tenantProvisioningService = {
  async provisionRootTenant(input: ProvisionRootTenantInput): Promise<ProvisioningResponse> {
    assertOnboardingEnabled();
    return provisioningRepository.provision({
      operation: 'root_tenant',
      idempotency_key: rootTenantIdempotencyKey(input.orgId),
      org_id: input.orgId,
      org_name: input.orgName,
      org_type: input.orgType,
      admin_email: input.adminEmail,
      festival_template: input.festivalTemplate,
    });
  },

  async provisionChildOrganisation(input: ProvisionChildOrganisationInput): Promise<ProvisioningResponse> {
    assertOnboardingEnabled();
    return provisioningRepository.provision({
      operation: 'child_organisation',
      idempotency_key: input.idempotencyKey ?? `child-${input.parentId}`,
      parent_id: input.parentId,
      org_name: input.orgName,
      org_type: input.orgType,
      username: input.username,
    });
  },

  async getProvisioningStatus(input: ProvisioningStatusInput): Promise<ProvisioningResponse> {
    return provisioningRepository.provision({
      operation: 'status',
      operation_type: input.operationType,
      idempotency_key: input.idempotencyKey,
    });
  },

  async resetCredential(input: ResetCredentialInput): Promise<ProvisioningResponse> {
    assertOnboardingEnabled();
    return provisioningRepository.provision({
      operation: 'reset_credential',
      target_type: input.targetType,
      organisation_id: input.organisationId,
    });
  },
};
