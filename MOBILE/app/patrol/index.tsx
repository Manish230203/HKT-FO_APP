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
import { useTheme } from '../../context/ThemeContext';
import { getPatrolTours, startPatrolTour, PatrolTourItem } from '../../services/patrolService';
import { getDeviceBatteryLevel } from '../../services/battery';

export default function PatrolTourSelectionScreen() {
  const router = useRouter();
  const { user, profileImage } = useAuth();
  const { todayRecord, profileData } = useAttendance();
  const { colors, isDark } = useTheme();

  const [tours, setTours] = useState<PatrolTourItem[]>([]);
  const [activeTour, setActiveTour] = useState<any>(null);
  const [siteName, setSiteName] = useState<string>('Site');
  const [siteId, setSiteId] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [startingTour, setStartingTour] = useState<string | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number>(100);

  // Compute On Duty status
  const isOnDuty = Boolean(todayRecord && todayRecord.check_in && !todayRecord.check_out);
  const empCode = (user as any)?.emp_code || (profileData as any)?.emp_code || 'EMP';
  const designation = (profileData as any)?.designation || (user as any)?.designation || 'Field Officer';
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
      console.error('Error loading patrolling tours:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [empOid, user, profileData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const hasProfilePhoto = Boolean(
    profileImage ||
    (profileData && profileData.profile_photo) ||
    (user && (user as any).profile_photo)
  );

  const handleStartTour = async (tour: PatrolTourItem) => {
    if (!hasProfilePhoto) {
      Alert.alert(
        'Profile Photo Required',
        'Please upload your profile photo first in Settings before starting a checklist tour.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upload Photo', onPress: () => router.push('/settings') }
        ]
      );
      return;
    }

    if (!isOnDuty) {
      Alert.alert(
        'Active Status Required',
        'You are currently INACTIVE. You must activate your session before starting a checklist tour.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Activate', onPress: () => router.push('/mark-attendance') }
        ]
      );
      return;
    }

    if (activeTour && activeTour.tour_name !== tour.tour_name) {
      Alert.alert(
        'Active Tour In Progress',
        `You currently have tour '${activeTour.tour_name}' ongoing. Starting '${tour.tour_name}' will close the previous tour. Do you wish to continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Switch Tour',
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
        Alert.alert('Unable to Start Tour', res?.message || 'Please check your connection and try again.');
      }
    } catch (e: any) {
      const errorMsg = e?.response?.data?.detail || e?.message || 'Could not start tour.';
      Alert.alert('Tour Start Notice', errorMsg);
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
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subTextColor = isDark ? '#94A3B8' : '#64748B';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkNavyBg }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Top Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
        >
          <ArrowLeft color={isDark ? '#FFFFFF' : '#0F172A'} size={22} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: '#3B82F6' }]}>Checklist</Text>
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
                {designation}
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
                {isOnDuty ? 'ACTIVE' : 'INACTIVE'}
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
              <Text style={[styles.statusItemLabel, { color: subTextColor }]}>GPS Status</Text>
              <Text style={[styles.statusItemValue, { color: '#22C55E' }]}>Active • 3m</Text>
            </View>
          </View>

          <View style={styles.statusDivider} />

          <View style={styles.statusItem}>
            <View style={[styles.statusIconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
              <Wifi color="#3B82F6" size={16} />
            </View>
            <View>
              <Text style={[styles.statusItemLabel, { color: subTextColor }]}>Sync Status</Text>
              <Text style={[styles.statusItemValue, { color: '#3B82F6' }]}>Live Synced</Text>
            </View>
          </View>

          <View style={styles.statusDivider} />

          <View style={styles.statusItem}>
            <View style={[styles.statusIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
              <Battery color="#F59E0B" size={16} />
            </View>
            <View>
              <Text style={[styles.statusItemLabel, { color: subTextColor }]}>Battery</Text>
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
                <Text style={styles.activeTourNoticeLabel}>ACTIVE TOUR IN PROGRESS</Text>
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
                <Text style={styles.resumeActiveButtonText}>Resume</Text>
                <ArrowRight color="#FFFFFF" size={16} />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        )}

        {/* Section Heading */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeadingTitle, { color: textColor }]}>Select Checklist Tour</Text>
          <Text style={[styles.sectionHeadingCount, { color: '#3B82F6' }]}>
            {tours.length} Available
          </Text>
        </View>

        {/* Tours List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={[styles.loadingText, { color: subTextColor }]}>Loading Checklist Tours...</Text>
          </View>
        ) : tours.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Shield color="#64748B" size={44} />
            <Text style={[styles.emptyTitle, { color: textColor }]}>No Checklist Tours Found</Text>
            <Text style={[styles.emptySubtitle, { color: subTextColor }]}>
              There are no checklist tours configured for {siteName}. Please check with your supervisor or administrator.
            </Text>
          </View>
        ) : (
          tours.map((t, idx) => {
            const isThisTourActive = activeTour && activeTour.tour_name === t.tour_name;
            const isBusyByOther = Boolean(t.active_runner_name && !isThisTourActive);
            const isStartingThis = startingTour === t.tour_name;

            return (
              <View
                key={`${t.tour_name}_${idx}`}
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
                    {getTourIcon(t.tour_name)}
                  </View>

                  <View style={styles.tourCardHeaderInfo}>
                    <View style={styles.tourTitleRow}>
                      <Text style={[styles.tourNameText, { color: textColor }]} numberOfLines={1}>
                        {t.tour_name}
                      </Text>
                      {isThisTourActive && (
                        <View style={styles.activeTourBadge}>
                          <Text style={styles.activeTourBadgeText}>RESUMABLE</Text>
                        </View>
                      )}
                    </View>

                    <Text style={[styles.tourDescText, { color: subTextColor }]} numberOfLines={2}>
                      {t.description}
                    </Text>
                  </View>
                </View>

                {/* Progress / Status Info */}
                <View style={styles.tourCardStatsRow}>
                  <View style={styles.tourStatItem}>
                    <CheckCircle2 color="#10B981" size={16} />
                    <Text style={[styles.tourStatText, { color: subTextColor }]}>
                      {t.completed_checkpoints} of {t.total_checkpoints} Completed
                    </Text>
                  </View>

                  {isBusyByOther && (
                    <View style={styles.busyGuardBadge}>
                      <Text style={styles.busyGuardText}>Run by {t.active_runner_name}</Text>
                    </View>
                  )}
                </View>

                {/* Blue START TOUR Button */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={isStartingThis}
                  onPress={() => handleStartTour(t)}
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
                        {isThisTourActive ? 'RESUME TOUR' : 'START TOUR'}
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
