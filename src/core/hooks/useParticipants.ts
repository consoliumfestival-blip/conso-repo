import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { participantService, ParticipantStatus } from '../../services/participantService';
import { stageManagementService } from '../../services/stageManagementService';
import { useAuthStore } from '../store/authStore';

export const usePublicCandidateProfile = (slug?: string | null) =>
  useQuery({
    queryKey: ['publicCandidateProfile', slug],
    queryFn: () => participantService.getPublicCandidateProfile(slug!),
    enabled: !!slug,
    staleTime: 1000 * 60 * 5,
  });

export const useParticipants = (participantId?: string) => {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['participants'],
    queryFn: () => participantService.listParticipants<any>(),
  });

  const detailQuery = useQuery({
    queryKey: ['participant', participantId],
    queryFn: () => participantService.getParticipant<any>(participantId!),
    enabled: !!participantId,
  });

  const registrationsQuery = useQuery({
    queryKey: ['participantRegistrations', participantId],
    queryFn: () => participantService.getParticipantRegistrations<any>(participantId!),
    enabled: !!participantId,
  });

  const useItemRegistrations = (itemId: string | undefined) => {
    const { tenant_id } = useAuthStore();
    return useQuery({
      queryKey: ['itemRegistrations', itemId, tenant_id],
      queryFn: () => participantService.getRegistrationsByItem<any>(itemId!, tenant_id!),
      enabled: !!itemId && !!tenant_id,
    });
  };

  // Operational screens must resolve registration scope from the selected
  // schedule. Item-only reads remain available for participant management,
  // but are not used by check-in, code letters, marks, or results.
  const useScheduleRegistrations = (scheduleId: string | undefined) => useQuery({
    queryKey: ['scheduleRegistrations', scheduleId],
    queryFn: async () => {
      const rows = await stageManagementService.getRegistrations({ scheduleId: scheduleId! });
      return rows.map((row: any) => ({
        ...row,
        participants: {
          id: row.participant_id,
          name: row.participant_name,
          chest_number: row.participant_chest_number,
          category_code: row.participant_category_code,
          organisations: row.organisation_id
            ? {
                id: row.organisation_id,
                name: row.organisation_name,
                org_type: row.organisation_type,
              }
            : null,
        },
      }));
    },
    enabled: !!scheduleId,
  });

  const useFestivalRegistrations = (festivalId: string | undefined) => {
    return useQuery({
      queryKey: ['festivalRegistrations', festivalId],
      queryFn: () => participantService.listRegistrationsByFestival<any>(festivalId!),
      enabled: !!festivalId,
    });
  };

  const useParticipantConflicts = (participantIds: string[], scheduleId: string | undefined) => {
    const { tenant_id } = useAuthStore();
    return useQuery({
      queryKey: ['participantConflicts', participantIds, scheduleId, tenant_id],
      queryFn: async () => {
        const { data, error } = await (await import('../../lib/repositories/participantRepository')).participantRepository.getParticipantConflicts(participantIds, scheduleId!, tenant_id ?? undefined);
        if (error) throw error;
        return data || {};
      },
      enabled: !!scheduleId && participantIds.length > 0 && !!tenant_id,
    });
  };

  const generateCodeLettersMutation = useMutation({
    mutationFn: ({ scheduleId, itemId, festivalId, overwrite, secureStage }: { scheduleId: string; itemId: string; festivalId?: string; overwrite?: boolean; secureStage?: boolean }) => {
      const tenantId = useAuthStore.getState().tenant_id;
      return participantService.generateCodeLetters(scheduleId, itemId, tenantId!, overwrite, festivalId, secureStage);
    },
    onSuccess: (data, variables) => {
      const tenantId = useAuthStore.getState().tenant_id;
      queryClient.invalidateQueries({ queryKey: ['itemRegistrations', variables.itemId, tenantId] });
      queryClient.invalidateQueries({ queryKey: ['scheduleRegistrations', variables.scheduleId] });
    },
  });

  const updateCodeLetterMutation = useMutation({
    mutationFn: ({ registrationId, codeLetter, itemId, scheduleId, secureStage }: { registrationId: string; codeLetter: string; itemId: string; scheduleId?: string; secureStage?: boolean }) => {
      return (async () => {
         const repository = (await import('../../lib/repositories/participantRepository')).participantRepository;
         const { error } = secureStage && scheduleId
           ? await repository.stageUpdateCodeLetter(scheduleId, registrationId, codeLetter)
           : await repository.updateCodeLetter(registrationId, codeLetter);
         if (error) throw error;
      })();
    },
    onSuccess: (data, variables) => {
      const tenantId = useAuthStore.getState().tenant_id;
      queryClient.invalidateQueries({ queryKey: ['itemRegistrations', variables.itemId, tenantId] });
      if (variables.scheduleId) queryClient.invalidateQueries({ queryKey: ['scheduleRegistrations', variables.scheduleId] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: ParticipantStatus; reason?: string | null }) => 
      participantService.updateStatus<any>(id, status, reason),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['participant', variables.id] });
    },
  });

  const updateParticipantMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Record<string, unknown> }) => 
      participantService.updateParticipant<any>(id, updates),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['participant', variables.id] });
    },
  });

  const uploadProfilePhotoMutation = useMutation({
    mutationFn: ({
      id,
      file,
      tenantId,
      festivalId,
      onProgress,
    }: {
      id: string;
      file: Blob | File;
      tenantId?: string | null;
      festivalId?: string | null;
      onProgress?: (progress: number) => void;
    }) => participantService.uploadProfilePhoto<any>(id, file, { tenantId, festivalId }, onProgress),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['participant', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['publicCandidateProfile'] });
    },
  });

  const removeProfilePhotoMutation = useMutation({
    mutationFn: (id: string) => participantService.removeProfilePhoto<any>(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['participant', id] });
      queryClient.invalidateQueries({ queryKey: ['publicCandidateProfile'] });
    },
  });

  const deleteParticipantMutation = useMutation({
    mutationFn: (id: string) => participantService.deleteParticipant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
    },
  });

  const terminateParticipantMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => participantService.terminateParticipant(id, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['participant', variables.id] });
    },
  });

  const revokeTerminationMutation = useMutation({
    mutationFn: (id: string) => participantService.revokeTermination(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['participant', id] });
    },
  });

  const deleteMultipleMutation = useMutation({
    mutationFn: (ids: string[]) => participantService.deleteParticipants(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
    },
  });

  const approveMultipleMutation = useMutation({
    mutationFn: (ids: string[]) => participantService.approveParticipants(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
    },
  });

  const generateChestNumberMutation = useMutation({
    mutationFn: (categoryCode: string) => participantService.generateChestNumber(categoryCode),
  });

  const regenerateChestNumbersMutation = useMutation({
    mutationFn: (festivalId: string) => participantService.regenerateFestivalChestNumbers(festivalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['publicCandidateProfile'] });
    },
  });

  const createParticipantMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => participantService.createParticipant<any>(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
    },
  });

  const registerParticipantMutation = useMutation({
    mutationFn: ({ participant, item, festivalConfig }: { participant: any, item: any, festivalConfig: any }) => 
      participantService.registerParticipantForItem<any>(participant, item, festivalConfig),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['participantRegistrations', variables.participant.id] });
      const tenantId = useAuthStore.getState().tenant_id;
      queryClient.invalidateQueries({ queryKey: ['itemRegistrations', variables.item.id, tenantId] });
    },
  });

  const deleteRegistrationMutation = useMutation({
    mutationFn: ({ registrationId, itemId, reason }: { registrationId: string; itemId?: string; reason?: string | null }) =>
      participantService.safeUnassignRegistration<any>(registrationId, reason).then((result) => ({ ...result, itemId })),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['participantRegistrations', participantId] });
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      if (data.status !== 'removed') return;
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['public-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['scheduleRegistrations'] });
      queryClient.invalidateQueries({ queryKey: ['public-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['markEntries'] });
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['admin-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['public-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['public-published-results'] });
      queryClient.invalidateQueries({ queryKey: ['festival-results'] });
      if (variables.itemId) {
        const tenantId = useAuthStore.getState().tenant_id;
        queryClient.invalidateQueries({ queryKey: ['itemRegistrations', variables.itemId, tenantId] });
      }
    },
  });

  return {
    participants: listQuery.data || [],
    isLoadingList: listQuery.isLoading,
    
    participant: detailQuery.data,
    isLoadingDetail: detailQuery.isLoading,
    
    registrations: registrationsQuery.data || [],
    isLoadingRegistrations: registrationsQuery.isLoading,
    
    updateStatus: updateStatusMutation.mutateAsync,
    isUpdatingStatus: updateStatusMutation.isPending,
    
    updateParticipant: updateParticipantMutation.mutateAsync,
    isUpdatingParticipant: updateParticipantMutation.isPending,
    uploadProfilePhoto: uploadProfilePhotoMutation.mutateAsync,
    removeProfilePhoto: removeProfilePhotoMutation.mutateAsync,
    isUploadingProfilePhoto: uploadProfilePhotoMutation.isPending,
    isRemovingProfilePhoto: removeProfilePhotoMutation.isPending,
    
    deleteParticipant: deleteParticipantMutation.mutateAsync,
    terminateParticipant: terminateParticipantMutation.mutateAsync,
    revokeTermination: revokeTerminationMutation.mutateAsync,
    isTerminating: terminateParticipantMutation.isPending,
    isRevokingTermination: revokeTerminationMutation.isPending,
    deleteMultiple: deleteMultipleMutation.mutateAsync,
    approveMultiple: approveMultipleMutation.mutateAsync,
    
    isDeleting: deleteParticipantMutation.isPending || deleteMultipleMutation.isPending,
    isApprovingMultiple: approveMultipleMutation.isPending,
    
    generateChestNumber: generateChestNumberMutation.mutateAsync,
    regenerateChestNumbers: regenerateChestNumbersMutation.mutateAsync,
    isRegeneratingChestNumbers: regenerateChestNumbersMutation.isPending,
    createParticipant: createParticipantMutation.mutateAsync,
    isCreating: createParticipantMutation.isPending,

    registerParticipant: registerParticipantMutation.mutateAsync,
    isRegistering: registerParticipantMutation.isPending,

    deleteRegistration: deleteRegistrationMutation.mutateAsync,
    isDeletingRegistration: deleteRegistrationMutation.isPending,

    useItemRegistrations,
    useScheduleRegistrations,
    useFestivalRegistrations,
    useParticipantConflicts,
    generateCodeLetters: generateCodeLettersMutation.mutateAsync,
    isGeneratingCodeLetters: generateCodeLettersMutation.isPending,
    updateCodeLetter: updateCodeLetterMutation.mutateAsync,
    isUpdatingCodeLetter: updateCodeLetterMutation.isPending,
  };
};
