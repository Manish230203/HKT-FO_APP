import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  ArrowLeft,
  Shield,
  Compass,
  MapPin,
  Battery,
  Wifi,
  Radio,
  CheckCircle2,
  Clock,
  Play,
  ArrowRight,
  User,
  AlertCircle,
  Building2,
  Lock,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { useAttendance } from '../../context/AttendanceContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { getPatrolTours, startPatrolTour, PatrolTourItem } from '../../services/patrolService';
import { getDeviceBatteryLevel } from '../../services/battery';
import { getPunchRecords } from '../../services/db';

export default function PatrolTourSelectionScreen() {
  const router = useRouter();
  const { user, profileImage } = useAuth();
  const { todayRecord, profileData, refreshStatus } = useAttendance();
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();

  const [tours, setTours] = useState<PatrolTourItem[]>([]);
  const [activeTour, setActiveTour] = useState<any>(null);
  const [siteName, setSiteName] = useState<string>('Site');
  const [siteId, setSiteId] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [startingTour, setStartingTour] = useState<string | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number>(100);
  const [localActive, setLocalActive] = useState<boolean>(false);

  const checkLocalActivePunch = useCallback(async () => {
    try {
      const empId = user?.employee_id || (user?.id ? String(user.id) : '');
      const punchLogs = await getPunchRecords(empId);
      const nowMs = Date.now();
      const todayStr = new Date().toISOString().split('T')[0];
      const activePunch = punchLogs.find((r) => {
        const isPunchedIn = r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--';
        const punchMs = r.timestamp || 0;
        const isWithin16Hours = (nowMs - punchMs) < 16 * 3600 * 1000;
        const isToday = !r.date || r.date === todayStr;
        return isPunchedIn && isWithin16Hours && isToday;
      });
      setLocalActive(Boolean(activePunch));
    } catch (e) {
      // ignore
    }
  }, [user]);

  // Compute On Duty status (checks backend record with fallback to local punch log)
  const isServerActive = Boolean(todayRecord && todayRecord.check_in && !todayRecord.check_out);
  const hasServerExplicitInactive = Boolean(
    (todayRecord && (todayRecord as any).no_active_session) ||
    (todayRecord && todayRecord.check_out)
  );
  const isOnDuty = isServerActive || (!hasServerExplicitInactive && localActive);

  const empCode = (user as any)?.emp_code || (profileData as any)?.emp_code || 'EMP';
  const officerName = user?.name || (profileData as any)?.name || 'Officer';
  const empOid = user?.id || (profileData as any)?.oid || 113;

  const loadData = useCallback(async () => {
    try {
      const bLevel = await getDeviceBatteryLevel();
      setBatteryLevel(bLevel);

      const targetSiteId = user?.site_id || (profileData as any)?.site || undefined;
      const res = await getPatrolTours(empOid, targetSiteId);
      if (res && res.success) {
        setTours(res.tours || []);
        setActiveTour(res.active_tour || null);
        setSiteName(res.site_name || 'Assigned Site');
        setSiteId(res.site_id || 1);
      }
    } catch (e: any) {
      const errDetail = e.response?.data?.message || e.response?.data?.detail || (typeof e.response?.data === 'string' ? e.response.data : e.message);
      console.error('Error loading patrolling tours:', errDetail || e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [empOid, user, profileData]);

  useFocusEffect(
    useCallback(() => {
      refreshStatus?.();
      checkLocalActivePunch();
      loadData();
    }, [loadData, refreshStatus, checkLocalActivePunch])
  );

  const onRefresh = () => {
    setRefreshing(true);
    refreshStatus?.();
    checkLocalActivePunch();
    loadData();
  };

  const hasProfilePhoto = Boolean(
    (profileImage && profileImage.trim().length > 0) ||
    (profileData && profileData.profile_photo && String(profileData.profile_photo).trim().length > 0 && String(profileData.profile_photo) !== 'null')
  );

  const handleStartTour = async (tour: PatrolTourItem) => {
    if (!hasProfilePhoto) {
      Alert.alert(
        t('profile_photo_required_title'),
        t('profile_photo_required_msg'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('upload_photo'), onPress: () => router.push({ pathname: '/settings', params: { autoUpload: 'true' } }) }
        ]
      );
      return;
    }

    if (!isOnDuty) {
      if (!hasProfilePhoto) {
        Alert.alert(
          t('profile_photo_required_title'),
          t('profile_photo_required_msg'),
          [
            { text: t('cancel'), style: 'cancel' },
            { text: t('upload_photo'), onPress: () => router.push({ pathname: '/settings', params: { autoUpload: 'true' } }) }
          ]
        );
        return;
      }
      Alert.alert(
        t('duty_session_inactive_title'),
        t('duty_session_inactive_msg'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('activate_session'), onPress: () => router.push('/mark-attendance') }
        ]
      );
      return;
    }

    if (activeTour && activeTour.tour_name !== tour.tour_name) {
      Alert.alert(
        t('active_tour_progress_title'),
        t('switch_tour_prompt', { currentTour: activeTour.tour_name, newTour: tour.tour_name }),
        [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('switch_tour'),
            onPress: () => proceedStart(tour),
          },
        ]
      );
      return;
    }
    proceedStart(tour);
  };

  const proceedStart = async (tour: PatrolTourItem) => {
    try {
      setStartingTour(tour.tour_name);
      const res = await startPatrolTour(empOid, tour.tour_name);
      if (res && res.success) {
        router.push({
          pathname: '/patrol/tour',
          params: {
            tourName: tour.tour_name,
            siteId: String(siteId),
            siteName: siteName,
          },
        });
      } else {
        Alert.alert(t('unable_start_tour'), res?.message || t('network_error'));
      }
    } catch (e: any) {
      const errorMsg = e?.response?.data?.detail || e?.message || t('unable_start_tour');
      Alert.alert(t('tour_start_notice'), errorMsg);
    } finally {
      setStartingTour(null);
    }
  };

  const getTourIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('server')) {
      return <Radio color="#60A5FA" size={26} />;
    }
    if (lower.includes('park')) {
      return <Compass color="#34D399" size={26} />;
    }
    if (lower.includes('gate') || lower.includes('perimeter')) {
      return <Shield color="#FBBF24" size={26} />;
    }
    return <Building2 color="#818CF8" size={26} />;
  };

  const darkNavyBg = isDark ? '#0A1128' : '#F4F7FA';
  const cardBg = isDark ? '#131C33' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subTextColor = isDark ? '#94A3B8' : '#64748B';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkNavyBg }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Top Header */}
      <View style={[styles.headerBar, { borderBottomColor: cardBorder }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
        >
          <ArrowLeft color={isDark ? '#FFFFFF' : '#0F172A'} size={22} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: '#3B82F6' }]}>{t('patrolling')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Officer Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.profileRow}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                <User color="#3B82F6" size={28} />
              </View>
            )}

            <View style={styles.profileInfo}>
              <Text style={[styles.officerNameText, { color: textColor }]} numberOfLines={1}>
                {officerName}
              </Text>
              <Text style={[styles.officerMetaText, { color: subTextColor }]}>
                {empCode}
              </Text>
              <Text style={[styles.officerSiteText, { color: '#3B82F6' }]} numberOfLines={1}>
                <MapPin size={12} color="#3B82F6" /> {siteName}
              </Text>
            </View>

            {/* Status Badge */}
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: isOnDuty ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  borderColor: isOnDuty ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isOnDuty ? '#22C55E' : '#EF4444' },
                ]}
              />
              <Text
                style={[
                  styles.statusBadgeText,
                  { color: isOnDuty ? '#22C55E' : '#EF4444' },
                ]}
              >
                {isOnDuty ? t('on_duty') : t('off_duty')}
              </Text>
            </View>
          </View>
        </View>

        {/* Status Info Row */}
        <View style={[styles.statusRowContainer, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.statusItem}>
            <View style={[styles.statusIconCircle, { backgroundColor: 'rgba(34, 197, 94, 0.12)' }]}>
              <Radio color="#22C55E" size={16} />
            </View>
            <View>
              <Text style={[styles.statusItemLabel, { color: subTextColor }]}>{t('gps_status')}</Text>
              <Text style={[styles.statusItemValue, { color: '#22C55E' }]}>{t('gps_active_status')}</Text>
            </View>
          </View>

          <View style={[styles.statusDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]} />

          <View style={styles.statusItem}>
            <View style={[styles.statusIconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
              <Wifi color="#3B82F6" size={16} />
            </View>
            <View>
              <Text style={[styles.statusItemLabel, { color: subTextColor }]}>{t('sync_status')}</Text>
              <Text style={[styles.statusItemValue, { color: '#3B82F6' }]}>{t('live_synced')}</Text>
            </View>
          </View>

          <View style={[styles.statusDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]} />

          <View style={styles.statusItem}>
            <View style={[styles.statusIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
              <Battery color="#F59E0B" size={16} />
            </View>
            <View>
              <Text style={[styles.statusItemLabel, { color: subTextColor }]}>{t('battery')}</Text>
              <Text style={[styles.statusItemValue, { color: textColor }]}>{batteryLevel}%</Text>
            </View>
          </View>
        </View>

        {/* Active Tour Banner (If Any) */}
        {activeTour && (
          <LinearGradient
            colors={['#1E3A8A', '#1E1B4B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.activeTourBanner}
          >
            <View style={styles.activeTourRow}>
              <View style={styles.activeTourPulseDot} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.activeTourNoticeLabel}>{t('active_tour_in_progress')}</Text>
                <Text style={styles.activeTourNoticeTitle}>{activeTour.tour_name}</Text>
              </View>
              <TouchableOpacity
                style={styles.resumeActiveButton}
                activeOpacity={0.8}
                onPress={() =>
                  router.push({
                    pathname: '/patrol/tour',
                    params: {
                      tourName: activeTour.tour_name,
                      siteId: String(siteId),
                      siteName: siteName,
                    },
                  })
                }
              >
                <Text style={styles.resumeActiveButtonText}>{t('resume')}</Text>
                <ArrowRight color="#FFFFFF" size={16} />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        )}

        {/* Section Heading */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeadingTitle, { color: textColor }]}>{t('select_checklist_tour')}</Text>
          <Text style={[styles.sectionHeadingCount, { color: '#3B82F6' }]}>
            {t('available_count', { count: tours.length })}
          </Text>
        </View>

        {/* Tours List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={[styles.loadingText, { color: subTextColor }]}>{t('loading_checklist_tours')}</Text>
          </View>
        ) : tours.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Shield color="#64748B" size={44} />
            <Text style={[styles.emptyTitle, { color: textColor }]}>{t('no_checklist_tours_found')}</Text>
            <Text style={[styles.emptySubtitle, { color: subTextColor }]}>
              {t('no_checklist_tours_desc', { siteName })}
            </Text>
          </View>
        ) : (
          tours.map((tourItem, idx) => {
            const isThisTourActive = activeTour && activeTour.tour_name === tourItem.tour_name;
            const isBusyByOther = Boolean(tourItem.active_runner_name && !isThisTourActive);
            const isStartingThis = startingTour === tourItem.tour_name;

            return (
              <View
                key={`${tourItem.tour_name}_${idx}`}
                style={[
                  styles.tourCard,
                  {
                    backgroundColor: cardBg,
                    borderColor: isThisTourActive ? '#3B82F6' : cardBorder,
                    borderWidth: isThisTourActive ? 1.5 : 1,
                  },
                ]}
              >
                <View style={styles.tourCardTop}>
                  <View style={[styles.tourIconBox, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
                    {getTourIcon(tourItem.tour_name)}
                  </View>

                  <View style={styles.tourCardHeaderInfo}>
                    <View style={styles.tourTitleRow}>
                      <Text style={[styles.tourNameText, { color: textColor }]} numberOfLines={1}>
                        {tourItem.tour_name}
                      </Text>
                      {isThisTourActive && (
                        <View style={styles.activeTourBadge}>
                          <Text style={styles.activeTourBadgeText}>{t('resumable')}</Text>
                        </View>
                      )}
                    </View>

                    <Text style={[styles.tourDescText, { color: subTextColor }]} numberOfLines={2}>
                      {tourItem.description}
                    </Text>
                  </View>
                </View>

                {/* Progress / Status Info */}
                <View style={styles.tourCardStatsRow}>
                  <View style={styles.tourStatItem}>
                    <CheckCircle2 color="#10B981" size={16} />
                    <Text style={[styles.tourStatText, { color: subTextColor }]}>
                      {t('checkpoints_completed_ratio', { completed: tourItem.completed_checkpoints, total: tourItem.total_checkpoints })}
                    </Text>
                  </View>

                  {isBusyByOther && (
                    <View style={styles.busyGuardBadge}>
                      <Text style={styles.busyGuardText}>{t('run_by_guard', { name: tourItem.active_runner_name || '' })}</Text>
                    </View>
                  )}
                </View>

                {/* Blue START TOUR Button */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={isStartingThis}
                  onPress={() => handleStartTour(tourItem)}
                  style={[
                    styles.startTourButton,
                    {
                      backgroundColor: isThisTourActive ? '#2563EB' : '#1D4ED8',
                    },
                  ]}
                >
                  {isStartingThis ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Play color="#FFFFFF" size={16} fill="#FFFFFF" />
                      <Text style={styles.startTourButtonText}>
                        {isThisTourActive ? t('resume_tour_btn') : t('start_tour_btn')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  headerBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scrollContent: {
    padding: 16,
  },
  profileCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  officerNameText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  officerMetaText: {
    fontSize: 13,
    marginBottom: 2,
  },
  officerSiteText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  statusItemLabel: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  statusItemValue: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  statusDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 4,
  },
  activeTourBanner: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  activeTourRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeTourPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#60A5FA',
  },
  activeTourNoticeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#93C5FD',
    letterSpacing: 0.5,
  },
  activeTourNoticeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 1,
  },
  resumeActiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  resumeActiveButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionHeadingTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sectionHeadingCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  tourCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  tourCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tourIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  tourCardHeaderInfo: {
    flex: 1,
  },
  tourTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tourNameText: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  activeTourBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  activeTourBadgeText: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '700',
  },
  tourDescText: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  tourCardStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  tourStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tourStatText: {
    fontSize: 12,
    fontWeight: '500',
  },
  busyGuardBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  busyGuardText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '600',
  },
  startTourButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    marginTop: 14,
    gap: 8,
  },
  startTourButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    marginTop: 12,
  },
  emptyContainer: {
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
