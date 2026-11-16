import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PublicUnavailableScreen } from '@/components/publicLanding/PublicUnavailableScreen';

export default function PublicUnavailableRoute() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const label = Array.isArray(section) ? section[0] : section;
  return <PublicUnavailableScreen
    title={label ? `${label} is unavailable.` : 'This public page is unavailable.'}
    message="The festival administrator has disabled this page or section. Admin sign in remains available."
  />;
}
