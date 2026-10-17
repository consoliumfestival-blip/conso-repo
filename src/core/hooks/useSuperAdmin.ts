import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { superService } from '../../services/superService';
import { tenantProvisioningService, ProvisionRootTenantInput } from '../../services/tenantProvisioningService';

export function useSuperAdmin() {
  const queryClient = useQueryClient();

  const useStats = () => useQuery({
    queryKey: ['superadmin', 'stats'],
    queryFn: () => superService.getSuperAdminStats(),
  });

  const useGlobalOrganisations = <T>() => useQuery({
    queryKey: ['superadmin', 'organisations'],
    queryFn: () => superService.listGlobalOrganisations<T>(),
  });

  const useCreateGlobalOrganisation = <T>() => useMutation({
    mutationFn: (payload: Record<string, unknown>) => superService.createGlobalOrganisation<T>(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'organisations'] });
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'stats'] });
    },
  });

  const useDeleteGlobalOrganisation = () => useMutation({
    mutationFn: (id: string) => superService.deleteGlobalOrganisation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'organisations'] });
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'stats'] });
    },
  });

  const useTenantAccounts = <T>() => useQuery({
    queryKey: ['superadmin', 'tenants'],
    queryFn: () => superService.listTenantAccounts<T>(),
  });

  const useRevokeTenantAccess = () => useMutation({
    mutationFn: (orgId: string) => superService.revokeTenantAccess(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'tenants'] });
    },
  });

  const useDisableTenantAccess = () => useMutation({
    mutationFn: (payload: { orgId: string; reason?: string }) => superService.disableTenantAccess(payload.orgId, payload.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'tenants'] });
    },
  });

  const useEnableTenantAccess = () => useMutation({
    mutationFn: (payload: { orgId: string; reason?: string }) => superService.enableTenantAccess(payload.orgId, payload.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'tenants'] });
    },
  });

  const useTenantLeaderboardAgentPrompt = <T>(tenantId?: string | null) => useQuery({
    queryKey: ['superadmin', 'tenant-agent-prompt', tenantId],
    queryFn: () => superService.getTenantLeaderboardAgentPrompt<T>(tenantId!),
    enabled: !!tenantId,
  });

  const useProvisionRootTenant = () => useMutation({
    mutationFn: (input: ProvisionRootTenantInput) => tenantProvisioningService.provisionRootTenant(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'tenants'] });
    },
  });

  const useResetRootTenantCredential = () => useMutation({
    mutationFn: (organisationId: string) => tenantProvisioningService.resetCredential({
      targetType: 'root_admin',
      organisationId,
    }),
  });

  return {
    useStats,
    useGlobalOrganisations,
    useCreateGlobalOrganisation,
    useDeleteGlobalOrganisation,
    useTenantAccounts,
    useRevokeTenantAccess,
    useDisableTenantAccess,
    useEnableTenantAccess,
    useTenantLeaderboardAgentPrompt,
    useProvisionRootTenant,
    useResetRootTenantCredential,
  };
}
