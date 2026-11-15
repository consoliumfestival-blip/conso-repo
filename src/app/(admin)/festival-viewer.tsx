import React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { FestivalReadonlyPortalAdmin } from '@/components/team/FestivalReadonlyPortalAdmin';
import { useFestival } from '@/core/hooks/useFestival';
import { useAuthStore } from '@/core/store/authStore';
import { ui } from '@/constants/designSystem';
import { PortalManagementHeader } from '@/components/layout/PortalManagementHeader';

export default function FestivalViewerSettings() {
  const tenantId = useAuthStore(state => state.tenant_id);
  const { useActiveFestival } = useFestival();
  const { data: festival, isLoading, error, refetch } = useActiveFestival();
  return <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
    <View style={{ width: '100%', maxWidth: 1000, alignSelf: 'center' }}>
      <PortalManagementHeader title="Festival Viewer" description="Manage read-only access to participants and programs across festival teams." />
      {isLoading ? <ActivityIndicator color={ui.colors.primary} /> : error ?
        <Text accessibilityRole="button" onPress={() => void refetch()} style={{ color: ui.colors.danger, paddingVertical: 12 }}>Unable to load the active festival. Tap to retry.</Text> :
        <FestivalReadonlyPortalAdmin tenantId={tenantId} festivalId={festival?.id} />}
    </View>
  </ScrollView>;
}
