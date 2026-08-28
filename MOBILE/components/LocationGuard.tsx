import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Linking,
  AppState,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import { MapPin, Settings, AlertTriangle, RefreshCw, BatteryCharging, Zap } from 'lucide-react-native';
import { requestIgnoreBatteryOptimizations, openAutoStartSettings } from '../services/batteryOptimizer';

export default function LocationGuard({ children }: { children: React.ReactNode }) {
  const [isLocationDisabled, setIsLocationDisabled] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const checkLocationStatus = async () => {
    try {
      setChecking(true);
      
      // 1. Check if location services (GPS) are turned ON on device
      let servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled && Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
          servicesEnabled = await Location.hasServicesEnabledAsync();
        } catch (netErr) {
          console.warn('Location.enableNetworkProviderAsync warning:', netErr);
        }
      }

      if (!servicesEnabled) {
        setIsLocationDisabled(true);
        setErrorMessage('High Accuracy Location / GPS is turned OFF on your mobile device. Please enable High Accuracy location mode to use PatrolSync FO.');
        setChecking(false);
        return;
      }

      // 2. Check foreground permission status
      const fgPerm = await Location.getForegroundPermissionsAsync();
      if (fgPerm.status !== 'granted') {
        const reqFg = await Location.requestForegroundPermissionsAsync();
        if (reqFg.status !== 'granted') {
          setIsLocationDisabled(true);
          setErrorMessage('Location permission is required for Field Officer operations. Please allow location access.');
          setChecking(false);
          return;
        }
      }

      // 3. Check background permission status ('Allow all the time')
      const bgPerm = await Location.getBackgroundPermissionsAsync();
      if (bgPerm.status !== 'granted') {
        const reqBg = await Location.requestBackgroundPermissionsAsync();
        if (reqBg.status !== 'granted') {
          setIsLocationDisabled(true);
          setErrorMessage('Background Location Permission ("Allow all the time" / "Always Allow") is required so PatrolSync FO can track duty location while your screen is locked.');
          setChecking(false);
          return;
        }
      }

      // Location Services are ON and 'Allow all the time' Permission is Granted!
      setIsLocationDisabled(false);
      setErrorMessage('');
    } catch (err) {
      console.warn('Error checking location status:', err);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkLocationStatus();

    // Re-check whenever app comes to foreground (e.g. returning from phone settings)
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkLocationStatus();
      }
    });

    // Interval check every 5 seconds
    const interval = setInterval(() => {
      checkLocationStatus();
    }, 5000);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  const handleOpenSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        try {
          const IntentLauncher = require('expo-intent-launcher');
          await IntentLauncher.startActivityAsync(IntentLauncher.ACTION_LOCATION_SOURCE_SETTINGS);
        } catch {
          await Linking.openSettings();
        }
      } else {
        await Linking.openSettings();
      }
    } catch (e) {
      await Linking.openSettings();
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {children}

      <Modal
        visible={isLocationDisabled}
        transparent={false}
        animationType="fade"
        hardwareAccelerated
        onRequestClose={() => {}} // Prevent dismissing via hardware back button on Android
      >
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <AlertTriangle size={44} color="#FF5252" />
            </View>

            <Text style={styles.title}>Location & Duty Setup Required</Text>
            
            <Text style={styles.message}>
              {errorMessage || 'Field Officers must have Location (GPS) set to "Allow all the time" to perform duty actions in PatrolSync FO.'}
            </Text>

            <View style={styles.infoBox}>
              <MapPin size={20} color="#60A5FA" style={{ marginRight: 8 }} />
              <Text style={styles.infoText}>
                Your location ensures verified attendance and real-time site visits.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.8}
              onPress={handleOpenSettings}
            >
              <Settings size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>Enable "Allow All The Time" Permission</Text>
            </TouchableOpacity>

            {Platform.OS === 'android' && (
              <>
                <TouchableOpacity
                  style={styles.batteryButton}
                  activeOpacity={0.8}
                  onPress={requestIgnoreBatteryOptimizations}
                >
                  <BatteryCharging size={18} color="#FBBF24" style={{ marginRight: 8 }} />
                  <Text style={styles.batteryButtonText}>1-Tap Bypass Battery Saver</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.autoStartButton}
                  activeOpacity={0.8}
                  onPress={openAutoStartSettings}
                >
                  <Zap size={18} color="#34D399" style={{ marginRight: 8 }} />
                  <Text style={styles.autoStartButtonText}>OEM Auto-Start Settings (Xiaomi/Vivo/Oppo/Samsung)</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.secondaryButton}
              activeOpacity={0.7}
              onPress={checkLocationStatus}
              disabled={checking}
            >
              {checking ? (
                <ActivityIndicator size="small" color="#94A3B8" />
              ) : (
                <>
                  <RefreshCw size={18} color="#94A3B8" style={{ marginRight: 6 }} />
                  <Text style={styles.secondaryButtonText}>I Turned It ON, Check Again</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1128',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
    marginBottom: 24,
    width: '100%',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#93C5FD',
    lineHeight: 18,
  },
  primaryButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  batteryButton: {
    width: '100%',
    height: 48,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    marginBottom: 10,
  },
  batteryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FBBF24',
  },
  autoStartButton: {
    width: '100%',
    height: 48,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    marginBottom: 12,
  },
  autoStartButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#34D399',
  },
  secondaryButton: {
    width: '100%',
    height: 48,
    backgroundColor: 'transparent',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94A3B8',
  },
});
