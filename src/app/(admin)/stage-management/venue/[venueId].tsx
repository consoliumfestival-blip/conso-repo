import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import { StageManagementDashboard } from '../index';

export default function VenueStageManagementPage() {
  const params = useLocalSearchParams();
  const venueId = Array.isArray(params.venueId) ? params.venueId[0] : params.venueId;

  return <StageManagementDashboard venueIdOverride={venueId} />;
}
