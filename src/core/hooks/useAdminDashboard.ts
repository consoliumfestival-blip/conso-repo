import { useQuery } from '@tanstack/react-query';
import { adminDashboardService } from '../../services/adminDashboardService';
import { useAuthStore } from '../store/authStore';
import { useFestival } from './useFestival';
import { useRef } from 'react';

export function useAdminDashboard() {
  const { tenant_id, user } = useAuthStore();
  const { useActiveFestival } = useFestival();

  const useStats = () => {
    const festival = useActiveFestival();
    const festivalId = festival.data?.id ?? null;
    const ready = !!tenant_id && !!user?.id && festival.isSuccess && !festival.isFetching;
    const query = useQuery({
      queryKey: ['adminDashboard', 'aggregates', tenant_id, user?.id, festivalId],
      queryFn: ({ signal }) => adminDashboardService.getDashboardStats(tenant_id!, festivalId, signal),
      enabled: ready,
      staleTime: Infinity, refetchOnMount: false, refetchOnWindowFocus: false,
      refetchOnReconnect: false, refetchInterval: false, retry: false,
    });
    const lock = useRef<Promise<unknown> | null>(null);
    const refetch = () => {
      if (lock.current) return lock.current;
      const pending = festival.isError ? festival.refetch() : ready ? query.refetch({ cancelRefetch: false }) : Promise.resolve();
      lock.current = pending;
      void pending.finally(() => { if (lock.current === pending) lock.current = null; }).catch(() => {});
      return pending;
    };
    return { ...query, refetch, isLoading: festival.isPending || (!query.data && !!festival.isFetching) || query.isLoading, isError: festival.isError || query.isError };
  };

  return {
    useStats,
  };
}
