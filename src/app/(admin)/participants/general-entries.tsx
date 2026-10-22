import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

// Preserve existing links while Programs owns group creation and roster editing.
export default function GeneralEntriesRedirect() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  return <Redirect href={{ pathname: '/(admin)/participants/programs',
    params: typeof edit === 'string' ? { edit } : {} } as any} />;
}
