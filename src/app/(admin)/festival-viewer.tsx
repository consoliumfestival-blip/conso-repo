import React from 'react';
import { Text } from 'react-native';
import { FestivalReadonlyPortalAdmin } from '@/components/team/FestivalReadonlyPortalAdmin';
import { useFestival } from '@/core/hooks/useFestival';
import { useAuthStore } from '@/core/store/authStore';
import { ui } from '@/constants/designSystem';
import { PortalManagementPage } from '@/components/layout/PortalManagementPage';

export default function FestivalViewerSettings() {
  const tenantId = useAuthStore(state => state.tenant_id);
  const { useActiveFestival } = useFestival();
  const { data: festival, isLoading, error, refetch } = useActiveFestival();
  return <PortalManagementPage
    title="Festival Viewer"
    description="Manage read-only access to participants and programs across festival teams."
    loading={isLoading}
  >
      {error ?
        <Text accessibilityRole="button" onPress={() => void refetch()} style={{ color: ui.colors.danger, paddingVertical: 12 }}>Unable to load the active festival. Tap to retry.</Text> :
        <FestivalReadonlyPortalAdmin tenantId={tenantId} festivalId={festival?.id} />}
  </PortalManagementPage>;
}
