import React, { createContext, useContext } from 'react';
import { View, useColorScheme } from 'react-native';
import { useSegments } from 'expo-router';
import { vars } from 'nativewind';
import { useCoreAppearancePreference } from '@/core/store/coreAppearanceStore';
import { resolveCoreColors } from '@/constants/coreTheme';
import { buttonVariables, resolveButtonColors } from '@/constants/buttonTheme';

type ButtonColors = ReturnType<typeof resolveButtonColors>;
const ButtonThemeContext = createContext<ButtonColors | null>(null);

/** Also used inside native Modal roots, where CSS inheritance is lost. */
export function ButtonThemeSurface({ children, palette }: { children: React.ReactNode; palette?: ButtonColors }) {
  const segments = useSegments();
  const appearance = useCoreAppearancePreference();
  const dark = useColorScheme() === 'dark';
  const inherited = useContext(ButtonThemeContext);
  const group = String(segments[0]);
  if (!['(admin)', '(super)', '(auth)', 'team', 'judge', 'announcer', 'stage-management', 'settings', 'notifications'].includes(group)) return <>{children}</>;
  const colors = resolveCoreColors(appearance, dark);
  const buttons = palette ?? inherited ?? resolveButtonColors(colors, colors.primary === '#0F766E' && colors.onPrimary === '#FFFFFF');
  return <ButtonThemeContext.Provider value={buttons}><View style={[{ flex: 1 }, vars(buttonVariables(buttons))]}>{children}</View></ButtonThemeContext.Provider>;
}
