import { teamUi } from '@/constants/teamLeaderTheme';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Slot, Stack, usePathname, useRouter, useSegments } from "expo-router";
import { readCoreAppearance, resolveCoreColors } from '@/constants/coreTheme';
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import "../global.css";
import { ActivityIndicator, AppState, Platform, Pressable, Text, View } from "react-native";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_900Black,
} from "@expo-google-fonts/poppins";
import {
  Montserrat_300Light,
  Montserrat_700Bold,
} from "@expo-google-fonts/montserrat";
import { useEffect, useRef, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { useProtectedRoute } from "../core/hooks/useProtectedRoute";
import { useAuthStore } from "../core/store/authStore";
import { NotificationProvider } from "../core/contexts/NotificationContext";
import { NotificationToast } from "../components/ui/NotificationToast";

// Removed top-level preventAutoHideAsync, moving it inside component

const LOADING_BG = "#011635";

function AppLoadingScreen() {
  const pathname = usePathname();
  const router = useRouter();
  const teamRoute = pathname.startsWith('/team');
  const teamSessionStatus = useAuthStore((state) => state.teamSessionStatus);
  const teamSessionError = useAuthStore((state) => state.teamSessionError);
  const checkSession = useAuthStore((state) => state.checkSession);
  const logoutTeamLeader = useAuthStore((state) => state.logoutTeamLeader);
  const [logoutError, setLogoutError] = useState('');
  const coreRoute = ['(admin)', '(super)', '(auth)'].includes(String(useSegments()[0]));
  const systemDark = useColorScheme() === 'dark';
  const coreColors = resolveCoreColors(readCoreAppearance(), systemDark);

  if (teamRoute && teamSessionStatus === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: teamUi.colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 420, padding: 20, borderRadius: 14, borderWidth: 1, borderColor: teamUi.colors.border, backgroundColor: teamUi.colors.surface }}>
          <Text style={{ color: teamUi.colors.text, fontSize: 17, fontWeight: '800' }}>Team Leader session</Text>
          <Text accessibilityRole="alert" style={{ color: teamUi.colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 }}>{teamSessionError}</Text>
          {logoutError ? <Text accessibilityRole="alert" style={{ color: teamUi.colors.danger, fontSize: 12, marginTop: 8 }}>{logoutError}</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => checkSession({ teamLeaderRoute: true })}
            style={{ minHeight: 44, marginTop: 18, borderRadius: 9, backgroundColor: teamUi.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: teamUi.colors.onPrimary, fontSize: 13, fontWeight: '700' }}>Retry</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={async () => {
            setLogoutError('');
            try {
              await logoutTeamLeader();
              router.replace('/team/login');
            } catch (error: any) {
              setLogoutError(error?.message || 'Could not sign out. Please try again.');
            }
          }} style={{ minHeight: 44, marginTop: 8, borderRadius: 9, borderWidth: 1, borderColor: teamUi.colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: teamUi.colors.text, fontSize: 13, fontWeight: '700' }}>Sign out on this device</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: teamRoute ? teamUi.colors.background : coreRoute ? coreColors.background : LOADING_BG,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <ActivityIndicator size="large" color={teamRoute ? teamUi.colors.primary : coreRoute ? coreColors.primaryText : "#c69a53"} />
    </View>
  );
}

function LayoutContent() {
  const blockProtectedCoreRoute = useProtectedRoute();
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const manifestPath = pathname === "/team-leaders"
      ? "/team-management-manifest.json"
      : pathname === "/team" || pathname.startsWith("/team/")
        ? "/team-manifest.json"
        : pathname.startsWith("/stage-management/venue/")
          ? `/portal-manifest?portal=stage&identity=${encodeURIComponent(pathname.split('/')[3] || '')}`
        : "/manifest.json";
    const portal = pathname === "/team-leaders"
      ? "team-management"
      : pathname === "/team" || pathname.startsWith("/team/")
        ? "team"
      : pathname.startsWith("/stage-management/venue/") ? "stage" : "admin";
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="manifest"]'));
    if (links.length === 0) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = manifestPath;
      document.head.appendChild(link);
      return;
    }
    links.forEach((link) => {
      if (link.dataset.portalPwa === portal) return;
      link.href = manifestPath;
      delete link.dataset.portalPwa;
    });
  }, [pathname]);

  if (blockProtectedCoreRoute) return <AppLoadingScreen />;
  return <Slot />;
}

export const unstable_settings = {
  anchor: "(public)",
};

const queryClient = new QueryClient();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const teamPortalAtStartup = useRef(pathname.startsWith('/team/')).current;
  const checkSession = useAuthStore((state) => state.checkSession);
  const initialized = useAuthStore((state) => state.initialized);

  const [fontsLoaded, fontError] = useFonts(
    Platform.OS === "web"
      ? {}
      : {
          Poppins_400Regular,
          Poppins_500Medium,
          Poppins_600SemiBold,
          Poppins_700Bold,
          Poppins_900Black,
          Montserrat_300Light,
          Montserrat_700Bold,
          CooperBlack: require("../../fonts/CooperBlack-Std.otf"),
        },
  );

  useEffect(() => {
    SplashScreen.preventAutoHideAsync().catch(() => {});
    checkSession({ teamLeaderRoute: teamPortalAtStartup });
  }, [checkSession, teamPortalAtStartup]);

  useEffect(() => {
    if (!teamPortalAtStartup) return;
    const retryIfRecovering = () => {
      if (useAuthStore.getState().teamSessionStatus === 'error') {
        checkSession({ teamLeaderRoute: true });
      }
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.addEventListener('online', retryIfRecovering);
      document.addEventListener('visibilitychange', retryIfRecovering);
    }
    const appStateListener = AppState.addEventListener('change', (state) => {
      if (state === 'active') retryIfRecovering();
    });
    return () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
        window.removeEventListener('online', retryIfRecovering);
        document.removeEventListener('visibilitychange', retryIfRecovering);
      }
      appStateListener.remove();
    };
  }, [checkSession, teamPortalAtStartup]);

  useEffect(() => {
    if ((fontsLoaded || fontError) && initialized) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, initialized]);

  if ((!fontsLoaded && !fontError) || !initialized) {
    return <AppLoadingScreen />;
  }

  const CustomLightTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: "#F6F7F9",
      card: "#FFFFFF",
      border: "#E2E8F0",
      primary: "#0F766E",
      text: "#111827",
    },
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={CustomLightTheme}>
        <NotificationProvider>
          <NotificationToast />
          <LayoutContent />
          <StatusBar style="dark" />
        </NotificationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

