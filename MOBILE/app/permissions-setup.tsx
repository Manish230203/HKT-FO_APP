import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { ShieldCheck, MapPin, Zap, ArrowRight, Settings as SettingsIcon } from 'lucide-react-native';
import { useLanguage } from '../context/LanguageContext';
import { savePermissionsSetupSetting } from '../services/db';
import { requestIgnoreBatteryOptimizations, isBatteryOptimizationBypassed } from '../services/batteryOptimizer';
import { Button } from '../components/ui/Button';

export default function PermissionsSetupScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [batteryBypassed, setBatteryBypassed] = useState(false);

  useEffect(() => {
    checkAllPermissions();

    // Re-check permissions dynamically when returning from device Settings or system dialogs
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkAllPermissions();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const checkAllPermissions = async () => {
    await checkLocationPermissions();
    await checkBatteryPermissions();
  };

  const checkLocationPermissions = async () => {
    try {
      const bg = await Location.getBackgroundPermissionsAsync();
      setLocationGranted(bg.status === 'granted');
    } catch (e) {
      console.warn('Error checking background location permission:', e);
    }
  };

  const checkBatteryPermissions = async () => {
    try {
      const bypassed = await isBatteryOptimizationBypassed();
      setBatteryBypassed(bypassed);
    } catch (e) {
      console.warn('Error checking battery optimization status:', e);
    }
  };

  const handleConfigureLocation = async () => {
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status === 'granted') {
        const bg = await Location.requestBackgroundPermissionsAsync();
        if (bg.status === 'granted') {
          setLocationGranted(true);
          return;
        }
      }
      await Linking.openSettings();
    } catch (err) {
      console.warn('Location permission request error:', err);
      try {
        await Linking.openSettings();
      } catch {}
    } finally {
      await checkLocationPermissions();
    }
  };

  const handleDisableBatteryRestrictions = async () => {
    try {
      await requestIgnoreBatteryOptimizations();
    } catch (err) {
      console.warn('Error triggering battery optimizations dialog:', err);
    } finally {
      await checkBatteryPermissions();
    }
  };

  const handleContinue = async () => {
    try {
      setSubmitting(true);
      // Ask location permissions if not already granted
      if (!locationGranted) {
        try {
          const fg = await Location.requestForegroundPermissionsAsync();
          if (fg.status === 'granted') {
            await Location.requestBackgroundPermissionsAsync();
          }
        } catch (e) {
          console.warn('Permission request error during continue:', e);
        }
      }
      // Save setup completed status
      await savePermissionsSetupSetting(true);
      // Proceed to Language Selection page
      router.replace('/lang/lang-selection');
    } catch (error) {
      console.error('Error saving permissions setup setting:', error);
      router.replace('/lang/lang-selection');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Header Badge */}
        <View style={styles.headerContainer}>
          <View style={styles.iconCircle}>
            <ShieldCheck color="#3B82F6" size={36} />
          </View>
          <Text style={styles.headerTitle}>{t('perm_setup_title')}</Text>
          <Text style={styles.headerSubtitle}>{t('perm_setup_subtitle')}</Text>
        </View>

        {/* Permissions & Battery Setup Onboarding Card */}
        <View style={styles.setupCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.blueIconCircle}>
              <SettingsIcon color="#60A5FA" size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.setupTitle}>VIGILO-O Setup Guide</Text>
              <Text style={styles.setupSubtitle}>
                Follow the 2 steps below to ensure accurate location tracking & duty compliance.
              </Text>
            </View>
          </View>

          <View style={styles.stepsList}>
            {/* Step 1: Background Location Permission */}
            <View style={styles.stepBox}>
              <View style={styles.stepTopRow}>
                <View style={styles.stepHeaderLeft}>
                  <MapPin color="#3B82F6" size={18} />
                  <Text style={styles.stepTitle}>{t('perm_location_title')}</Text>
                </View>
                <View style={[styles.statusBadge, locationGranted ? styles.statusBadgeGranted : styles.statusBadgeAction]}>
                  <Text style={[styles.statusBadgeText, locationGranted ? styles.statusBadgeTextGranted : styles.statusBadgeTextAction]}>
                    {locationGranted ? t('perm_status_granted') : t('perm_status_action')}
                  </Text>
                </View>
              </View>
              <Text style={styles.stepDesc}>{t('perm_location_desc')}</Text>
              <TouchableOpacity style={styles.actionBtnPrimary} onPress={handleConfigureLocation} activeOpacity={0.8}>
                <Text style={styles.actionBtnTextPrimary}>{t('perm_location_btn')}</Text>
              </TouchableOpacity>
            </View>

            {/* Step 2: Battery Optimization */}
            <View style={styles.stepBox}>
              <View style={styles.stepTopRow}>
                <View style={styles.stepHeaderLeft}>
                  <Zap color="#F59E0B" size={18} />
                  <Text style={styles.stepTitle}>{t('perm_battery_title')}</Text>
                </View>
                <View style={[styles.statusBadge, batteryBypassed ? styles.statusBadgeGranted : styles.statusBadgeAction]}>
                  <Text style={[styles.statusBadgeText, batteryBypassed ? styles.statusBadgeTextGranted : styles.statusBadgeTextAction]}>
                    {batteryBypassed ? t('perm_status_granted') : t('perm_status_action')}
                  </Text>
                </View>
              </View>
              <Text style={styles.stepDesc}>{t('perm_battery_desc')}</Text>
              <TouchableOpacity style={styles.actionBtnAmber} onPress={handleDisableBatteryRestrictions} activeOpacity={0.8}>
                <Text style={styles.actionBtnTextAmber}>{t('perm_battery_btn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Fixed Footer Action Button */}
      <View style={styles.footerContainer}>
        <Button
          title={t('continue_to_lang')}
          onPress={handleContinue}
          loading={submitting}
          style={styles.continueButton}
          icon={!submitting ? <ArrowRight color="#FFFFFF" size={20} /> : undefined}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1128',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 110,
  },
  headerContainer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  setupCard: {
    backgroundColor: '#111A33',
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  blueIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  setupTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#60A5FA',
  },
  setupSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
    lineHeight: 18,
  },
  stepsList: {
    gap: 14,
    marginTop: 14,
  },
  stepBox: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  stepTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  stepHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeGranted: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  statusBadgeAction: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeTextGranted: {
    color: '#34D399',
  },
  statusBadgeTextAction: {
    color: '#FBBF24',
  },
  stepDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 10,
  },
  actionBtnPrimary: {
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionBtnTextPrimary: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnAmber: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.5)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionBtnTextAmber: {
    color: '#FBBF24',
    fontSize: 13,
    fontWeight: '700',
  },
  footerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0A1128',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  continueButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    height: 52,
  },
});
