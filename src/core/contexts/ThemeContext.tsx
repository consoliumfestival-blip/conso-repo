import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type ThemeOption = 'dark' | 'light' | 'gruvbox' | 'nord' | 'dracula' | 'purple-dark';

interface ThemeContextType {
  theme: ThemeOption;
  setThemeOption: (theme: ThemeOption) => void;
  isDark: boolean;
}

export const THEME_STORAGE_KEY = 'ssf_admin_theme';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeOption>('dark');
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      if (Platform.OS === 'web') {
        const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeOption;
        if (saved && ['dark', 'light', 'gruvbox', 'nord', 'dracula', 'purple-dark'].includes(saved)) {
          setTheme(saved);
        }
      }
    } catch (e) {
      console.warn('Failed to read theme from storage', e);
    }
    setIsHydrated(true);
  }, []);

  const isDark = theme !== 'light'; 

  useEffect(() => {
    if (!isHydrated) return;

    const saveTheme = async () => {
      try {
        if (Platform.OS === 'web') {
          localStorage.setItem(THEME_STORAGE_KEY, theme);
          
          document.documentElement.classList.remove('theme-light', 'theme-gruvbox', 'theme-nord', 'theme-dracula', 'theme-purple-dark', 'dark');
          
          if (theme !== 'dark') {
            document.documentElement.classList.add(`theme-${theme}`);
          }
        }
      } catch (e) {
        console.warn('Failed to save theme', e);
      }
    };

    saveTheme();
  }, [theme, isHydrated]);

  if (!isHydrated) {
    return null; 
  }

  return (
    <ThemeContext.Provider value={{ theme, setThemeOption: setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};