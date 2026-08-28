import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { gpsTracker } from '../../services/gpsService';

export default function TabLayout() {
  useEffect(() => {
    // Check and resume active GPS tracking on app launch / reboot recovery
    gpsTracker.checkAndResumeTracking().catch(err => {
      console.warn('Error resuming GPS tracking on app boot:', err);
    });
  }, []);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' }, // Bottom navigation bar removed as requested
        sceneStyle: { backgroundColor: '#0A1128' },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="sites"
        options={{
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
