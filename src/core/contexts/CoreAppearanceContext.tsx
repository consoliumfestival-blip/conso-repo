import { DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { vars } from 'nativewind';
import { useSegments } from 'expo-router';
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Platform, View, useColorScheme, ViewProps } from 'react-native';
import { CORE_APPEARANCE_KEY, CoreAppearance, coreVariables, parseCoreAppearance, resolveCoreColors } from '@/constants/coreTheme';
import { setCoreAppearance, useCoreAppearancePreference } from '@/core/store/coreAppearanceStore';
import { useAuthStore } from '@/core/store/authStore';

type AppearanceState = {
  appearance: CoreAppearance;
  colors: ReturnType<typeof resolveCoreColors>;
  isDark: boolean;
  setAppearance: (next: CoreAppearance) => void;
  saveError: string | null;
};
const AppearanceContext = createContext<AppearanceState | null>(null);
export const useCoreAppearance = () => useContext(AppearanceContext);

/** Root notification layers sit outside the Admin tree. Scope them by route. */
export function useCoreOverlayScope() {
  const appearance = useCoreAppearancePreference();
  const systemDark = useColorScheme() === 'dark';
  const segments = useSegments();
  const role = useAuthStore(state => state.role);
  const superadmin = useAuthStore(state => state.is_superadmin);
  const group = String(segments[0]);
  const coreRoute = Platform.OS === 'web' && (['(admin)', '(super)', '(auth)'].includes(group) || (['settings', 'notifications'].includes(group) && (role === 'admin' || superadmin)));
  return useMemo(() => coreRoute ? {
    style: vars(coreVariables(resolveCoreColors(appearance, systemDark))),
    dataSet: { coreThemeScope: 'overlay' },
  } : { style: {} }, [coreRoute, appearance, systemDark]);
}

/** CSS variables are scoped to Core/Stage, including their modal portal roots. */
export function CoreThemeSurface({ children, style, ...props }: ViewProps) {
  const theme = useCoreAppearance();
  const variables = useMemo(() => theme ? vars({ ...coreVariables(theme.colors), '--core-blur': 'blur(4px)' }) : {}, [theme]);
  return <View {...props} {...(theme ? { dataSet: { coreThemeScope: theme.isDark ? 'dark' : 'light' } } as any : {})} style={[variables, style]}>{children}</View>;
}

export function CoreAppearanceProvider({ children }: { children: React.ReactNode }) {
  const appearance = useCoreAppearancePreference();
  const setAppearance = setCoreAppearance;
  const [saveError, setSaveError] = useState<string | null>(null);
  const systemDark = useColorScheme() === 'dark';
  const isDark = appearance.mode === 'dark' || (appearance.mode === 'system' && systemDark);
  const colors = useMemo(() => resolveCoreColors(appearance, systemDark), [appearance, systemDark]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const changed = (event: StorageEvent) => { if (event.key === CORE_APPEARANCE_KEY) setAppearance(parseCoreAppearance(event.newValue)); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [setAppearance]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setSaveError(null);
    try { localStorage.setItem(CORE_APPEARANCE_KEY, JSON.stringify(appearance)); }
    catch { setSaveError('Appearance changed for this session. Browser storage is unavailable.'); }
  }, [appearance]);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    const roots = [document.documentElement, document.body];
    const previous = roots.map((root) => ({ background: root.style.backgroundColor, scheme: root.style.colorScheme }));
    roots.forEach((root) => { root.style.backgroundColor = colors.background; root.style.colorScheme = isDark ? 'dark' : 'light'; });
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const oldMeta = meta?.content;
    if (meta) meta.content = colors.background;
    return () => {
      roots.forEach((root, index) => { root.style.backgroundColor = previous[index].background; root.style.colorScheme = previous[index].scheme; });
      if (meta && oldMeta !== undefined) meta.content = oldMeta;
    };
  }, [colors.background, isDark]);

  const value = useMemo(() => ({ appearance, colors, isDark, setAppearance, saveError }), [appearance, colors, isDark, saveError, setAppearance]);
  const navigation = useMemo(() => ({ ...DefaultTheme, dark: isDark, colors: { ...DefaultTheme.colors, background: colors.background, card: colors.surface, text: colors.text, primary: colors.primary, border: colors.border } }), [colors, isDark]);
  if (Platform.OS !== 'web') return <>{children}</>;
  return <AppearanceContext.Provider value={value}><NavigationThemeProvider value={navigation}><CoreThemeSurface style={{ flex: 1, backgroundColor: colors.background }}>{children}<StatusBar style={isDark ? 'light' : 'dark'} /></CoreThemeSurface></NavigationThemeProvider></AppearanceContext.Provider>;
}

/** Generic account screens also serve non-core users, so retain their fallback. */
export function CoreAccountAppearance({ children }: { children: React.ReactNode }) {
  const existing = useCoreAppearance();
  const role = useAuthStore(state => state.role);
  const superadmin = useAuthStore(state => state.is_superadmin);
  return existing || (role !== 'admin' && !superadmin) ? <>{children}</> : <CoreAppearanceProvider>{children}</CoreAppearanceProvider>;
}
