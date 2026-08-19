import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  ArrowLeft,
  Search,
  Fingerprint,
  Clock,
  CheckCircle2,
  AlertTriangle,
  LogIn,
  LogOut,
  User,
  Building,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useAttendance } from '../../context/AttendanceContext';
import { useLanguage } from '../../context/LanguageContext';
import { SwipeableBackWrapper } from '../../components/SwipeableBackWrapper';
import { getPunchRecords } from '../../services/db';

export default function AttendanceScreen() {
  const { user, profileImage } = useAuth();
  const { todayRecord, attendanceLogs, monthlyStats: apiMonthlyStats, refreshStatus } = useAttendance();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams();

  // Active Tab View: 'dashboard' | 'logs' | 'missed'
  const [activeSubView, setActiveSubView] = useState<'dashboard' | 'logs' | 'missed'>(
    (params.view as any) || 'dashboard'
  );

  // Dynamic States
  const [sessionTime, setSessionTime] = useState('00:00:00');
  const [loading, setLoading] = useState(false);
  const [punchRecords, setPunchRecords] = useState<any[]>([]);

  // Search & Filter States
  const [searchLogs, setSearchLogs] = useState('');
  const [logFilter, setLogFilter] = useState<'week' | 'month' | 'prev'>('week');
  const [missedFilter, setMissedFilter] = useState<'weekly' | 'monthly' | 'custom'>('weekly');

  useFocusEffect(
    useCallback(() => {
      refreshStatus();
      fetchLogs();
    }, [])
  );

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const empId = user?.employee_id || user?.id || user?.username;
      const records = await getPunchRecords(empId);
      setPunchRecords(records || []);
    } catch (e) {
      console.error('Fetch punch records failed', e);
    } finally {
      setLoading(false);
    }
  };

  // Digital Live Timer calculating elapsed time from Punch In timestamp
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const activePunch = punchRecords.find((r) => r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--');

    let checkInMs = Date.now();
    let hasActive = false;

    if (todayRecord && todayRecord.check_in && !todayRecord.check_out) {
      hasActive = true;
      checkInMs = new Date(todayRecord.check_in).getTime();
    } else if (activePunch) {
      hasActive = true;
      checkInMs = activePunch.timestamp || Date.now();
    }

    if (hasActive) {
      timer = setInterval(() => {
        const diff = Math.max(0, Math.floor((Date.now() - checkInMs) / 1000));
        const hrs = String(Math.floor(diff / 3600)).padStart(2, '0');
        const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const secs = String(diff % 60).padStart(2, '0');
        setSessionTime(`${hrs}:${mins}:${secs}`);
      }, 1000);
    } else {
      setSessionTime('00:00:00');
    }

    return () => clearInterval(timer);
  }, [punchRecords, todayRecord]);

  // Sync view from route parameters
  useEffect(() => {
    if (params.view && typeof params.view === 'string') {
      setActiveSubView(params.view as any);
    }
  }, [params.view]);

  // Compute Dynamic Monthly Stats
  const monthlyStats = useMemo(() => {
    if (apiMonthlyStats) {
      return {
        totalDays: parseInt(apiMonthlyStats.totalDays || '30'),
        present: parseInt(apiMonthlyStats.presentDays || '0'),
        absent: parseInt(apiMonthlyStats.absentDays || '0'),
      };
    }
    const totalDaysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const daysPresentCount = new Set(punchRecords.map((r) => r.date)).size;
    const daysAbsentCount = Math.max(0, totalDaysInMonth - daysPresentCount);
    return {
      totalDays: totalDaysInMonth,
      present: daysPresentCount,
      absent: daysAbsentCount,
    };
  }, [punchRecords, apiMonthlyStats]);

  // Filtered Dynamic Logs
  const filteredLogs = useMemo(() => {
    let list = punchRecords;
    if (searchLogs) {
      const q = searchLogs.toLowerCase();
      list = list.filter(
        (r) =>
          r.dayTitle?.toLowerCase().includes(q) ||
          r.siteName?.toLowerCase().includes(q) ||
          r.punchInTime?.toLowerCase().includes(q) ||
          r.status?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [punchRecords, searchLogs]);

  // Dynamic Missed Punch Logs
  const missedLogs = useMemo(() => {
    return punchRecords.filter((r) => r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--');
  }, [punchRecords]);

  const latestPunch = punchRecords.length > 0 ? punchRecords[0] : null;

  return (
    <SwipeableBackWrapper>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0A1128" />

        {/* ----------------- SUB-VIEW 1: ATTENDANCE DASHBOARD ----------------- */}
        {activeSubView === 'dashboard' && (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLogs} tintColor="#FFFFFF" />}
          >
            {/* 1. Header Profile Card */}
            <View style={styles.headerProfileCard}>
              <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                <ArrowLeft color="#FFFFFF" size={20} />
              </TouchableOpacity>

              <View style={styles.avatarBox}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.avatarImg} />
                ) : (
                  <User color="#FFFFFF" size={32} />
                )}
              </View>

              <View style={styles.headerTextCol}>
                <Text style={styles.greetingText} numberOfLines={1}>Good Afternoon,</Text>
                <View style={styles.nameRow}>
                  <Text style={styles.userNameText} numberOfLines={1}>
                    {user?.name || 'PAPPU KUMAR'}
                  </Text>
                  <View style={styles.versionBadge}>
                    <Text style={styles.versionText}>v3.0.4</Text>
                  </View>
                </View>
                <Text style={styles.empIdText}>EMP ID: {user?.employee_id || 'S48453'}</Text>
              </View>
            </View>

            {/* 2. Vibrant Live Session Active Card */}
            <View style={styles.liveSessionCard}>
              <View style={styles.liveHeaderRow}>
                <View style={[styles.liveDot, sessionTime !== '00:00:00' ? styles.liveGreenDot : styles.liveRedDot]} />
                <Text style={styles.liveSessionTitle}>
                  {sessionTime !== '00:00:00' ? 'LIVE SESSION ACTIVE' : 'NO ACTIVE SESSION'}
                </Text>
              </View>
              <Text style={styles.liveTimerDigits}>{sessionTime}</Text>
            </View>

            {/* 3. Mark Attendance Big Card */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push('/mark-attendance')}
              style={styles.markAttendanceBigCard}
            >
              <View style={styles.bigFingerprintBox}>
                <Fingerprint color="#3B82F6" size={42} />
              </View>
              <Text style={styles.markAttendanceTitle}>MARK ATTENDANCE</Text>
            </TouchableOpacity>

            {/* 4. Monthly Attendance Stats Card */}
            <View style={styles.standardCard}>
              <Text style={styles.cardHeaderTitle}>
                MONTHLY ATTENDANCE - {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()}
              </Text>

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <View style={styles.statSquare}>
                    <Text style={[styles.statNumberText, { color: '#60A5FA' }]}>
                      {String(monthlyStats.totalDays).padStart(2, '0')}
                    </Text>
                  </View>
                  <Text style={styles.statLabelText}>Total Days</Text>
                </View>

                <View style={styles.statBox}>
                  <View style={styles.statSquare}>
                    <Text style={[styles.statNumberText, { color: '#10B981' }]}>
                      {String(monthlyStats.present).padStart(2, '0')}
                    </Text>
                  </View>
                  <Text style={styles.statLabelText}>Days Present</Text>
                </View>

                <View style={styles.statBox}>
                  <View style={styles.statSquare}>
                    <Text style={[styles.statNumberText, { color: '#EF4444' }]}>
                      {String(monthlyStats.absent).padStart(2, '0')}
                    </Text>
                  </View>
                  <Text style={styles.statLabelText}>Days Absent</Text>
                </View>
              </View>
            </View>

            {/* 5. Recent Activity Card */}
            <View style={styles.standardCard}>
              <View style={styles.recentActivityHeader}>
                <Text style={styles.recentTitleText}>RECENT ACTIVITY</Text>
                <TouchableOpacity onPress={() => setActiveSubView('logs')}>
                  <Text style={styles.viewAllLogsText}>VIEW ALL LOGS</Text>
                </TouchableOpacity>
              </View>

              {latestPunch ? (
                <View style={styles.activityItemBox}>
                  <View style={styles.activityIconSquare}>
                    <LogIn color="#10B981" size={18} />
                  </View>
                  <View style={styles.activityTextCol}>
                    <Text style={styles.activityMainText}>
                      {latestPunch.status === 'COMPLETED' ? 'Punch Out' : 'Punch In'}
                    </Text>
                    <Text style={styles.activitySubText}>
                      {latestPunch.date}, {latestPunch.status === 'COMPLETED' ? latestPunch.punchOutTime : latestPunch.punchInTime}
                    </Text>
                  </View>
                  <View style={styles.successBadge}>
                    <Text style={styles.successText}>
                      {latestPunch.status === 'COMPLETED' ? 'COMPLETED' : 'SUCCESS'}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.noActivityText}>No recent attendance activity recorded.</Text>
              )}
            </View>
          </ScrollView>
        )}

        {/* ----------------- SUB-VIEW 2: ATTENDANCE LOG ----------------- */}
        {activeSubView === 'logs' && (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLogs} tintColor="#FFFFFF" />}
          >
            {/* Header Bar */}
            <View style={styles.logsHeaderBar}>
              <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                <ArrowLeft color="#FFFFFF" size={22} />
              </TouchableOpacity>
              <View style={styles.logsTitleCol}>
                <Text style={styles.officerNameText}>{user?.name || 'PAPPU KUMAR'}</Text>
                <Text style={styles.officerRoleText}>{(user?.role || 'FIELD OFFICER').toUpperCase()}</Text>
                <View style={styles.clientPill}>
                  <Text style={styles.clientPillText}>CLIENT: TATA POWER</Text>
                </View>
              </View>
            </View>

            {/* Search Input Bar */}
            <View style={styles.searchBarBox}>
              <Search color="#64748B" size={18} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.searchInputText}
                placeholder="Search logs..."
                placeholderTextColor="#64748B"
                value={searchLogs}
                onChangeText={setSearchLogs}
              />
            </View>

            {/* Time Filter Tabs */}
            <View style={styles.filterPillsContainer}>
              <TouchableOpacity
                onPress={() => setLogFilter('week')}
                style={[styles.filterPillBtn, logFilter === 'week' && styles.filterPillActive]}
              >
                <Text style={[styles.filterPillText, logFilter === 'week' && styles.filterPillTextActive]}>
                  Current Week
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setLogFilter('month')}
                style={[styles.filterPillBtn, logFilter === 'month' && styles.filterPillActive]}
              >
                <Text style={[styles.filterPillText, logFilter === 'month' && styles.filterPillTextActive]}>
                  Current Month
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setLogFilter('prev')}
                style={[styles.filterPillBtn, logFilter === 'prev' && styles.filterPillActive]}
              >
                <Text style={[styles.filterPillText, logFilter === 'prev' && styles.filterPillTextActive]}>
                  Previous Month
                </Text>
              </TouchableOpacity>
            </View>

            {/* Dynamic Log Cards List */}
            {filteredLogs.length === 0 ? (
              <View style={styles.emptyLogBox}>
                <Clock color="#64748B" size={32} />
                <Text style={styles.emptyLogText}>No attendance logs found.</Text>
              </View>
            ) : (
              filteredLogs.map((log) => (
                <View key={log.id || log.date} style={styles.logCardItem}>
                  <View style={styles.logHeaderRow}>
                    <Text style={styles.logDateTitle}>{log.dayTitle || log.date}</Text>
                    <View
                      style={[
                        styles.punchedInBadge,
                        log.status === 'COMPLETED' && {
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          borderColor: 'rgba(16, 185, 129, 0.3)',
                        },
                      ]}
                    >
                      <Clock
                        color={log.status === 'COMPLETED' ? '#10B981' : '#F59E0B'}
                        size={14}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.punchedInText,
                          log.status === 'COMPLETED' && { color: '#10B981' },
                        ]}
                      >
                        {log.status === 'COMPLETED' ? 'COMPLETED' : 'PUNCHED-IN'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.punchDetailsRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldSubLabel}>PUNCH IN</Text>
                      <Text style={styles.timeValText}>{log.punchInTime || '11:00'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldSubLabel}>PUNCH OUT</Text>
                      <Text style={styles.timeValText}>{log.punchOutTime || '--:--'}</Text>
                    </View>
                  </View>

                  <Text style={[styles.fieldSubLabel, { marginTop: 10 }]}>SITE</Text>
                  <Text style={styles.siteValText}>{log.siteName || 'Humankind Technology'}</Text>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* ----------------- SUB-VIEW 3: MISSED PUNCHES ----------------- */}
        {activeSubView === 'missed' && (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLogs} tintColor="#FFFFFF" />}
          >
            {/* Header Bar */}
            <View style={styles.logsHeaderBar}>
              <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                <ArrowLeft color="#FFFFFF" size={22} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.missedTitleText}>Missed Punches</Text>
                <Text style={styles.missedSubText}>ATTENDANCE RECTIFICATION CENTER</Text>
              </View>
            </View>

            {/* Warning Banner Card */}
            <View style={styles.warningBannerCard}>
              <AlertTriangle color="#EF4444" size={22} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.warningBannerTitle}>
                  Missed punch-out will mark you <Text style={{ color: '#EF4444', fontWeight: '800' }}>ABSENT.</Text>
                </Text>
                <Text style={styles.warningBannerSub}>Submit a regularization request.</Text>
              </View>
            </View>

            {/* Range Filter Tabs */}
            <View style={styles.rangeFilterContainer}>
              <TouchableOpacity
                onPress={() => setMissedFilter('weekly')}
                style={[styles.rangePillBtn, missedFilter === 'weekly' && styles.rangePillActive]}
              >
                <Text style={[styles.rangePillText, missedFilter === 'weekly' && styles.rangePillTextActive]}>
                  WEEKLY
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setMissedFilter('monthly')}
                style={[styles.rangePillBtn, missedFilter === 'monthly' && styles.rangePillActive]}
              >
                <Text style={[styles.rangePillText, missedFilter === 'monthly' && styles.rangePillTextActive]}>
                  MONTHLY
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setMissedFilter('custom')}
                style={[styles.rangePillBtn, missedFilter === 'custom' && styles.rangePillActive]}
              >
                <Text style={[styles.rangePillText, missedFilter === 'custom' && styles.rangePillTextActive]}>
                  CUSTOM RANGE
                </Text>
              </TouchableOpacity>
            </View>

            {/* Dynamic Missed Punch Record Cards */}
            {missedLogs.length === 0 ? (
              <View style={styles.emptyLogBox}>
                <CheckCircle2 color="#10B981" size={32} />
                <Text style={styles.emptyLogText}>No pending missed punches found.</Text>
              </View>
            ) : (
              missedLogs.map((log) => (
                <View key={log.id || log.date} style={styles.standardCard}>
                  <View style={styles.missedCardRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.missedDateTitle}>{log.dayTitle || log.date}</Text>
                      <View style={styles.onTimeStatusRow}>
                        <View style={styles.redDotSmall} />
                        <Text style={styles.onTimeText}>Missed Punch Out</Text>
                      </View>
                    </View>

                    <View style={{ alignItems: 'center', paddingHorizontal: 12 }}>
                      <Text style={styles.fieldSubLabel}>CLOCK IN</Text>
                      <Text style={[styles.timeValText, { color: '#3B82F6' }]}>{log.punchInTime}</Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.fieldSubLabel}>CLOCK OUT</Text>
                      <Text style={[styles.timeValText, { color: '#EF4444' }]}>N/A</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </SwipeableBackWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1128',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  /* HEADER PROFILE CARD */
  headerProfileCard: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    padding: 4,
    marginRight: 10,
  },
  avatarBox: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#3B82F6',
    marginRight: 12,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  headerTextCol: {
    flex: 1,
  },
  greetingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  versionBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  versionText: {
    fontSize: 10,
    color: '#3B82F6',
    fontWeight: '700',
  },
  empIdText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 2,
  },

  /* LIVE SESSION CARD */
  liveSessionCard: {
    backgroundColor: '#0284C7',
    borderRadius: 24,
    padding: 22,
    marginBottom: 16,
  },
  liveHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  liveGreenDot: {
    backgroundColor: '#10B981',
  },
  liveRedDot: {
    backgroundColor: '#EF4444',
  },
  liveSessionTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  liveTimerDigits: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: '800',
    marginTop: 8,
    letterSpacing: 1,
  },

  /* MARK ATTENDANCE BIG CARD */
  markAttendanceBigCard: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  bigFingerprintBox: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  markAttendanceTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.8,
  },

  /* STANDARD CARD DESIGN */
  standardCard: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statBox: {
    alignItems: 'center',
  },
  statSquare: {
    width: 64,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statNumberText: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },

  /* RECENT ACTIVITY */
  recentActivityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  recentTitleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.8,
  },
  viewAllLogsText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#10B981',
  },
  activityItemBox: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityIconSquare: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityTextCol: {
    flex: 1,
  },
  activityMainText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  activitySubText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  noActivityText: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 10,
  },
  successBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  successText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '800',
  },

  /* ATTENDANCE LOG */
  logsHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  logsTitleCol: {
    flex: 1,
  },
  officerNameText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  officerRoleText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
  },
  clientPill: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  clientPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#3B82F6',
  },
  searchBarBox: {
    backgroundColor: '#131C33',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  searchInputText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  filterPillsContainer: {
    flexDirection: 'row',
    backgroundColor: '#131C33',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  filterPillBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  filterPillActive: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#3B82F6',
  },
  emptyLogBox: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyLogText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },

  /* LOG CARD ITEM WITH ORANGE ACCENT BAR */
  logCardItem: {
    backgroundColor: '#131C33',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  logHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  logDateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3B82F6',
  },
  punchedInBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  punchedInText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F59E0B',
  },
  punchDetailsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  fieldSubLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  timeValText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  siteValText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3B82F6',
    marginTop: 2,
  },

  /* MISSED PUNCHES */
  missedTitleText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#3B82F6',
  },
  missedSubText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  warningBannerCard: {
    backgroundColor: '#2A1215',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#7F1D1D',
  },
  warningBannerTitle: {
    fontSize: 13,
    color: '#FCA5A5',
    fontWeight: '700',
  },
  warningBannerSub: {
    fontSize: 11,
    color: '#F87171',
    marginTop: 2,
  },
  rangeFilterContainer: {
    flexDirection: 'row',
    backgroundColor: '#131C33',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rangePillBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  rangePillActive: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  rangePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  rangePillTextActive: {
    color: '#3B82F6',
  },
  missedCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  missedDateTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  onTimeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  redDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
    marginRight: 6,
  },
  onTimeText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#EF4444',
  },
});
