import React from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfCard } from '@/components/ui/SsfCard';
import { SsfButton } from '@/components/ui/SsfButton';
import { useQuery } from '@tanstack/react-query';
import { stageManagementService } from '@/services/stageManagementService';
import AdminDashboardContent from '@/components/admin/AdminDashboardContent';
import { useAuthStore } from '@/core/store/authStore';

export default function AdminDashboard() {
  const router = useRouter();
  const { initialized, user, role, is_superadmin } = useAuthStore();
  const canCheckDashboard = initialized && !!user && (role === 'admin' || is_superadmin);
  const dashboardFlag = useQuery({
    queryKey: ['main-admin-dashboard-enabled'],
    queryFn: () => stageManagementService.isMainAdminDashboardEnabled(),
    enabled: canCheckDashboard,
    retry: false,
    staleTime: 60_000,
  });

  // Do not call an administrator-only RPC until auth has established an
  // administrator session. The route guard redirects unauthenticated users.
  if (!canCheckDashboard || dashboardFlag.isPending) return <View className="flex-1 items-center justify-center bg-ssf-bg"><ActivityIndicator /></View>;
  if (dashboardFlag.data) return <AdminDashboardContent />;
  return (
    <View className="flex-1 bg-ssf-bg px-4 py-6">
      <SsfCard className="mx-auto w-full max-w-xl p-5">
        <Text className="font-poppins-bold text-xl text-ssf-text">
          {dashboardFlag.isError ? 'Dashboard status unavailable' : 'Dashboard disabled'}
        </Text>
        <Text className="mt-2 font-poppins text-sm text-ssf-text-muted">
          {dashboardFlag.isError
            ? 'Dashboard status could not be verified. Dashboard data requests are paused.'
            : 'The main dashboard is temporarily unavailable. Other management pages remain available.'}
        </Text>
        <SsfButton label="Open Stage Management" onPress={() => router.push('/stage-management' as any)} className="mt-4" />
      </SsfCard>
    </View>
  );
}
