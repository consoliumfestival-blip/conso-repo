import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import StageVenuePortal from '@/components/stage/StageVenuePortal';

export default function VenueStageManagementPage() {
  const params = useLocalSearchParams();
  const venueId = Array.isArray(params.venueId) ? params.venueId[0] : params.venueId;

  if (!venueId || !/^[0-9a-f-]{36}$/i.test(venueId)) return null;
  return <StageVenuePortal venueId={venueId} />;
}
