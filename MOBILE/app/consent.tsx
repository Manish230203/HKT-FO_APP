import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { ShieldCheck, Lock, Cookie, CheckCircle2, ArrowRight, MapPin, Zap, Smartphone, AlertTriangle, Settings as SettingsIcon } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { saveConsentSetting } from '../services/db';
import { requestIgnoreBatteryOptimizations, openAutoStartSettings } from '../services/batteryOptimizer';
import { Button } from '../components/ui/Button';

export default function ConsentScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);

  useEffect(() => {
    checkLocationPermissions();
  }, []);

  const checkLocationPermissions = async () => {
    try {
      const bg = await Location.getBackgroundPermissionsAsync();
      setLocationGranted(bg.status === 'granted');
    } catch (e) {
      console.warn('Error checking background location permission:', e);
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
    }
  };

  const handleDisableBatteryRestrictions = async () => {
    await requestIgnoreBatteryOptimizations();
  };

  const handleOpenAutoStart = async () => {
    await openAutoStartSettings();
  };

  const handleAcceptAndContinue = async () => {
    try {
      setSubmitting(true);
      await saveConsentSetting(true);
      if (user) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace('/login');
      }
    } catch (error) {
      console.error('Error saving consent setting:', error);
      if (user) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace('/login');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header Badge */}
        <View style={styles.headerContainer}>
          <View style={styles.iconCircle}>
            <ShieldCheck color="#3B82F6" size={36} />
          </View>
          <Text style={styles.headerTitle}>{t('privacy_policy_title')}</Text>
          <Text style={styles.headerSubtitle}>{t('privacy_policy_subtitle')}</Text>
        </View>

        {/* 🌟 Required Permissions & Battery Setup Onboarding Card */}
        <View style={styles.setupCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.blueIconCircle}>
              <SettingsIcon color="#60A5FA" size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.setupTitle}>{t('perm_setup_title')}</Text>
              <Text style={styles.setupSubtitle}>{t('perm_setup_subtitle')}</Text>
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
              <TouchableOpacity style={styles.actionBtnPrimary} onPress={handleConfigureLocation}>
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
              </View>
              <Text style={styles.stepDesc}>{t('perm_battery_desc')}</Text>
              <TouchableOpacity style={styles.actionBtnAmber} onPress={handleDisableBatteryRestrictions}>
                <Text style={styles.actionBtnTextAmber}>{t('perm_battery_btn')}</Text>
              </TouchableOpacity>
            </View>

            {/* Step 3: OEM Auto-Start Settings */}
            <View style={styles.stepBox}>
              <View style={styles.stepTopRow}>
                <View style={styles.stepHeaderLeft}>
                  <Smartphone color="#10B981" size={18} />
                  <Text style={styles.stepTitle}>{t('perm_autostart_title')}</Text>
                </View>
              </View>
              <Text style={styles.stepDesc}>{t('perm_autostart_desc')}</Text>
              <TouchableOpacity style={styles.actionBtnGreen} onPress={handleOpenAutoStart}>
                <Text style={styles.actionBtnTextGreen}>{t('perm_autostart_btn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 1. Consent Notice Banner */}
        <View style={styles.consentNoticeCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.noticeIconCircle}>
              <CheckCircle2 color="#3B82F6" size={20} />
            </View>
            <Text style={styles.consentNoticeTitle}>{t('consent_notice_title')}</Text>
          </View>
          <Text style={styles.consentNoticeText}>{t('consent_notice_text')}</Text>
        </View>

        {/* 2. Privacy Policy Card */}
        <View style={styles.policyCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.blueIconCircle}>
              <Lock color="#3B82F6" size={18} />
            </View>
            <Text style={styles.cardTitle}>{t('privacy_policy_title')}</Text>
          </View>
          <Text style={styles.policySubtitle}>{t('privacy_policy_subtitle')}</Text>

          <View style={styles.pointsList}>
            <View style={styles.pointItem}>
              <Text style={styles.pointText}>{t('privacy_p1')}</Text>
            </View>
            <View style={styles.pointItem}>
              <Text style={styles.pointText}>{t('privacy_p2')}</Text>
            </View>
            <View style={styles.pointItem}>
              <Text style={styles.pointText}>{t('privacy_p3')}</Text>
            </View>
            <View style={styles.pointItem}>
              <Text style={styles.pointText}>{t('privacy_p4')}</Text>
            </View>
            <View style={styles.pointItem}>
              <Text style={styles.pointText}>{t('privacy_p5')}</Text>
            </View>
          </View>
        </View>

        {/* 3. Cookie Policy Card */}
        <View style={styles.policyCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.amberIconCircle}>
              <Cookie color="#F59E0B" size={18} />
            </View>
            <Text style={styles.cardTitle}>{t('cookie_policy_title')}</Text>
          </View>
          <Text style={styles.policySubtitle}>{t('cookie_policy_subtitle')}</Text>

          <View style={styles.pointsList}>
            <View style={styles.pointItem}>
              <Text style={styles.pointText}>{t('cookie_p1')}</Text>
            </View>
            <View style={styles.pointItem}>
              <Text style={styles.pointText}>{t('cookie_p2')}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Fixed Footer Action Button */}
      <View style={styles.footerContainer}>
        <Button
          title={t('accept_and_continue')}
          onPress={handleAcceptAndContinue}
          loading={submitting}
          style={styles.acceptButton}
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
    marginTop: 4,
  },

  // Setup Card Styles
  setupCard: {
    backgroundColor: '#111A33',
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.35)',
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
  actionBtnGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionBtnTextGreen: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '700',
  },

  consentNoticeCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  noticeIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  consentNoticeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#60A5FA',
  },
  consentNoticeText: {
    fontSize: 13,
    color: '#E2E8F0',
    lineHeight: 20,
    fontWeight: '500',
  },
  policyCard: {
    backgroundColor: '#131C33',
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  blueIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  amberIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  policySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 14,
    fontWeight: '600',
  },
  pointsList: {
    gap: 12,
  },
  pointItem: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  pointText: {
    fontSize: 13,
    color: '#CBD5E1',
    lineHeight: 19,
    fontWeight: '400',
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
  acceptButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    height: 52,
  },
});
