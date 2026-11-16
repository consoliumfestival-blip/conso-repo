import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import React from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from 'react-native';
import { TeamLeaderProvider } from '@/core/contexts/TeamLeaderContext';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderThemeProvider, useTeamTheme } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamInstallPrompt } from '@/components/team/TeamInstallPrompt';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { useTenantFeatures, type TeamPortalSection } from '@/core/hooks/useTenantFeatures';
import { useAuthStore } from '@/core/store/authStore';

function TeamStackFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, logoutTeamLeader } = useAuthStore();
  const { context, loading, portalEnabled } = useTeamLeaderContext();
  const { settings, isLoading: settingsLoading } = useTenantFeatures(context?.parent_tenant_id);
  const portalModuleDisabled = !settingsLoading
    && (!settings.modules.team_leader_management || !settings.modules.team_leader_portal);
  const section: TeamPortalSection | null = pathname.startsWith('/team/my-team') ? 'my_team'
    : pathname.startsWith('/team/profile') ? 'my_team'
    : pathname.startsWith('/team/schedule') ? 'schedule'
      : pathname.startsWith('/team/results') ? 'results'
        : pathname.startsWith('/team/participants') ? 'participants'
          : pathname.startsWith('/team/programs') ? 'programs'
            : pathname.startsWith('/team/announcements') ? 'announcements' : null;
  const sectionDisabled = !!section && !!context && !settingsLoading && !settings.sections.team_leader_portal[section];

  React.useEffect(() => {
    if (sectionDisabled) router.replace('/team/dashboard');
  }, [router, sectionDisabled]);

  if (pathname === '/team/login' || pathname === '/team/first-login') {
    return <View style={{ flex: 1 }}>{children}</View>;
  }

  if (role === 'team_leader' && !loading && (!portalEnabled || portalModuleDisabled)) {
    return <View style={{ flex: 1, backgroundColor: '#F4F5F6', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <View style={{ width: '100%', maxWidth: 440, backgroundColor: '#FFFFFF', borderColor: '#DADFE3', borderWidth: 1, borderRadius: 16, padding: 22 }}>
        <Text style={{ color: '#1D1B19', fontSize: 19, fontWeight: '800' }}>Team Leader Portal unavailable</Text>
        <Text style={{ color: '#6D6965', fontSize: 13, lineHeight: 20, marginTop: 8 }}>This portal is disabled or your team access is no longer active. Contact the festival administrator.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={async () => { await logoutTeamLeader(); router.replace('/team/login'); }} style={{ minHeight: 44, marginTop: 16, borderRadius: 9, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>;
  }
  if (sectionDisabled) return <View style={{ flex: 1, backgroundColor: '#F4F5F6', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#0F766E" /></View>;

  return (
    <TeamLeaderAppShell persistentShell hideMobileHeader={pathname === '/team/dashboard'}>
      {children}
    </TeamLeaderAppShell>
  );
}

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
        <Stack
          layout={({ children }) => <TeamStackFrame>{children}</TeamStackFrame>}
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ui.colors.background } }}
        >
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
