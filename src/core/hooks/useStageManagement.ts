import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stageManagementService } from '../../services/stageManagementService';
import { useAuthStore } from '../store/authStore';

const mapSchedule = (row: any) => ({
  ...row,
  venues: row.venue_id ? { id: row.venue_id, name: row.venue_name } : null,
  items: {
    id: row.item_id,
    item_code: row.item_code,
    item_name_en: row.item_name_en,
    item_name_ml: row.item_name_ml,
    category_codes: row.category_codes ?? [],
  },
});

const mapRegistration = (row: any) => ({
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
});

export const useStageManagement = (options: { scheduleId?: string } = {}) => {
  const queryClient = useQueryClient();
  const { user, tenant_id, role, is_superadmin, initialized } = useAuthStore();
  const hasStageAccess = initialized && !!user && (role === 'admin' || is_superadmin);
  const contextQuery = useQuery({
    queryKey: ['stage-management-context', tenant_id],
    queryFn: () => stageManagementService.getContext(tenant_id),
    enabled: hasStageAccess,
    staleTime: 60_000,
  });

  const context = contextQuery.data;
  const schedulesQuery = useQuery({
    queryKey: ['stage-management-schedules', context?.tenant_id, context?.festival_id],
    queryFn: async () => (context ? (await stageManagementService.getSchedules(context.festival_id)).map(mapSchedule) : []),
    enabled: hasStageAccess && !!context?.tenant_id && !!context?.festival_id,
    staleTime: 15_000,
  });

  const venuesQuery = useQuery({
    queryKey: ['stage-management-venues', context?.tenant_id, context?.festival_id],
    queryFn: async () => (context ? stageManagementService.getVenues(context.festival_id) : []),
    enabled: hasStageAccess && !!context?.tenant_id && !!context?.festival_id,
    staleTime: 15_000,
  });

  const registrationsQuery = useQuery({
    queryKey: [
      'stage-management-registrations',
      context?.tenant_id,
      context?.festival_id,
      options.scheduleId ?? 'festival',
    ],
    queryFn: async () => {
      if (!context) return [];
      const rows = await stageManagementService.getRegistrations(
        options.scheduleId ? { scheduleId: options.scheduleId } : { festivalId: context.festival_id },
      );
      return rows.map(mapRegistration);
    },
    enabled: hasStageAccess && !!context?.tenant_id && !!context?.festival_id,
    staleTime: 10_000,
  });

  const updateRegistrationMutation = useMutation({
    mutationFn: (input: { scheduleId: string; registrationId: string; action: 'verify' | 'unverify' | 'reject' | 'restore' }) =>
      stageManagementService.updateRegistration(input.scheduleId, input.registrationId, input.action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stage-management-registrations'] });
    },
  });

  const updateCodeLetterMutation = useMutation({
    mutationFn: (input: { scheduleId: string; registrationId: string; codeLetter: string }) =>
      stageManagementService.updateCodeLetter(input.scheduleId, input.registrationId, input.codeLetter),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stage-management-registrations'] });
    },
  });

  const updateScheduleLockMutation = useMutation({
    mutationFn: (input: { scheduleId: string; locked: boolean }) =>
      stageManagementService.updateScheduleLock(input.scheduleId, input.locked),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stage-management-schedules'] });
    },
  });

  return {
    context,
    contextQuery,
    schedules: schedulesQuery.data ?? [],
    schedulesQuery,
    venues: venuesQuery.data ?? [],
    venuesQuery,
    registrations: registrationsQuery.data ?? [],
    registrationsQuery,
    updateRegistration: updateRegistrationMutation.mutateAsync,
    isUpdatingRegistration: updateRegistrationMutation.isPending,
    updateCodeLetter: updateCodeLetterMutation.mutateAsync,
    isUpdatingCodeLetter: updateCodeLetterMutation.isPending,
    updateScheduleLock: updateScheduleLockMutation.mutateAsync,
    isUpdatingScheduleLock: updateScheduleLockMutation.isPending,
  };
};
