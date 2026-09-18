import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ShieldCheck, Lock, Cookie, CheckCircle2, ArrowRight } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { saveConsentSetting, getPermissionsSetupSetting, getLanguageSetting } from '../services/db';
import { Button } from '../components/ui/Button';

export default function ConsentScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const setupCompleted = await getPermissionsSetupSetting();
      if (!setupCompleted) {
        router.replace('/permissions-setup');
        return;
      }
      const savedLang = await getLanguageSetting();
      if (!savedLang) {
        router.replace('/lang/lang-selection');
        return;
      }
    })();
  }, []);

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
