import React, { useEffect, useState, useRef } from 'react';
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
import * as Notifications from 'expo-notifications';
import { MapPin, Settings, AlertTriangle, RefreshCw, BatteryCharging, Zap, ShieldCheck, ShieldAlert, CheckCircle2 } from 'lucide-react-native';
import { requestIgnoreBatteryOptimizations, openAutoStartSettings } from '../services/batteryOptimizer';
import { useAttendance } from '../context/AttendanceContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

import { violationService } from '../services/violationService';
import { getPermissionsSetupSetting } from '../services/db';

export default function LocationGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const attendanceContext = useAttendance();
  const todayRecord = attendanceContext?.todayRecord;
  const isOnDuty = !!(todayRecord && todayRecord.check_in && !todayRecord.check_out);

  const [isLocationDisabled, setIsLocationDisabled] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [yesCountdown, setYesCountdown] = useState<number>(30);
  const isPromptingRef = useRef<boolean>(false);
  const lastNotifTimeRef = useRef<number>(0);

  // Request notification permissions on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
      } catch (err) {
        console.warn('Notification permission error:', err);
      }
    })();
  }, []);

  const fireDutyGpsOffAlert = async () => {
    // Limit to once every 12 seconds
    if (Date.now() - lastNotifTimeRef.current < 12000) return;
    lastNotifTimeRef.current = Date.now();

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚠️ WARNING: Duty Location (GPS) Turned OFF!',
          body: 'Location is mandatory for your active shift. Tap here to turn on GPS immediately.',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      });
    } catch (err) {
      console.warn('Error scheduling GPS alert notification:', err);
    }
  };

  // Countdown timer for psychological YES button lock
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLocationDisabled && isOnDuty) {
      setYesCountdown(30);
      timer = setInterval(() => {
        setYesCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isLocationDisabled, isOnDuty]);

  const triggerNativeGpsPrompt = async () => {
    if (Platform.OS === 'android' && !isPromptingRef.current) {
      isPromptingRef.current = true;
      try {
        await Location.enableNetworkProviderAsync();
      } catch (err) {
        console.warn('Native GPS prompt dismissed or warning:', err);
      } finally {
        isPromptingRef.current = false;
        checkLocationStatus();
      }
    } else {
      checkLocationStatus();
    }
  };

  const checkLocationStatus = async () => {
    try {
      setChecking(true);

      // Bypass location guard during onboarding if permissions setup is not yet completed
      const setupCompleted = await getPermissionsSetupSetting();
      if (!setupCompleted) {
        setIsLocationDisabled(false);
        setErrorMessage('');
        setChecking(false);
        return;
      }

      const empOid = user?.id || (user as any)?.oid || user?.employee_id || (todayRecord as any)?.employee_id || 10208;
      const punchInId = (todayRecord as any)?.id || (todayRecord as any)?.oid || (todayRecord as any)?.punch_in_id || null;

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
        setErrorMessage(
          isOnDuty
            ? t('duty_gps_off_error')
            : t('gps_off_error')
        );
        if (isOnDuty && empOid) {
          violationService.handleLocationStateChange(false, true, Number(empOid), punchInId);
          fireDutyGpsOffAlert();
        }
        setChecking(false);
        return;
      }

      // 2. Check foreground permission status
      const fgPerm = await Location.getForegroundPermissionsAsync();
      if (fgPerm.status !== 'granted') {
        const reqFg = await Location.requestForegroundPermissionsAsync();
        if (reqFg.status !== 'granted') {
          setIsLocationDisabled(true);
          setErrorMessage(t('fg_perm_required'));
          if (isOnDuty && empOid) {
            violationService.handleLocationStateChange(false, true, Number(empOid), punchInId);
            fireDutyGpsOffAlert();
          }
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
          setErrorMessage(t('bg_perm_required'));
          if (isOnDuty && empOid) {
            violationService.handleLocationStateChange(false, true, Number(empOid), punchInId);
            fireDutyGpsOffAlert();
          }
          setChecking(false);
          return;
        }
      }

      // Location Services are ON and 'Allow all the time' Permission is Granted!
      if (isOnDuty && empOid) {
        violationService.handleLocationStateChange(true, true, Number(empOid), punchInId);
      }
      setIsLocationDisabled(false);
      setErrorMessage('');

      // Auto prompt battery optimization on Android if not already bypassed
      if (Platform.OS === 'android') {
        try {
          const Battery = require('expo-battery');
          const isOptimizationEnabled = await Battery.isBatteryOptimizationEnabledAsync();
          if (isOptimizationEnabled) {
            await requestIgnoreBatteryOptimizations();
          }
        } catch (batErr) {
          console.warn('Error checking battery optimization inside guard:', batErr);
        }
      }
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

    // High-frequency 2-second check loop when on duty and location is disabled
    const interval = setInterval(() => {
      checkLocationStatus();
      // Continuous Auto-Re-Prompt Loop & System Alert Notification if location is disabled during active duty
      if (isLocationDisabled && isOnDuty) {
        fireDutyGpsOffAlert();
        if (Platform.OS === 'android') {
          triggerNativeGpsPrompt();
        }
      }
    }, 2500);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [isLocationDisabled, isOnDuty]);

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
        onRequestClose={() => { }} // Prevent dismissing via hardware back button on Android
      >
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={[styles.iconContainer, isOnDuty && { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
              {isOnDuty ? <ShieldAlert size={48} color="#EF4444" /> : <AlertTriangle size={44} color="#FF5252" />}
            </View>

            <Text style={styles.title}>
              {isOnDuty ? t('duty_compliance_warning') : t('location_setup_required')}
            </Text>

            <Text style={styles.message}>
              {errorMessage || t('gps_off_error')}
            </Text>

            {isOnDuty && (
              <View style={styles.complianceBox}>
                <Text style={styles.complianceTitle}>{t('proceed_location_off_title')}</Text>
                <Text style={styles.complianceSub}>{t('proceed_location_off_sub')}</Text>
              </View>
            )}

            {/* Primary Button: Keep Location ON (Highlights Green/Blue and triggers 1-tap GPS prompt) */}
            <TouchableOpacity
              style={[styles.primaryButton, isOnDuty && styles.dutyKeepOnButton]}
              activeOpacity={0.8}
              onPress={triggerNativeGpsPrompt}
            >
              <CheckCircle2 size={22} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>
                {isOnDuty ? t('keep_location_on_rec') : t('enable_1tap_gps')}
              </Text>
            </TouchableOpacity>

            {/* Psychological Hidden / Locked YES Button */}
            {isOnDuty ? (
              <View style={styles.hiddenYesContainer}>
                <TouchableOpacity
                  style={[styles.hiddenYesButton, yesCountdown > 0 && styles.disabledYesButton]}
                  disabled={yesCountdown > 0}
                  activeOpacity={0.9}
                  onPress={handleOpenSettings}
                >
                  <Text style={styles.hiddenYesText}>
                    {yesCountdown > 0
                      ? t('locked_yes_text', { count: yesCountdown })
                      : t('proceed_settings_yes')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.permissionButton}
                activeOpacity={0.8}
                onPress={handleOpenSettings}
              >
                <Settings size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.primaryButtonText}>{t('enable_allow_always')}</Text>
              </TouchableOpacity>
            )}

            {Platform.OS === 'android' && !isOnDuty && (
              <>
                <TouchableOpacity
                  style={styles.batteryButton}
                  activeOpacity={0.8}
                  onPress={requestIgnoreBatteryOptimizations}
                >
                  <BatteryCharging size={18} color="#FBBF24" style={{ marginRight: 8 }} />
                  <Text style={styles.batteryButtonText}>{t('bypass_battery_saver')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.autoStartButton}
                  activeOpacity={0.8}
                  onPress={openAutoStartSettings}
                >
                  <Zap size={18} color="#34D399" style={{ marginRight: 8 }} />
                  <Text style={styles.autoStartButtonText}>{t('oem_autostart_settings')}</Text>
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
                  <Text style={styles.secondaryButtonText}>{t('recheck_location')}</Text>
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
  complianceBox: {
    width: '100%',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginBottom: 20,
    alignItems: 'center',
  },
  complianceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FCA5A5',
    textAlign: 'center',
    marginBottom: 4,
  },
  complianceSub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
  },
  dutyKeepOnButton: {
    backgroundColor: '#059669',
    height: 56,
  },
  permissionButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  hiddenYesContainer: {
    width: '100%',
    marginBottom: 12,
  },
  hiddenYesButton: {
    width: '100%',
    height: 44,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  disabledYesButton: {
    backgroundColor: 'rgba(51, 65, 85, 0.4)',
    borderColor: 'rgba(51, 65, 85, 0.6)',
    opacity: 0.6,
  },
  hiddenYesText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
    textAlign: 'center',
  },
});
