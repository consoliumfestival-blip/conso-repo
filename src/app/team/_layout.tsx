import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { teamUi } from '@/constants/teamLeaderTheme';
import React from 'react';
import { Stack } from 'expo-router';
import { TeamLeaderProvider } from '@/core/contexts/TeamLeaderContext';

export default function TeamLeaderLayout() {
  return (
    <TeamLeaderProvider>
      <ThemeProvider value={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: teamUi.colors.background, card: teamUi.colors.surface, primary: teamUi.colors.primary, border: teamUi.colors.border, text: teamUi.colors.text } }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: teamUi.colors.background } }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="first-login" />
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="my-team" />
        <Stack.Screen name="schedule" />
        <Stack.Screen name="schedule/full" />
        <Stack.Screen name="results" />
        <Stack.Screen name="participants" />
        <Stack.Screen name="programs" />
        <Stack.Screen name="announcements" />
        <Stack.Screen name="profile" />
      </Stack>
    </ThemeProvider>
    </TeamLeaderProvider>
  );
}
