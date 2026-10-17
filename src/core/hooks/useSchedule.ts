import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduleService } from '../../services/scheduleService';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../config/supabase';
import { useFestival } from './useFestival';

export const useSchedule = () => {
  const { tenant_id } = useAuthStore();
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const queryClient = useQueryClient();

  // Venues
  const venuesQuery = useQuery({
    queryKey: ['venues', tenant_id, activeFestival?.id],
    queryFn: () => scheduleService.listVenues<any>(tenant_id!, activeFestival?.id),
    enabled: !!tenant_id,
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
    queryKey: ['schedules', tenant_id, activeFestival?.id],
    queryFn: () => scheduleService.listSchedules<any>(tenant_id!, activeFestival?.id),
    enabled: !!tenant_id,
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
    createSchedule: createScheduleMutation.mutateAsync,
    isCreatingSchedule: createScheduleMutation.isPending,
    createSchedules: createSchedulesMutation.mutateAsync,
    isCreatingSchedules: createSchedulesMutation.isPending,
    updateSchedule: updateScheduleMutation.mutateAsync,
    isUpdatingSchedule: updateScheduleMutation.isPending,
    deleteSchedule: deleteScheduleMutation.mutateAsync,
    isDeletingSchedule: deleteScheduleMutation.isPending,
  };
};

export const fetchPublicSchedules = async (festivalId: string, tenantId?: string) => {
  const [schedulesRes, verificationRes] = await Promise.all([
    supabase
      .from('vw_public_schedule')
      .select('*')
      .eq('festival_id', festivalId)
      .order('start_time'),
    tenantId ? supabase.rpc('get_public_verification_status', { p_tenant_id: tenantId }) : Promise.resolve({ data: [] })
  ]);

  if (schedulesRes.error) throw new Error(schedulesRes.error.message);
  
  const verificationMap = (verificationRes.data || []).reduce((acc: any, row: any) => {
    acc[row.schedule_id] = row;
    return acc;
  }, {});

  return (schedulesRes.data || []).map((row: any) => {
    const vStatus = verificationMap[row.schedule_id] || {};
    return {
      ...row,
      id: row.schedule_id,
      is_published: row.is_published,
      has_results: row.has_results || vStatus.has_results || false,
      has_marks: vStatus.has_marks || false,
      has_codes: vStatus.has_codes || false,
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
};

export const usePublicSchedule = (festivalId?: string | null, tenantId?: string | null) => {
  return useQuery({
    queryKey: ['publicSchedule', festivalId, tenantId],
    queryFn: () => {
      if (!festivalId) throw new Error('Festival ID is required');
      return fetchPublicSchedules(festivalId, tenantId || undefined);
    },
    enabled: !!festivalId,
    staleTime: 1000, 
  });
};
