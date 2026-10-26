import { useQuery } from '@tanstack/react-query';
import { adminDashboardService } from '../../services/adminDashboardService';
import { useAuthStore } from '../store/authStore';

export function useAdminDashboard() {
  const { tenant_id, user } = useAuthStore();

  const useStats = () => useQuery({
    queryKey: ['adminDashboard', 'stats', tenant_id, user?.id],
    queryFn: () => adminDashboardService.getDashboardStats(tenant_id!),
    enabled: !!tenant_id,
    staleTime: 45_000,
  });

  return {
    useStats,
  };
}
