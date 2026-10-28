import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import StageVenuePortal from '@/components/stage/StageVenuePortal';
import { stageManagementService } from '@/services/stageManagementService';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Text, View } from 'react-native';

export default function VenueStageManagementPage() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const venueId = Array.isArray(params.venueId) ? params.venueId[0] : params.venueId;
  const validVenueId = !!venueId && /^[0-9a-f-]{36}$/i.test(venueId);
  const modeQuery = useQuery({
    queryKey: ['stage-venue-read-mode', venueId],
    queryFn: () => stageManagementService.getVenueReadMode(venueId!),
    enabled: validVenueId,
    retry: false,
    staleTime: 15_000,
  });

  React.useEffect(() => {
    if (!validVenueId || !modeQuery.data) return;
    const canonical = modeQuery.data === 'v2' ? 'v2' : undefined;
    if (params.read !== canonical) {
      router.replace(`/stage-management/venue/${venueId}${canonical ? '?read=v2' : ''}` as any);
    }
  }, [modeQuery.data, params.read, router, validVenueId, venueId]);

  if (!validVenueId) return null;
  if (modeQuery.isPending) return <View className="flex-1 items-center justify-center bg-ssf-bg"><ActivityIndicator /></View>;
  if (modeQuery.isError) return <View className="flex-1 items-center justify-center bg-ssf-bg px-5"><Text>Stage mode unavailable. Refresh to retry.</Text></View>;
  return <StageVenuePortal venueId={venueId!} optimizedRead={modeQuery.data === 'v2'} />;
}
