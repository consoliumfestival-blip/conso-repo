import React from 'react';
import { Stack } from 'expo-router';
import BackgroundExportEngine from '@/components/leaderboard/BackgroundExportEngine';
import { AdminAppShell } from '@/components/layout/AdminAppShell';

export default function AdminLayout() {
  return (
    <AdminAppShell>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="participants/index" />
        <Stack.Screen name="participants/add" />
        <Stack.Screen name="participants/chest-cards" />
        <Stack.Screen name="participants/chest-numbers" />
        <Stack.Screen name="participants/import" />
        <Stack.Screen name="participants/manage-units" />
        <Stack.Screen name="participants/[id]/index" />
        <Stack.Screen name="schedule/index" />
        <Stack.Screen name="schedule/create" />
        <Stack.Screen name="schedule/venues" />
        <Stack.Screen name="schedule/[id]/checkin" />
        <Stack.Screen name="schedule/[id]/code-letter" />
        <Stack.Screen name="schedule/[id]/marks" />
        <Stack.Screen name="schedule/[id]/results" />
        <Stack.Screen name="judges/index" />
        <Stack.Screen name="judges/approvals" />
        <Stack.Screen name="judges/audit" />
        <Stack.Screen name="team-leaders" />
        <Stack.Screen name="organisations/index" />
        <Stack.Screen name="settings/leaderboard" />
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="settings/categories" />
        <Stack.Screen name="settings/team-leader-portal" />
        <Stack.Screen name="grace-marks/index" />
        <Stack.Screen name="smart-announcer/index" />
      </Stack>
      <BackgroundExportEngine />
    </AdminAppShell>
  );
}
