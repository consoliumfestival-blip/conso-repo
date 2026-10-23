import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import React from 'react';
import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';
import { TeamLeaderProvider } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderThemeProvider, useTeamTheme } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamInstallPrompt } from '@/components/team/TeamInstallPrompt';

export default function TeamLeaderLayout() {
  return (
    <TeamLeaderThemeProvider>
      <TeamLeaderProvider>
        <TeamLeaderNavigation />
      </TeamLeaderProvider>
    </TeamLeaderThemeProvider>
  );
}

function TeamLeaderNavigation() {
  const { ui } = useTeamTheme();
  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="manifest"]'));
    const previousHrefs = links.map((link) => link.href);
    let addedLink: HTMLLinkElement | null = null;
    if (links.length === 0) {
      addedLink = document.createElement('link');
      addedLink.rel = 'manifest';
      document.head.appendChild(addedLink);
      links.push(addedLink);
    }
    links.forEach((link) => { link.href = '/team-manifest.json'; });
    return () => {
      links.forEach((link, index) => {
        if (link === addedLink) link.remove();
        else link.href = previousHrefs[index];
      });
    };
  }, []);

  return (
    <ThemeProvider value={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: ui.colors.background, card: ui.colors.surface, primary: ui.colors.primary, border: ui.colors.border, text: ui.colors.text } }}>
      <View style={{ flex: 1, backgroundColor: ui.colors.background }}>
        <TeamInstallPrompt />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ui.colors.background } }}>
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
      </View>
    </ThemeProvider>
  );
}
