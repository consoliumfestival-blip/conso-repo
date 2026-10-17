import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { organisationService } from '../../services/organisationService';
import { useAuthStore } from '../store/authStore';

export const useOrganisations = () => {
  const queryClient = useQueryClient();
  const { tenant_id } = useAuthStore();

  const myOrganisationQuery = useQuery({
    queryKey: ['myOrganisation', tenant_id],
    queryFn: () => organisationService.getMyOrganisation(tenant_id!),
    enabled: !!tenant_id,
  });

  const parentId = myOrganisationQuery.data?.id;

  const childOrganisationsQuery = useQuery({
    queryKey: ['childOrganisations', parentId],
    queryFn: () => organisationService.getChildOrganisations(parentId!),
    enabled: !!parentId,
  });

  const createOrganisationMutation = useMutation({
    mutationFn: ({ orgName, orgType, username, idempotencyKey }: { orgName: string; orgType?: string; username: string; idempotencyKey?: string }) => {
      if (!parentId) throw new Error('Parent ID not found');
      return organisationService.createSubOrganisation(parentId, orgName, orgType, username, idempotencyKey);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['childOrganisations', parentId] });
    },
  });

  const archiveOrganisationMutation = useMutation({
    mutationFn: (orgId: string) => organisationService.archiveChildOrganisation(orgId),
    onSuccess: (_result, orgId) => {
      // Remove the archived row immediately. The repository query also
      // excludes archived_at rows, but updating the cache prevents the old
      // row from remaining visible until the refetch completes.
      queryClient.setQueryData<any[]>(['childOrganisations', parentId], (current = []) =>
        current.filter((organisation) => organisation.id !== orgId)
      );
      queryClient.invalidateQueries({ queryKey: ['childOrganisations', parentId], refetchType: 'active' });
    },
  });

  const resetCredentialMutation = useMutation({
    mutationFn: (organisationId: string) => organisationService.resetOrganisationCredential(organisationId),
  });

  return {
    myOrganisation: myOrganisationQuery.data,
    isLoadingMyOrg: myOrganisationQuery.isLoading,
    childOrganisations: childOrganisationsQuery.data || [],
    childOrganisationsError: childOrganisationsQuery.error,
    refetchChildOrganisations: childOrganisationsQuery.refetch,
    isLoadingChildren: childOrganisationsQuery.isLoading || myOrganisationQuery.isLoading,
    createOrganisation: createOrganisationMutation.mutateAsync,
    isCreating: createOrganisationMutation.isPending,
    archiveOrganisation: archiveOrganisationMutation.mutateAsync,
    isArchiving: archiveOrganisationMutation.isPending,
    resetCredential: resetCredentialMutation.mutateAsync,
    isResettingCredential: resetCredentialMutation.isPending,
  };
};
