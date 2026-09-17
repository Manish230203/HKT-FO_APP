import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { getLanguageSetting, getConsentSetting } from '../services/db';
import { THEME } from '../constants/theme';

export default function IndexScreen() {
  const { isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    checkAppFlow();
  }, [isLoading, user]);

  const checkAppFlow = async () => {
    if (isLoading) return;

    try {
      const savedLang = await getLanguageSetting();
      const consentAccepted = await getConsentSetting();

      if (!savedLang) {
        router.replace('/lang/lang-selection');
      } else if (!consentAccepted) {
        router.replace('/consent');
      } else if (user) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace('/login');
      }
    } catch (e) {
      console.error('Error during initial navigation check', e);
      router.replace('/lang/lang-selection');
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={THEME.primary} />
      <Text style={styles.text}>Initializing VIGILO-O...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: THEME.textVariant,
    marginTop: 16,
    fontSize: THEME.typography.sm,
  },
});
