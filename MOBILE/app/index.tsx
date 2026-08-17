import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { getLanguageSetting } from '../services/db';
import { THEME } from '../constants/theme';

export default function IndexScreen() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    checkAppFlow();
  }, [user, isLoading]);

  const checkAppFlow = async () => {
    if (isLoading) return;

    try {
      const savedLang = await getLanguageSetting();
      if (!savedLang) {
        router.replace('/lang/lang-selection');
        return;
      }

      if (user) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace('/login');
      }
    } catch (e) {
      console.error('Error during initial navigation check', e);
      router.replace('/login');
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={THEME.primary} />
      <Text style={styles.text}>Initializing PatrolSync FO...</Text>
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
