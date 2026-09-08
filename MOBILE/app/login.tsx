import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowRight, ArrowLeft, Smartphone } from 'lucide-react-native';
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

  const handleLogin = async () => {
    if (!mobileNumber || mobileNumber.length !== 10) {
      setErrorMessage(t('invalid_mobile'));
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      // Format mobile number and bypass password verification for testing
      const cleanedMobile = mobileNumber.replace(/\D/g, '');
      const res = await login(cleanedMobile, 'password123');

      if (res.success) {
        router.replace('/(tabs)/dashboard');
      } else {
        setErrorMessage(res.message || t('invalid_credentials'));
      }
    } catch (err: any) {
      console.error('Login Error:', err);
      setErrorMessage(t('network_error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SwipeableBackWrapper targetRoute="/lang/lang-selection">
      <SafeAreaView style={styles.container}>
        {/* Top Header Bar with Back Button */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace('/lang/lang-selection')}
            activeOpacity={0.7}
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
                <Image source={require('../assets/images/app_logo.png')} style={styles.logoImage} resizeMode="contain" />
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
    width: 90,
    height: 90,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
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
