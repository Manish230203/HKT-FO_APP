import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Users,
  Shield,
  Clock,
  RefreshCw,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import {
  getSiteManpowerDetails,
  SiteManpowerResponse,
  SiteShift,
  SiteDesignationBreakdown,
  SiteManpowerKPI,
} from '../../services/guardAttendanceService';

export default function SiteManpowerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    siteId: string;
    siteName?: string;
    siteCode?: string;
    clientName?: string;
  }>();

  const siteId = params.siteId;
  const initialSiteName = params.siteName || 'Site Manpower';
  const initialSiteCode = params.siteCode || `SIT-${siteId}`;
  const initialClientName = params.clientName || 'Corporate Client';

  const { colors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedShift, setSelectedShift] = useState<string>('all');
  const [scrollProgress, setScrollProgress] = useState(0);
  const [data, setData] = useState<SiteManpowerResponse | null>(null);

  const handleShiftScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const maxOffset = contentSize.width - layoutMeasurement.width;
    if (maxOffset > 0) {
      setScrollProgress(Math.min(1, Math.max(0, contentOffset.x / maxOffset)));
    }
  };

  const loadSiteData = useCallback(async (shift: string = selectedShift) => {
    if (!siteId) return;
    try {
      setLoading(true);
      const res = await getSiteManpowerDetails(siteId, shift);
      if (res) {
        setData(res);
      }
    } catch (err) {
      console.error('Error fetching site manpower:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [siteId, selectedShift]);

  useEffect(() => {
    loadSiteData(selectedShift);
  }, [selectedShift, loadSiteData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadSiteData(selectedShift);
  }, [selectedShift, loadSiteData]);

  const siteName = data?.site?.site_name || initialSiteName;
  const siteCode = data?.site?.site_code || initialSiteCode;
  const clientName = data?.site?.client_name || initialClientName;

  const shifts: SiteShift[] = useMemo(() => {
    return data?.shifts && data.shifts.length > 0
      ? data.shifts
      : [
          { id: 'all', name: 'All Shifts', time_range: '24 Hours' },
          { id: 'morning', name: 'Morning Shift', time_range: '06:00 - 14:00' },
          { id: 'day', name: 'Day Shift', time_range: '14:00 - 22:00' },
          { id: 'night', name: 'Night Shift', time_range: '22:00 - 06:00' },
        ];
  }, [data?.shifts]);

  const kpi: SiteManpowerKPI = useMemo(() => {
    return data?.kpi || {
      required: 0,
      present: 0,
      shortage: 0,
      deployment_percentage: 0,
    };
  }, [data?.kpi]);

  const designations: SiteDesignationBreakdown[] = useMemo(() => {
    return data?.designations || [];
  }, [data?.designations]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {/* Hide Expo Router stack header to eliminate duplicate top bar & second back button */}
      <Stack.Screen options={{ headerShown: false }} />

      {/* TOP NAVIGATION BAR */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.navIconButton, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : colors.surfaceSecondary }]}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft color={colors.text} size={22} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.siteHeaderTitle, { color: colors.text }]} numberOfLines={1}>
            {siteName}
          </Text>
          <Text style={[styles.siteHeaderSub, { color: colors.textSecondary }]} numberOfLines={1}>
            Site Code: {siteCode} • {clientName}
          </Text>
        </View>

        <TouchableOpacity onPress={onRefresh} style={[styles.navIconButton, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : colors.surfaceSecondary }]} activeOpacity={0.7}>
          <RefreshCw color={colors.textSecondary} size={18} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D2FF" />}
        showsVerticalScrollIndicator={false}
      >
        {/* SHIFT SELECTOR HORIZONTAL TABS */}
        <View style={styles.shiftSection}>
          <View style={styles.shiftSectionHeader}>
            <View style={styles.shiftTitleRow}>
              <Clock size={15} color="#00D2FF" style={{ marginRight: 6 }} />
              <Text style={[styles.shiftSectionTitle, { color: colors.text }]}>Duty Shift Roster</Text>
            </View>
            <View style={styles.shiftSwipeHint}>
              <Text style={[styles.shiftSwipeText, { color: colors.textSecondary }]}>
                {shifts.length} Shifts • Swipe to view ➔
              </Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shiftTabsScroll}
            onScroll={handleShiftScroll}
            scrollEventThrottle={16}
          >
            {shifts.map((sh) => {
              const isActive = selectedShift === sh.id;
              return (
                <TouchableOpacity
                  key={sh.id}
                  style={[
                    styles.shiftTab,
                    { backgroundColor: isDark ? '#0F1A36' : colors.card, borderColor: colors.border },
                    isActive && styles.shiftTabActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => setSelectedShift(sh.id)}
                >
                  <View style={styles.shiftTabHeader}>
                    {isActive && <View style={styles.activeDot} />}
                    <Text style={[styles.shiftTabText, { color: colors.textSecondary }, isActive && styles.shiftTabTextActive]}>
                      {sh.name}
                    </Text>
                  </View>
                  {sh.time_range && (
                    <Text style={[styles.shiftTimeText, { color: colors.placeholder }, isActive && styles.shiftTimeTextActive]}>
                      {sh.time_range}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* VISUAL SCROLL PROGRESS INDICATOR */}
          <View style={styles.shiftScrollIndicatorContainer}>
            <View style={[styles.shiftScrollIndicatorTrack, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0' }]}>
              <View
                style={[
                  styles.shiftScrollIndicatorThumb,
                  { left: `${scrollProgress * 65}%` },
                ]}
              />
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00D2FF" />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Fetching manpower counts...</Text>
          </View>
        ) : (
          <>
            {/* KPI METRIC CARDS (2x2 GRID - Option B: Roster Deployed & Live Punches) */}
            <View style={styles.sectionHeaderBox}>
              <Text style={[styles.sectionHeaderText, { color: colors.text }]}>KPI Metric Cards</Text>
            </View>

            <View style={styles.kpiGrid}>
              {/* Row 1: Required & Deployed */}
              <View style={styles.kpiRow}>
                {/* Required Card */}
                <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Required:</Text>
                  <Text style={[styles.kpiValueWhite, { color: colors.text }]}>{kpi.required} Guards</Text>
                </View>

                {/* Deployed (Roster Strength) Card */}
                <View style={[styles.kpiCard, styles.kpiCardDeployed, { backgroundColor: colors.card }]}>
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Deployed (Roster):</Text>
                  <Text style={styles.kpiValueCyan}>{kpi.deployed ?? kpi.present} Guards</Text>
                </View>
              </View>

              {/* Row 2: Live Present & Shortage */}
              <View style={styles.kpiRow}>
                {/* Live Present (Today's Punches) Card */}
                {(() => {
                  const liveCount = kpi.live_present ?? kpi.present;
                  const isZero = liveCount === 0 && kpi.required > 0;
                  return (
                    <View style={[styles.kpiCard, isZero ? styles.kpiCardZero : styles.kpiCardPresent, { backgroundColor: colors.card }]}>
                      <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Live Present:</Text>
                      <Text style={isZero ? styles.kpiValueRed : styles.kpiValueGreen}>
                        {liveCount} Guards
                      </Text>
                    </View>
                  );
                })()}

                {/* Shortage Card with Attendance Percentage */}
                <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.kpiHeaderRow}>
                    <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Shortage:</Text>
                    <View style={kpi.shortage > 0 ? styles.shortagePill : styles.optimalPill}>
                      <Text style={kpi.shortage > 0 ? styles.shortagePillText : styles.optimalPillText}>
                        {kpi.shortage > 0 ? `-${kpi.shortage}` : '0'}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.attendanceSubText, { color: colors.textSecondary }]}>{kpi.deployment_percentage}% Punched</Text>
                  <View style={[styles.progressBarTrack, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0' }]}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${Math.min(100, Math.max(0, kpi.deployment_percentage))}%` },
                      ]}
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* DESIGNATION-WISE BREAKDOWN */}
            <View style={[styles.sectionHeaderBox, { marginTop: 22 }]}>
              <Text style={[styles.sectionHeaderText, { color: colors.text }]}>Designation-wise Breakdown</Text>
            </View>

            {designations.length === 0 ? (
              <View style={[styles.emptyDesignationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Users color={colors.textSecondary} size={32} />
                <Text style={[styles.emptyDesignationText, { color: colors.textSecondary }]}>
                  No active guard roles recorded for this shift.
                </Text>
              </View>
            ) : (
              designations.map((desig) => {
                const liveCount = desig.live_present ?? desig.present;
                const deployedCount = desig.deployed ?? desig.required;
                const isFull = desig.shortage === 0 && liveCount >= desig.required;
                return (
                  <View key={desig.key} style={[styles.desigCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.desigCardTop}>
                      {/* Number Badge & Title */}
                      <View style={styles.desigTitleRow}>
                        <View style={styles.numberBadge}>
                          <Text style={[styles.numberBadgeText, { color: colors.textSecondary }]}>{desig.index}.</Text>
                        </View>
                        <Text style={[styles.desigTitleText, { color: colors.text }]} numberOfLines={1}>
                          {desig.title}
                        </Text>
                      </View>

                      {/* Percentage / Status Badge */}
                      {isFull ? (
                        <View style={styles.optimalStatusRow}>
                          <CheckCircle2 color="#10B981" size={16} />
                          <Text style={styles.optimalStatusText}>100% Present</Text>
                        </View>
                      ) : (
                        <Text style={desig.percentage > 0 ? styles.desigPctText : styles.desigPctZeroText}>
                          {desig.percentage}% Present
                        </Text>
                      )}
                    </View>

                    {/* Stats Sub-Row (Option B) */}
                    <Text style={[styles.desigStatsText, { color: colors.textSecondary }]}>
                      Req: <Text style={[styles.boldWhite, { color: colors.text }]}>{desig.required}</Text>  •  
                      Dep: <Text style={styles.boldCyan}>{deployedCount}</Text>  •  
                      Live: <Text style={liveCount > 0 ? styles.boldGreen : styles.boldRed}>{liveCount}</Text>  •  
                      {desig.shortage === 0 ? (
                        <Text style={styles.boldGreen}>Optimal</Text>
                      ) : (
                        <Text style={styles.boldAmber}>Shortage: -{desig.shortage}</Text>
                      )}
                    </Text>

                    {/* Glowing Progress Bar */}
                    <View style={[styles.desigProgressTrack, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0' }]}>
                      <View
                        style={[
                          styles.desigProgressFill,
                          {
                            width: `${Math.min(100, Math.max(0, desig.percentage))}%`,
                            backgroundColor: isFull ? '#10B981' : (desig.percentage > 0 ? '#00D2FF' : '#EF4444'),
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  navIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  siteHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  siteHeaderSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
  },
  shiftSection: {
    marginBottom: 16,
  },
  shiftSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  shiftTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shiftSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  shiftSwipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shiftSwipeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  shiftTabsScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  shiftTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#0F1A36',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  shiftTabActive: {
    backgroundColor: '#00D2FF',
    borderColor: '#38BDF8',
    shadowColor: '#00D2FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  shiftTabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0A1128',
    marginRight: 6,
  },
  shiftTabText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  shiftTabTextActive: {
    color: '#0A1128',
    fontWeight: '800',
  },
  shiftTimeText: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
  shiftTimeTextActive: {
    color: '#0A1128',
    fontWeight: '600',
  },
  shiftScrollIndicatorContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
  },
  shiftScrollIndicatorTrack: {
    width: 60,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  shiftScrollIndicatorThumb: {
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#00D2FF',
    position: 'absolute',
    top: 0,
  },
  sectionHeaderBox: {
    marginBottom: 12,
  },
  sectionHeaderText: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  kpiGrid: {
    gap: 12,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#0F1A36',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    justifyContent: 'center',
    minHeight: 78,
  },
  kpiCardPresent: {
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  kpiCardDeployed: {
    borderColor: 'rgba(0, 210, 255, 0.3)',
  },
  kpiCardZero: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  kpiLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  kpiValueWhite: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  kpiValueGreen: {
    color: '#22C55E',
    fontSize: 17,
    fontWeight: '800',
  },
  kpiValueRed: {
    color: '#F87171',
    fontSize: 17,
    fontWeight: '800',
  },
  kpiValueCyan: {
    color: '#00D2FF',
    fontSize: 17,
    fontWeight: '800',
  },
  attendanceSubText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
    marginBottom: 2,
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shortagePill: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.5)',
  },
  shortagePillText: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '800',
  },
  optimalPill: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.5)',
  },
  optimalPillText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '800',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00D2FF',
    borderRadius: 3,
  },
  desigCard: {
    backgroundColor: '#0F1A36',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    marginBottom: 12,
  },
  desigCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  desigTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  numberBadge: {
    marginRight: 6,
  },
  numberBadgeText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  desigTitleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  optimalStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  optimalStatusText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '700',
  },
  desigPctText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  desigPctZeroText: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: '700',
  },
  desigStatsText: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 8,
  },
  boldWhite: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  boldCyan: {
    color: '#00D2FF',
    fontWeight: '700',
  },
  boldGreen: {
    color: '#22C55E',
    fontWeight: '700',
  },
  boldAmber: {
    color: '#F59E0B',
    fontWeight: '700',
  },
  boldRed: {
    color: '#F87171',
    fontWeight: '700',
  },
  desigProgressTrack: {
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  desigProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  emptyDesignationCard: {
    backgroundColor: '#0F1A36',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  emptyDesignationText: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  loadingContainer: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 12,
  },
});
