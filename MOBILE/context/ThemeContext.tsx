import React, { createContext, useContext, useState, useEffect } from 'react';
import { Colors, getTheme } from '../constants/theme';
import { getThemeSetting, saveThemeSetting } from '../services/db';

export type ThemeMode = 'light' | 'dark';

export type ThemeColors = typeof Colors.dark;
export type ThemeObject = ReturnType<typeof getTheme>;

interface ThemeContextProps {
  themeMode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  theme: ThemeObject;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await getThemeSetting();
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setThemeModeState(savedTheme);
      }
    } catch (err) {
      console.log('Failed to load theme setting:', err);
    }
  };

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await saveThemeSetting(mode);
  };

  const toggleTheme = async () => {
    const nextMode = themeMode === 'dark' ? 'light' : 'dark';
    await setThemeMode(nextMode);
  };

  const colors = Colors[themeMode];
  const theme = getTheme(themeMode);
  const isDark = themeMode === 'dark';

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        isDark,
        colors,
        theme,
        setThemeMode,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
