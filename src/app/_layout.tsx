import { teamUi } from '@/constants/teamLeaderTheme';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Slot, Stack, usePathname, useSegments } from "expo-router";
import { readCoreAppearance, resolveCoreColors } from '@/constants/coreTheme';
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import "../global.css";
import { ActivityIndicator, Platform, View } from "react-native";

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
import { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";
import { useProtectedRoute } from "../core/hooks/useProtectedRoute";
import { useAuthStore } from "../core/store/authStore";
import { NotificationProvider } from "../core/contexts/NotificationContext";
import { NotificationToast } from "../components/ui/NotificationToast";

// Removed top-level preventAutoHideAsync, moving it inside component

const LOADING_BG = "#011635";

function AppLoadingScreen() {
  const teamRoute = usePathname().startsWith('/team');
  const coreRoute = ['(admin)', '(super)', '(auth)'].includes(String(useSegments()[0]));
  const systemDark = useColorScheme() === 'dark';
  const coreColors = resolveCoreColors(readCoreAppearance(), systemDark);
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
        : "/manifest.json";
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="manifest"]'));
    if (links.length === 0) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = manifestPath;
      document.head.appendChild(link);
      return;
    }
    links.forEach((link) => { link.href = manifestPath; });
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
    checkSession();
  }, [checkSession]);

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

