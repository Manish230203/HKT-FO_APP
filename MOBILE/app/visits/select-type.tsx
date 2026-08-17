import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Sun, Moon, BookOpen, ChevronRight } from 'lucide-react-native';
import { useLanguage } from '../../context/LanguageContext';
import { THEME } from '../../constants/theme';
import { Card } from '../../components/ui/Card';

export default function SelectVisitTypeScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string; siteId?: string; plannedId?: string }>();

  const handleSelect = (type: 'day' | 'night' | 'general') => {
    const qp = `clientId=${params.clientId || ''}&siteId=${params.siteId || ''}&plannedId=${params.plannedId || ''}`;
    if (type === 'day') {
      router.push(`/visits/day-visit/create?${qp}`);
    } else if (type === 'night') {
      router.push(`/visits/night-visit/create?${qp}`);
    } else if (type === 'general') {
      router.push(`/visits/general-visit/create?${qp}`);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>{t('select_visit_type')}</Text>
      <Text style={styles.headerSubtitle}>Select the type of report you wish to conduct for this site.</Text>

      {/* Day Visit Card */}
      <Card onPress={() => handleSelect('day')} style={styles.typeCard}>
        <View style={styles.cardContent}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
            <Sun color="#F59E0B" size={28} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>{t('day_visit')}</Text>
            <Text style={styles.cardDesc}>{t('day_visit_desc')}</Text>
          </View>
          <ChevronRight color={THEME.textVariant} size={20} />
        </View>
      </Card>

      {/* Night Visit Card */}
      <Card onPress={() => handleSelect('night')} style={styles.typeCard}>
        <View style={styles.cardContent}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(129, 140, 248, 0.15)' }]}>
            <Moon color="#818CF8" size={28} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>{t('night_visit')}</Text>
            <Text style={styles.cardDesc}>{t('night_visit_desc')}</Text>
          </View>
          <ChevronRight color={THEME.textVariant} size={20} />
        </View>
      </Card>

      {/* General Visit Card */}
      <Card onPress={() => handleSelect('general')} style={styles.typeCard}>
        <View style={styles.cardContent}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(52, 211, 153, 0.15)' }]}>
            <BookOpen color="#34D399" size={28} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>{t('general_visit')}</Text>
            <Text style={styles.cardDesc}>{t('general_visit_desc')}</Text>
          </View>
          <ChevronRight color={THEME.textVariant} size={20} />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  content: {
    padding: 16,
  },
  headerTitle: {
    fontSize: THEME.typography.xl,
    fontWeight: '800',
    color: THEME.text,
    marginTop: 8,
  },
  headerSubtitle: {
    fontSize: THEME.typography.xs,
    color: THEME.textVariant,
    marginTop: 4,
    marginBottom: 20,
  },
  typeCard: {
    padding: 18,
    marginVertical: 8,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: THEME.typography.md,
    fontWeight: '700',
    color: THEME.text,
  },
  cardDesc: {
    fontSize: THEME.typography.xs,
    color: THEME.textVariant,
    marginTop: 4,
    lineHeight: 18,
  },
});
