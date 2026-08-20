import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '../context/AuthContext';
import { AttendanceProvider } from '../context/AttendanceContext';
import { LanguageProvider } from '../context/LanguageContext';
import { THEME } from '../constants/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AttendanceProvider>
          <LanguageProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: THEME.background },
                headerTintColor: THEME.text,
                headerTitleStyle: { fontWeight: 'bold' },
                contentStyle: { backgroundColor: THEME.background },
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
              <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="settings"
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
          </LanguageProvider>
        </AttendanceProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
