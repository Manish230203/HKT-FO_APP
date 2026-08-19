import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { getLanguageSetting } from '../services/db';
import { THEME } from '../constants/theme';

export default function IndexScreen() {
  const { isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    checkAppFlow();
  }, [isLoading]);

  const checkAppFlow = async () => {
    if (isLoading) return;

    try {
      router.replace('/lang/lang-selection');
    } catch (e) {
      console.error('Error during initial navigation check', e);
      router.replace('/lang/lang-selection');
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
