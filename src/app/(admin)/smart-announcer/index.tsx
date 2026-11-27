import { Text } from 'react-native';
import { PortalManagementPage } from '@/components/layout/PortalManagementPage';
import { AnnouncerQueue } from '@/components/leaderboard/AnnouncerQueue';
import { useFestival } from '@/core/hooks/useFestival';
import { useAuthStore } from '@/core/store/authStore';

export default function SmartAnnouncerPage() {
  const { tenant_id, user } = useAuthStore();
  const { useActiveFestival } = useFestival();
  const { data: festival, isLoading: isFestivalLoading, error: festivalError } = useActiveFestival();
  return <PortalManagementPage
    title="Smart Announcer"
    description="Manage the announcement queue and announcer access."
    loading={isFestivalLoading}
  >
    {festivalError ? <Text>Unable to load the active festival.</Text> :
      user?.id && tenant_id && festival?.id ? <AnnouncerQueue key={`${user.id}:${tenant_id}:${festival.id}`} userId={user.id} tenantId={tenant_id} festivalId={festival.id} /> :
        <Text>Select an active festival to manage the announcer queue.</Text>}
  </PortalManagementPage>;
}
