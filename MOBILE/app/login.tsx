import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, ArrowRight, ArrowLeft, Smartphone } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { THEME } from '../constants/theme';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { SwipeableBackWrapper } from '../components/SwipeableBackWrapper';

export default function LoginScreen() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [mobileNumber, setMobileNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Validate 10-digit Indian Mobile Number (starts with 6, 7, 8, or 9)
  const validateMobile = (num: string): boolean => {
    const cleaned = num.trim();
    const indianMobileRegex = /^[6-9]\d{9}$/;
    return indianMobileRegex.test(cleaned);
  };

  const handleLogin = async () => {
    const cleanedMobile = mobileNumber.trim();
    
    if (!validateMobile(cleanedMobile)) {
      setErrorMessage(t('invalid_mobile'));
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await login(cleanedMobile, 'password123');
      if (res.success) {
        router.replace('/(tabs)/dashboard');
      } else {
        if (res.errorType === 'RESTRICTED_ROLE') {
          setErrorMessage(t('access_restricted_fo'));
        } else if (res.errorType === 'NETWORK_ERROR') {
          setErrorMessage(t('network_error'));
        } else {
          setErrorMessage(t('no_account_found'));
        }
      }
    } catch (err: any) {
      setErrorMessage(t('network_error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SwipeableBackWrapper fallbackRoute="/lang/lang-selection">
      <SafeAreaView style={styles.container}>
        {/* Top Header Navigation Bar with Back Button */}
        <View style={styles.topNav}>
          <TouchableOpacity
            onPress={() => router.replace('/lang/lang-selection')}
            style={styles.backBtn}
            activeOpacity={0.8}
          >
            <ArrowLeft color="#FFFFFF" size={20} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <Shield color="#FFFFFF" size={36} />
              </View>
              <Text style={styles.appTitle}>{t('login_title')}</Text>
              <Text style={styles.subtitle}>{t('login_subtitle')}</Text>
            </View>

            <Card style={styles.loginCard}>
              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              <Input
                label={t('mobile_number')}
                placeholder={t('mobile_placeholder')}
                value={mobileNumber}
                onChangeText={(val) => {
                  // Only allow digits and max 10 characters
                  const digitsOnly = val.replace(/\D/g, '').slice(0, 10);
                  setMobileNumber(digitsOnly);
                  if (errorMessage) setErrorMessage('');
                }}
                keyboardType="phone-pad"
                maxLength={10}
                leftIcon={<Smartphone color="#64748B" size={20} />}
              />

              <Button
                title={isLoading ? t('authenticating') : t('sign_in')}
                onPress={handleLogin}
                loading={isLoading}
                disabled={mobileNumber.length < 10 || isLoading}
                style={styles.signInBtn}
                icon={!isLoading ? <ArrowRight color="#FFFFFF" size={20} /> : undefined}
              />
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SwipeableBackWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  topNav: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...THEME.shadows.medium,
  },
  appTitle: {
    fontSize: THEME.typography.xxl,
    fontWeight: '800',
    color: THEME.text,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: THEME.typography.sm,
    color: THEME.textVariant,
    marginTop: 4,
  },
  loginCard: {
    padding: 24,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: THEME.danger,
    fontSize: THEME.typography.xs,
    fontWeight: '600',
  },
  signInBtn: {
    marginTop: 12,
  },
});
