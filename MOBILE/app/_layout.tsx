import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '../context/AuthContext';
import { AttendanceProvider } from '../context/AttendanceContext';
import { LanguageProvider } from '../context/LanguageContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import LocationGuard from '../components/LocationGuard';

function RootLayoutContent() {
  const { colors, isDark } = useTheme();

  return (
    <LocationGuard>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          gestureDirection: 'horizontal',
          presentation: 'card',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="lang/lang-selection"
          options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }}
        />
        <Stack.Screen name="consent" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }}
        />
        <Stack.Screen
          name="mark-attendance"
          options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }}
        />
        <Stack.Screen
          name="visits/index"
          options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }}
        />
        <Stack.Screen
          name="visits/select-type"
          options={{ title: 'Select Visit Type', gestureEnabled: true, fullScreenGestureEnabled: true }}
        />
        <Stack.Screen
          name="visits/day-visit/day-visit-create"
          options={{ title: 'Day Visit Report', gestureEnabled: true, fullScreenGestureEnabled: true }}
        />
        <Stack.Screen
          name="visits/night-visit/night-visit-create"
          options={{ title: 'Night Visit Report', gestureEnabled: true, fullScreenGestureEnabled: true }}
        />
        <Stack.Screen
          name="visits/general-visit/general-visit-create"
          options={{ title: 'General Visit Report', gestureEnabled: true, fullScreenGestureEnabled: true }}
        />
      </Stack>
    </LocationGuard>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AttendanceProvider>
          <LanguageProvider>
            <ThemeProvider>
              <RootLayoutContent />
            </ThemeProvider>
          </LanguageProvider>
        </AttendanceProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

