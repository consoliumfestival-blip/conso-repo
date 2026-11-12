import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, Text } from 'react-native';
import { AnnouncerQueue } from '@/components/leaderboard/AnnouncerQueue';
import { useFestival } from '@/core/hooks/useFestival';
import { useResultVisibility } from '@/core/hooks/useResultVisibility';
import { useAuthStore } from '@/core/store/authStore';

export default function SmartAnnouncerPage() {
  const { tenant_id, user } = useAuthStore();
  const { useActiveFestival } = useFestival();
  const { data: festival, isLoading: isFestivalLoading, error: festivalError } = useActiveFestival();
  const { results, isLoading, error, refetch } = useResultVisibility(festival?.id ? tenant_id : null, festival?.id);
  const items = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    results.forEach(result => {
      if (result.item_id && result.festival_id === festival?.id && result.published && result.result_status === 'published') {
        byId.set(result.item_id, { id: result.item_id, name: result.item_name_ml || result.item_name || result.item_id });
      }
    });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [results, festival?.id]);
  return <ScrollView contentContainerStyle={{ padding: 16 }}>
    {isFestivalLoading || (festival?.id && isLoading) ? <ActivityIndicator /> : festivalError ? <Text>Unable to load the active festival.</Text> : error ? <Text onPress={() => void refetch()}>Unable to load results. Tap to retry.</Text> :
      user?.id && tenant_id && festival?.id ? <AnnouncerQueue key={`${user.id}:${tenant_id}:${festival.id}`} userId={user.id} tenantId={tenant_id} festivalId={festival.id} items={items} /> :
        <Text>Select an active festival to manage the announcer queue.</Text>}
  </ScrollView>;
}
