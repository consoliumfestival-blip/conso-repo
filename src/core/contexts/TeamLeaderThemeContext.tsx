import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createTeamUi, TeamThemeMode } from '@/constants/teamLeaderTheme';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { ButtonThemeSurface } from '@/components/ui/ButtonThemeSurface';
import { resolveButtonColors } from '@/constants/buttonTheme';

const STORAGE_KEY = 'team-leader-portal-theme';

interface TeamThemeState {
  mode: TeamThemeMode;
  ui: ReturnType<typeof createTeamUi>;
  toggleMode: () => void;
}

const TeamThemeContext = createContext<TeamThemeState>({
  mode: 'light',
  ui: createTeamUi('light'),
  toggleMode: () => undefined,
});

export function TeamLeaderThemeProvider({ children }: { children: React.ReactNode }) {
  const { context } = useTeamLeaderContext();
  const [mode, setMode] = useState<TeamThemeMode>('light');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (active && (saved === 'light' || saved === 'dark')) setMode(saved);
    }).catch(() => undefined).finally(() => {
      if (active) setHydrated(true);
    });
    return () => { active = false; };
  }, []);

  const toggleMode = useCallback(() => {
    setMode((current) => current === 'light' ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => undefined);
  }, [hydrated, mode]);

  const teamName = context?.team_name ?? null;
  const value = useMemo(() => ({ mode, ui: createTeamUi(mode, teamName), toggleMode }), [mode, teamName, toggleMode]);
  return <TeamThemeContext.Provider value={value}><ButtonThemeSurface palette={resolveButtonColors({ ...value.ui.colors, primary: value.ui.colors.primaryStrong, primaryText: value.ui.colors.primary })}>{children}</ButtonThemeSurface></TeamThemeContext.Provider>;
}

export function useTeamTheme() {
  return useContext(TeamThemeContext);
}

export function useTeamUi() {
  return useTeamTheme().ui;
}
