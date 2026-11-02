import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sun, Moon, BookOpen, ChevronRight, ArrowLeft, Building2, Compass } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { StatusBar } from 'react-native';

export default function SelectVisitTypeScreen() {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{
    clientId?: string;
    clientName?: string;
    siteId?: string;
    siteName?: string;
    plannedId?: string;
    checkInTime?: string;
    checkOutTime?: string;
    customVisitId?: string;
    isCustom?: string;
    customClientName?: string;
    customSiteName?: string;
  }>();

  const isCustom = Boolean(params.isCustom === '1' || params.customVisitId);
  const sName = params.siteName || params.customSiteName ? decodeURIComponent(params.siteName || params.customSiteName || '') : '';
  const cName = params.clientName || params.customClientName ? decodeURIComponent(params.clientName || params.customClientName || '') : '';

  // If this is a custom visit, we display General Visit and Patrolling Tour options
  const handleSelect = (type: 'day' | 'night' | 'general' | 'tour') => {
    const qp = `clientId=${params.clientId || ''}&clientName=${encodeURIComponent(cName)}&siteId=${params.siteId || ''}&siteName=${encodeURIComponent(sName)}&plannedId=${params.plannedId || ''}&checkInTime=${params.checkInTime || ''}&checkOutTime=${params.checkOutTime || ''}&customVisitId=${params.customVisitId || ''}&isCustom=${params.isCustom || '0'}&customClientName=${encodeURIComponent(cName)}&customSiteName=${encodeURIComponent(sName)}`;
    if (type === 'day') {
      router.push(`/visits/day-visit/day-visit-create?${qp}`);
    } else if (type === 'night') {
      router.push(`/visits/night-visit/night-visit-create?${qp}`);
    } else if (type === 'general') {
      router.push(`/visits/general-visit/general-visit-create?${qp}`);
    } else if (type === 'tour') {
      router.push({
        pathname: '/visits/tours/tour-select',
        params: {
          siteId: params.siteId || '',
          siteName: encodeURIComponent(sName),
          customVisitId: params.customVisitId || '',
          clientName: encodeURIComponent(cName),
          plannedId: params.plannedId || '',
        },
      });
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}
          activeOpacity={0.8}
        >
          <ArrowLeft color={colors.text} size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('select_visit_type') || 'Select Visit Type'}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {t('choose_visit_type_subtitle') || 'Choose the report form to conduct for this site'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Site info badge if available */}
        {(sName || cName) ? (
          <View style={[styles.siteInfoBanner, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderColor: isDark ? '#334155' : '#BFDBFE' }]}>
            <View style={styles.siteInfoIcon}>
              <Building2 color="#3B82F6" size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.siteInfoName, { color: colors.text }]}>{sName || 'Site Location'}</Text>
              {cName ? <Text style={[styles.siteInfoClient, { color: colors.textSecondary }]}>{cName}</Text> : null}
            </View>
          </View>
        ) : null}

        {/* Day Visit Card */}
        {!isCustom && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => handleSelect('day')}
            style={[
              styles.typeCard,
              {
                backgroundColor: colors.card,
                borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : 'rgba(245, 158, 11, 0.45)',
              },
            ]}
          >
            <View style={[styles.iconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
              <Sun color="#F59E0B" size={34} />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('day_visit') || 'Day Visit'}</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
                {t('day_visit_desc') || 'Conduct a scheduled day visit report & guard inspection.'}
              </Text>
            </View>
            <ChevronRight color={colors.textSecondary} size={22} />
          </TouchableOpacity>
        )}

        {/* Night Visit Card */}
        {!isCustom && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => handleSelect('night')}
            style={[
              styles.typeCard,
              {
                backgroundColor: colors.card,
                borderColor: isDark ? 'rgba(129, 140, 248, 0.35)' : 'rgba(129, 140, 248, 0.45)',
              },
            ]}
          >
            <View style={[styles.iconBox, { backgroundColor: 'rgba(129, 140, 248, 0.15)' }]}>
              <Moon color="#818CF8" size={34} />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('night_visit') || 'Night Round'}</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
                {t('night_visit_desc') || 'Conduct night patrol checking, guard briefing & security verification.'}
              </Text>
            </View>
            <ChevronRight color={colors.textSecondary} size={22} />
          </TouchableOpacity>
        )}

        {/* General Visit Card */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => handleSelect('general')}
          style={[
            styles.typeCard,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? 'rgba(52, 211, 153, 0.35)' : 'rgba(52, 211, 153, 0.45)',
            },
          ]}
        >
          <View style={[styles.iconBox, { backgroundColor: 'rgba(52, 211, 153, 0.15)' }]}>
            <BookOpen color="#34D399" size={34} />
          </View>
          <View style={styles.textContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('general_visit') || 'General Visit'}</Text>
            <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
              {t('general_visit_desc') || 'Conduct general audit, client meeting or official liaison inspection.'}
            </Text>
          </View>
          <ChevronRight color={colors.textSecondary} size={22} />
        </TouchableOpacity>

        {/* Patrolling Tour & Checkpoint Checklist Card */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => handleSelect('tour')}
          style={[
            styles.typeCard,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.45)',
            },
          ]}
        >
          <View style={[styles.iconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
            <Compass color="#3B82F6" size={34} />
          </View>
          <View style={styles.textContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Patrolling Tour & Checklist</Text>
            <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
              Conduct sequential checkpoint checklist with GPS & QR verification.
            </Text>
          </View>
          <ChevronRight color={colors.textSecondary} size={22} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  siteInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginBottom: 4,
  },
  siteInfoIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  siteInfoName: {
    fontSize: 14,
    fontWeight: '800',
  },
  siteInfoClient: {
    fontSize: 12,
    marginTop: 2,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
});
