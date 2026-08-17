import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, ArrowRight, Lock, User as UserIcon } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { THEME } from '../constants/theme';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export default function LoginScreen() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async () => {
    if (!employeeId) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const success = await login(employeeId, password || 'password123');
      if (success) {
        router.replace('/(tabs)/dashboard');
      } else {
        setErrorMessage(t('invalid_credentials'));
      }
    } catch (err: any) {
      console.error('Login error', err);
      const detail = err.response?.data?.detail || t('invalid_credentials');
      setErrorMessage(detail);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
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
              label={t('emp_id_or_mobile')}
              placeholder={t('emp_id_placeholder')}
              value={employeeId}
              onChangeText={setEmployeeId}
              autoCapitalize="none"
            />

            <Input
              label={t('password')}
              placeholder={t('password_placeholder')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <Button
              title={isLoading ? t('authenticating') : t('sign_in')}
              onPress={handleLogin}
              loading={isLoading}
              disabled={!employeeId}
              style={styles.signInBtn}
              icon={!isLoading ? <ArrowRight color="#FFFFFF" size={20} /> : undefined}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
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
