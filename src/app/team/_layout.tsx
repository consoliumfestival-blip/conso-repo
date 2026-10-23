import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import React from 'react';
import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';
import { TeamLeaderProvider } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderThemeProvider, useTeamTheme } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamInstallPrompt } from '@/components/team/TeamInstallPrompt';

export default function TeamLeaderLayout() {
  return (
    <TeamLeaderProvider>
      <TeamLeaderThemeProvider>
        <TeamLeaderNavigation />
      </TeamLeaderThemeProvider>
    </TeamLeaderProvider>
  );
}

function TeamLeaderNavigation() {
  const { ui } = useTeamTheme();
  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const rootStyle = document.documentElement.style;
    const previous = rootStyle.getPropertyValue('--team-portal-scrollbar-color');
    rootStyle.setProperty('--team-portal-scrollbar-color', `${ui.colors.primary}4D`);
    rootStyle.setProperty('--team-portal-scrollbar-hover', ui.colors.primaryStrong);
    return () => {
      if (previous) rootStyle.setProperty('--team-portal-scrollbar-color', previous);
      else rootStyle.removeProperty('--team-portal-scrollbar-color');
      rootStyle.removeProperty('--team-portal-scrollbar-hover');
    };
  }, [ui.colors.primary, ui.colors.primaryStrong]);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const existingThemeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousThemeColor = existingThemeColor?.content;
    const themeColorFromBootstrap = existingThemeColor?.dataset.teamPortalBootstrap === 'true';
    const themeColor = existingThemeColor || document.createElement('meta');
    themeColor.name = 'theme-color';
    themeColor.content = '#1D1B19';
    if (!existingThemeColor) document.head.appendChild(themeColor);
    const appleMetaStates = (['apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style'] as const).map((name) => {
      const existing = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      const meta = existing || document.createElement('meta');
      const previous = existing?.content ?? '';
      meta.name = name;
      meta.content = name === 'apple-mobile-web-app-capable' ? 'yes' : 'black-translucent';
      if (!existing) document.head.appendChild(meta);
      return { meta, existing: !!existing, previous };
    });
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const previousViewport = viewport?.content;
    const viewportFromBootstrap = viewport?.dataset.teamPortalBootstrap === 'true';
    const bootstrapPreviousViewport = viewport?.dataset.teamPortalPreviousContent;
    if (viewport) viewport.content = 'width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover';
    const previousDocumentBackground = document.documentElement.style.backgroundColor;
    const previousBodyBackground = document.body.style.backgroundColor;
    const documentBackgroundFromBootstrap = document.documentElement.dataset.teamPortalBootstrap === 'true';
    const bodyBackgroundFromBootstrap = document.body.dataset.teamPortalBootstrap === 'true';
    const bootstrapPreviousDocumentBackground = document.documentElement.dataset.teamPortalPreviousBackground;
    const bootstrapPreviousBodyBackground = document.body.dataset.teamPortalPreviousBackground;
    document.documentElement.style.backgroundColor = '#F4F5F6';
    document.body.style.backgroundColor = '#F4F5F6';
    return () => {
      if (themeColorFromBootstrap) {
        document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][data-team-portal-bootstrap="true"]').forEach((item) => {
          if (item.dataset.teamPortalCreated === 'true') item.remove();
          else {
            item.content = item.dataset.teamPortalPreviousColor || '';
            delete item.dataset.teamPortalBootstrap;
            delete item.dataset.teamPortalPreviousColor;
          }
        });
      }
      else if (existingThemeColor) themeColor.content = previousThemeColor || '';
      else themeColor.remove();
      appleMetaStates.forEach(({ meta, existing, previous }) => {
        if (existing) meta.content = previous;
        else meta.remove();
      });
      if (viewport && previousViewport) viewport.content = viewportFromBootstrap
        ? bootstrapPreviousViewport || 'width=device-width, initial-scale=1, shrink-to-fit=no'
        : previousViewport;
      if (viewportFromBootstrap && viewport) {
        delete viewport.dataset.teamPortalBootstrap;
        delete viewport.dataset.teamPortalPreviousContent;
      }
      document.documentElement.style.backgroundColor = documentBackgroundFromBootstrap ? bootstrapPreviousDocumentBackground || '' : previousDocumentBackground;
      document.body.style.backgroundColor = bodyBackgroundFromBootstrap ? bootstrapPreviousBodyBackground || '' : previousBodyBackground;
      delete document.documentElement.dataset.teamPortalBootstrap;
      delete document.documentElement.dataset.teamPortalPreviousBackground;
      delete document.body.dataset.teamPortalBootstrap;
      delete document.body.dataset.teamPortalPreviousBackground;
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
