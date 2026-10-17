import React from 'react';
import { Stack } from 'expo-router';
import { TeamLeaderProvider } from '@/core/contexts/TeamLeaderContext';

export default function TeamLeaderLayout() {
  return (
    <TeamLeaderProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="my-team" />
        <Stack.Screen name="schedule" />
        <Stack.Screen name="schedule/full" />
        <Stack.Screen name="results" />
        <Stack.Screen name="participants" />
        <Stack.Screen name="announcements" />
        <Stack.Screen name="profile" />
      </Stack>
    </TeamLeaderProvider>
  );
}
