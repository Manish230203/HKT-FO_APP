import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowRight, ArrowLeft, Smartphone } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getConsentSetting } from '../services/db';
import { THEME } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { SwipeableBackWrapper } from '../components/SwipeableBackWrapper';

export default function LoginScreen() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const { colors, isDark } = useTheme();
  const router = useRouter();

  const [mobileNumber, setMobileNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const [customError, setCustomError] = useState('');

  useEffect(() => {
    (async () => {
      const consentAccepted = await getConsentSetting();
      if (!consentAccepted) {
        router.replace('/consent');
      }
    })();
  }, []);

  const handleLogin = async () => {
    if (!mobileNumber || mobileNumber.length !== 10) {
      setErrorKey('invalid_mobile');
      setCustomError('');
      return;
    }

    setIsLoading(true);
    setErrorKey('');
    setCustomError('');

    try {
      // Format mobile number and bypass password verification for testing
      const cleanedMobile = mobileNumber.replace(/\D/g, '');
      const res = await login(cleanedMobile, 'password123');

      if (res.success) {
        router.replace('/(tabs)/dashboard');
      } else {
        if (res.errorType === 'RESTRICTED_ROLE') {
          setErrorKey('access_restricted_fo');
        } else if (res.errorType === 'ALREADY_REGISTERED') {
          setErrorKey('device_already_registered');
        } else if (res.errorType === 'DEACTIVATED') {
          setErrorKey('employee_deactivated');
        } else if (res.errorType === 'NO_ACCOUNT') {
          setErrorKey('no_account_found');
        } else if (res.errorType === 'NETWORK_ERROR') {
          setErrorKey('network_error');
        } else if (res.message) {
          setErrorKey(res.message);
        } else {
          setErrorKey('invalid_credentials');
        }
      }
    } catch (err: any) {
      console.error('Login Error:', err);
      setErrorKey('network_error');
    } finally {
      setIsLoading(false);
    }
  };

  const displayedError = errorKey ? t(errorKey) : customError;
  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  return (
    <SwipeableBackWrapper fallbackRoute="/lang/lang-selection">
      <SafeAreaView style={styles.container}>
        {/* Top Header Bar with Back Button */}
        <View style={styles.topNav}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace('/lang/lang-selection')}
            activeOpacity={0.7}
          >
            <ArrowLeft color={colors.text} size={20} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <Image source={require('../assets/images/app_logo.png')} style={styles.logoImage} resizeMode="contain" />
              </View>
              <Text style={styles.appTitle}>
                <Text style={{ color: '#3B82F6' }}>VIGILO-O</Text>
              </Text>
              <Text style={styles.subtitle}>{t('login_subtitle')}</Text>
            </View>

            <Card style={styles.loginCard}>
              {displayedError ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{displayedError}</Text>
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
                  if (errorKey || customError) {
                    setErrorKey('');
                    setCustomError('');
                  }
                }}
                keyboardType="phone-pad"
                maxLength={10}
                leftIcon={<Smartphone color={colors.textSecondary} size={20} />}
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

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 130,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  loginCard: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorBanner: {
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  signInBtn: {
    marginTop: 8,
  },
});
