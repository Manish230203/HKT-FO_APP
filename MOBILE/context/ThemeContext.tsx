import React, { createContext, useContext, useState, useEffect } from 'react';
import { Colors, THEME, getTheme } from '../constants/theme';
import { getThemeSetting, saveThemeSetting } from '../services/db';

type ThemeMode = 'dark' | 'light';

interface ThemeContextProps {
  theme: ThemeMode;
  isDark: boolean;
  colors: typeof Colors.dark;
  themeObj: typeof THEME;
  toggleTheme: () => Promise<void>;
  setTheme: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await getThemeSetting();
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setThemeState(savedTheme);
      }
    } catch (err) {
      console.warn('Failed to load theme setting:', err);
    }
  };

  const setTheme = async (mode: ThemeMode) => {
    setThemeState(mode);
    await saveThemeSetting(mode);
  };

  const toggleTheme = async () => {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    await setTheme(nextTheme);
  };

  const isDark = theme === 'dark';
  const colors = Colors[theme] || Colors.dark;
  const themeObj = getTheme(theme);

  return (
    <ThemeContext.Provider value={{ theme, isDark, colors, themeObj, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    // Graceful fallback for components used outside ThemeProvider
    return {
      theme: 'dark' as ThemeMode,
      isDark: true,
      colors: Colors.dark,
      themeObj: THEME,
      toggleTheme: async () => {},
      setTheme: async () => {},
    };
  }
  return context;
}

export default ThemeContext;
