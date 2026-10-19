import { Platform } from 'react-native';

const tintColorLight = '#2979FF';
const tintColorDark = '#3B82F6';

export const Colors = {
  light: {
    text: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#64748B',
    background: '#F8FAFC',
    tint: tintColorLight,
    secondary: '#10B981',
    accent: '#F59E0B',
    icon: '#475569',
    tabIconDefault: '#94A3B8',
    tabIconSelected: tintColorLight,
    card: '#FFFFFF',
    border: '#E2E8F0',
    surface: '#FFFFFF',
    surfaceSecondary: '#F1F5F9',
    inputBg: '#F8FAFC',
    inputBorder: '#CBD5E1',
    placeholder: '#94A3B8',
    modalBg: '#FFFFFF',
    modalOverlay: 'rgba(0, 0, 0, 0.5)',
    gridIconBg: '#EFF6FF',
    gridIconBorder: '#DBEAFE',
    headerBg: '#FFFFFF',
    textVariant: '#64748B',
    primary: '#2563EB',
    danger: '#EF4444',
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    background: '#0A1128', // Deep Navy Blue
    tint: tintColorDark,
    secondary: '#10B981',
    accent: '#F59E0B',
    icon: '#94A3B8',
    tabIconDefault: '#64748B',
    tabIconSelected: '#FFFFFF',
    card: '#131C33', // Dark Bluish Card
    border: 'rgba(255,255,255,0.08)',
    surface: '#131C33',
    surfaceSecondary: '#0A1128',
    inputBg: '#0A1128',
    inputBorder: 'rgba(255,255,255,0.12)',
    placeholder: '#64748B',
    modalBg: '#131C33',
    modalOverlay: 'rgba(0, 0, 0, 0.85)',
    gridIconBg: '#000000',
    gridIconBorder: 'rgba(255,255,255,0.1)',
    headerBg: '#0A1128',
    textVariant: '#94A3B8',
    primary: '#3B82F6',
    danger: '#EF4444',
  },
};

export const THEME = {
  ...Colors.dark, // Default to dark theme like APL mobile
  gradients: {
    primary: ['#1A237E', '#3949AB'],
    secondary: ['#10B981', '#059669'],
    accent: ['#F59E0B', '#D97706'],
    night: ['#1E1B4B', '#312E81'],
    day: ['#0284C7', '#0369A1'],
    general: ['#059669', '#047857'],
    glass: ['#131C33', '#1E293B'],
  },
  shadows: {
    soft: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    medium: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 6,
    },
  },
  typography: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
  },
};

export const getTheme = (mode: 'dark' | 'light') => {
  const palette = Colors[mode] || Colors.dark;
  return {
    ...palette,
    gradients: THEME.gradients,
    shadows: THEME.shadows,
    typography: THEME.typography,
  };
};

export const Fonts = Platform.select({
  ios: {
    sans: 'System',
    serif: 'Georgia',
    mono: 'Courier New',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    mono: 'monospace',
  },
});
