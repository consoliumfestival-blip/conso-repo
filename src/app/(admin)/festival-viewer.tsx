import React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { FestivalReadonlyPortalAdmin } from '@/components/team/FestivalReadonlyPortalAdmin';
import { useFestival } from '@/core/hooks/useFestival';
import { useAuthStore } from '@/core/store/authStore';
import { ui } from '@/constants/designSystem';

export default function FestivalViewerSettings() {
  const tenantId = useAuthStore(state => state.tenant_id);
  const { useActiveFestival } = useFestival();
  const { data: festival, isLoading, error, refetch } = useActiveFestival();
  return <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
    <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: ui.colors.text }}>Festival Viewer</Text>
        <Text style={{ fontSize: 13, color: ui.colors.textMuted }}>Manage read-only access to participants and programs across festival teams.</Text>
      </View>
      {isLoading ? <ActivityIndicator color={ui.colors.primary} /> : error ?
        <Text accessibilityRole="button" onPress={() => void refetch()} style={{ color: ui.colors.danger, paddingVertical: 12 }}>Unable to load the active festival. Tap to retry.</Text> :
        <FestivalReadonlyPortalAdmin tenantId={tenantId} festivalId={festival?.id} />}
    </View>
  </ScrollView>;
}
