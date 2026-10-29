import { scheduleOverviewService } from '../../services/scheduleOverviewService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduleService } from '../../services/scheduleService';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../config/supabase';
import { useFestival } from './useFestival';
import { scheduleLifecycleService } from '../../services/scheduleLifecycleService';

export const useSchedule = (options?: { overview?: boolean }) => {
  const { tenant_id, user } = useAuthStore();
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const queryClient = useQueryClient();

  // Venues
  const venuesQuery = useQuery({
    queryKey: ['venues', tenant_id, activeFestival?.id],
    queryFn: () => scheduleService.listVenues<any>(tenant_id!, activeFestival?.id),
    enabled: !!tenant_id && (!options?.overview || !!activeFestival?.id),
  });

  const createVenueMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => scheduleService.createVenue<any>(tenant_id!, {
      ...payload,
      festival_id: payload.festival_id ?? activeFestival?.id ?? null,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venues', tenant_id] }),
  });

  const updateVenueMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => scheduleService.updateVenue<any>(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venues', tenant_id] }),
  });

  const deleteVenueMutation = useMutation({
    mutationFn: (id: string) => scheduleService.deleteVenue(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venues', tenant_id] }),
  });

  // Schedules
  const schedulesQuery = useQuery({
    queryKey: options?.overview ? ['schedules', tenant_id, activeFestival?.id, 'overview', user?.id] : ['schedules', tenant_id, activeFestival?.id],
    queryFn: () => options?.overview ? scheduleOverviewService.schedules(tenant_id!, activeFestival!.id) : scheduleService.listSchedules<any>(tenant_id!, activeFestival?.id),
    enabled: !!tenant_id && (!options?.overview || !!activeFestival?.id),
  });

  const createScheduleMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => scheduleService.createSchedule<any>(tenant_id!, {
      ...payload,
      festival_id: payload.festival_id ?? activeFestival?.id ?? null,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules', tenant_id] }),
  });

  const createSchedulesMutation = useMutation({
    mutationFn: ({ festivalId, payloads }: { festivalId: string; payloads: Record<string, unknown>[] }) =>
      scheduleService.createSchedules<any>(tenant_id!, festivalId, payloads),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules', tenant_id] }),
  });

  const updateScheduleMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => scheduleService.updateSchedule<any>(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules', tenant_id] }),
  });

  const setScheduleStatusMutation = useMutation({
    mutationFn: ({ id, status, expectedStatus }: { id: string; status: 'scheduled' | 'ongoing' | 'completed'; expectedStatus: string | null | undefined }) =>
      scheduleLifecycleService.setStatus(id, status, expectedStatus),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules', tenant_id] }),
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (id: string) => scheduleService.deleteSchedule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules', tenant_id] }),
  });

  return {
    venues: venuesQuery.data || [],
    isLoadingVenues: venuesQuery.isLoading,
    createVenue: createVenueMutation.mutateAsync,
    isCreatingVenue: createVenueMutation.isPending,
    updateVenue: updateVenueMutation.mutateAsync,
    isUpdatingVenue: updateVenueMutation.isPending,
    deleteVenue: deleteVenueMutation.mutateAsync,
    isDeletingVenue: deleteVenueMutation.isPending,

    schedules: schedulesQuery.data || [],
    isLoadingSchedules: schedulesQuery.isLoading,
    isErrorSchedules: schedulesQuery.isError,
    refetchSchedules: schedulesQuery.refetch,
    createSchedule: createScheduleMutation.mutateAsync,
    isCreatingSchedule: createScheduleMutation.isPending,
    createSchedules: createSchedulesMutation.mutateAsync,
    isCreatingSchedules: createSchedulesMutation.isPending,
    updateSchedule: updateScheduleMutation.mutateAsync,
    isUpdatingSchedule: updateScheduleMutation.isPending,
    setScheduleStatus: setScheduleStatusMutation.mutateAsync,
    isSettingScheduleStatus: setScheduleStatusMutation.isPending,
    deleteSchedule: deleteScheduleMutation.mutateAsync,
    isDeletingSchedule: deleteScheduleMutation.isPending,
  };
};

export const fetchPublicSchedules = async (festivalId: string, tenantId?: string) => {
  if (!tenantId) throw new Error('Tenant ID is required to load public schedules');

  const { data, error } = await supabase.rpc('get_public_schedules_scoped', {
    p_tenant_id: tenantId,
    p_festival_id: festivalId,
  });

  if (error) {
    // The web deployment may precede its database migration. Preserve the
    // existing public schedule flow only while the new RPC is unavailable.
    if (error.code !== 'PGRST202' && error.code !== '42883') throw new Error(error.message);
    const [schedulesRes, verificationRes] = await Promise.all([
      supabase.from('vw_public_schedule').select('*').eq('festival_id', festivalId).order('start_time'),
      supabase.rpc('get_public_verification_status', { p_tenant_id: tenantId }),
    ]);
    if (schedulesRes.error) throw new Error(schedulesRes.error.message);
    const verificationMap = new Map((verificationRes.data || []).map((row: any) => [row.schedule_id, row]));
    return (schedulesRes.data || []).map((row: any) => {
      const verification = verificationMap.get(row.schedule_id) as any;
      return {
        ...row,
        id: row.schedule_id,
        has_results: row.has_results || verification?.has_results || false,
        has_marks: verification?.has_marks || false,
        has_codes: verification?.has_codes || false,
        venues: row.venue_id ? { id: row.venue_id, name: row.venue_name, location: row.venue_location } : null,
        items: {
          id: row.item_id,
          item_code: row.item_code,
          item_name_en: row.item_name,
          item_name_ml: row.item_name_ml,
          item_type: row.item_type,
          category_codes: row.item_category_codes || [],
        },
      };
    });
  }

  return ((data || []) as any[]).map((row) => ({
    ...row,
    id: row.schedule_id,
    venues: row.venue_id ? { id: row.venue_id, name: row.venue_name, location: row.venue_location } : null,
    items: {
      id: row.item_id,
      item_code: row.item_code,
      item_name_en: row.item_name,
      item_name_ml: row.item_name_ml,
      item_type: row.item_type,
      category_codes: row.item_category_codes || [],
    },
  }));
};

export const usePublicSchedule = (festivalId?: string | null, tenantId?: string | null) => {
  return useQuery({
    queryKey: ['public-schedules', tenantId, festivalId],
    queryFn: () => {
      if (!festivalId) throw new Error('Festival ID is required');
      return fetchPublicSchedules(festivalId, tenantId || undefined);
    },
    enabled: !!festivalId && !!tenantId,
    staleTime: 1000,
    refetchInterval: 60000,
  });
};
