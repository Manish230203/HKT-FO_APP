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
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useAttendance } from '../../context/AttendanceContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { SwipeableBackWrapper } from '../../components/SwipeableBackWrapper';
import { getPunchRecords } from '../../services/db';

export default function AttendanceScreen() {
  const { user, profileImage } = useAuth();
  const { todayRecord, attendanceLogs, monthlyStats: apiMonthlyStats, refreshStatus } = useAttendance();
  const { t } = useLanguage();
  const { colors, isDark } = useTheme();
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

  // Live pulse animation for Active Session card
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  const pulseOpacity = React.useRef(new Animated.Value(0.8)).current;

  // Glowing top-to-bottom scan line animation for active session
  const scanAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (sessionTime !== '00:00:00') {
      const pulseLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 2.4,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, {
              toValue: 0,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0.8,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      );

      const scanLoop = Animated.loop(
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        })
      );

      pulseLoop.start();
      scanLoop.start();
      return () => {
        pulseLoop.stop();
        scanLoop.stop();
      };
    } else {
      pulseAnim.setValue(1);
      pulseOpacity.setValue(0);
      scanAnim.setValue(0);
    }
  }, [sessionTime]);

  // Search & Filter States
  const [searchLogs, setSearchLogs] = useState('');
  const [logFilter, setLogFilter] = useState<'week' | 'month' | 'prev'>('week');
  const [missedFilter, setMissedFilter] = useState<'weekly' | 'monthly' | 'custom'>('weekly');
  const [viewMonthOffset, setViewMonthOffset] = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Generate days array for the active view month
  const daysInViewMonth = useMemo(() => {
    const now = new Date();
    const targetDate = new Date(now.getFullYear(), now.getMonth() + viewMonthOffset, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let d = 1; d <= totalDays; d++) {
      const dateObj = new Date(year, month, d);
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      days.push({
        dateStr,
        dayName,
        dayNum: dd,
        dayNumber: d,
      });
    }
    return {
      year,
      month,
      monthName: targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      days,
    };
  }, [viewMonthOffset]);

  useFocusEffect(
    useCallback(() => {
      refreshStatus();
      fetchLogs();
    }, [])
  );

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const empId = user?.employee_id || (user?.id ? String(user.id) : '') || (user as any)?.username;
      const records = await getPunchRecords(empId);
      setPunchRecords(records || []);
    } catch (e) {
      console.error('Fetch punch records failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [attendanceLogs]);

  // Digital Live Timer calculating elapsed time from Punch In timestamp
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    const nowMs = Date.now();
    const activePunch = punchRecords.find((r) => {
      const isPunchedIn = r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--';
      const punchMs = r.timestamp || 0;
      const isWithin16Hours = (nowMs - punchMs) < 16 * 3600 * 1000;
      return isPunchedIn && isWithin16Hours;
    });

    let checkInMs = Date.now();
    let hasActive = false;

    if (todayRecord) {
      if (todayRecord.check_in && !todayRecord.check_out) {
        hasActive = true;
        checkInMs = new Date(todayRecord.check_in).getTime();
      } else {
        hasActive = false;
      }
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

  // Single Source of Truth for Logs: Merge live server context attendanceLogs with local punchRecords
  const allLogs = useMemo(() => {
    const empIdStr = String(user?.id || '');
    const serverLogs = (attendanceLogs || []).map((l: any, index: number) => {
      let titleDate = l.date || 'Today';
      if (l.date && /^\d{4}-\d{2}-\d{2}/.test(l.date)) {
        const [y, m, d] = l.date.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        titleDate = `${dt.toLocaleDateString('en-US', { weekday: 'long' })}, ${dt.getDate()} ${dt.toLocaleDateString('en-US', { month: 'short' })}`;
      }
      return {
        id: `server_${index}_${l.date}_${l.check_in}`,
        employee_id: empIdStr,
        employeeId: user?.employee_id || empIdStr,
        timestamp: l.check_in ? new Date(l.check_in).getTime() : Date.now(),
        date: l.date,
        dayTitle: titleDate,
        punchInTime: l.check_in ? new Date(l.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
        punchOutTime: l.check_out ? new Date(l.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
        check_in_lat: l.check_in_lat,
        check_in_long: l.check_in_long,
        check_out_lat: l.check_out_lat,
        check_out_long: l.check_out_long,
        siteName: l.site_name || null,
        clientName: 'Client',
        status: l.check_out ? 'PRESENT' : l.check_in ? 'PUNCHED-IN' : 'MISSED',
        officerName: user?.name || 'Officer',
      };
    });

    const merged = [...serverLogs];
    punchRecords.forEach((pr) => {
      const prTime = pr.timestamp || 0;
      const existsInServer = serverLogs.some((sl) => {
        if (sl.date && pr.date && sl.date === pr.date) return true;
        if (sl.timestamp && Math.abs(sl.timestamp - prTime) < 120000) return true;
        return false;
      });
      if (!existsInServer) {
        merged.push(pr);
      }
    });

    return merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [attendanceLogs, punchRecords, user]);

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
    const daysPresentCount = new Set(allLogs.map((r) => r.date)).size;
    const daysAbsentCount = Math.max(0, totalDaysInMonth - daysPresentCount);
    return {
      totalDays: totalDaysInMonth,
      present: daysPresentCount,
      absent: daysAbsentCount,
    };
  }, [allLogs, apiMonthlyStats]);

  const parseRecordDate = (r: any): Date => {
    if (r.timestamp) return new Date(r.timestamp);
    if (!r.date) return new Date();
    if (/^\d{4}-\d{2}-\d{2}/.test(r.date)) {
      const [y, m, d] = r.date.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const dt = new Date(r.date);
    return isNaN(dt.getTime()) ? new Date() : dt;
  };

  // Filtered Dynamic Logs
  const filteredLogs = useMemo(() => {
    let list = allLogs;

    if (logFilter === 'week') {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      list = list.filter((r) => !r.date || parseRecordDate(r) >= oneWeekAgo);
    } else if (logFilter === 'month') {
      const now = new Date();
      const currentY = now.getFullYear();
      const currentM = now.getMonth();
      list = list.filter((r) => {
        if (!r.date) return true;
        const d = parseRecordDate(r);
        return d.getFullYear() === currentY && d.getMonth() === currentM;
      });
    } else if (logFilter === 'prev') {
      if (selectedDate) {
        list = list.filter((r) => r.date === selectedDate);
      } else {
        const targetYear = daysInViewMonth.year;
        const targetMonth = daysInViewMonth.month;
        list = list.filter((r) => {
          if (!r.date) return true;
          const d = parseRecordDate(r);
          return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
        });
      }
    }

    if (searchLogs) {
      const q = searchLogs.toLowerCase();
      list = list.filter(
        (r) =>
          r.dayTitle?.toLowerCase().includes(q) ||
          r.siteName?.toLowerCase().includes(q) ||
          r.punchInTime?.toLowerCase().includes(q) ||
          r.status?.toLowerCase().includes(q) ||
          r.date?.includes(q)
      );
    }

    return list;
  }, [allLogs, searchLogs, logFilter, selectedDate, daysInViewMonth]);

  // Dynamic Missed Punch Logs
  const missedLogs = useMemo(() => {
    let list = allLogs.filter((r) => r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--');

    if (missedFilter === 'weekly') {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      list = list.filter((r) => !r.date || parseRecordDate(r) >= oneWeekAgo);
    } else if (missedFilter === 'monthly') {
      const now = new Date();
      const currentY = now.getFullYear();
      const currentM = now.getMonth();
      list = list.filter((r) => {
        if (!r.date) return true;
        const d = parseRecordDate(r);
        return d.getFullYear() === currentY && d.getMonth() === currentM;
      });
    } else if (missedFilter === 'custom') {
      if (selectedDate) {
        list = list.filter((r) => r.date === selectedDate);
      } else {
        const targetYear = daysInViewMonth.year;
        const targetMonth = daysInViewMonth.month;
        list = list.filter((r) => {
          if (!r.date) return true;
          const d = parseRecordDate(r);
          return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
        });
      }
    }

    return list;
  }, [allLogs, missedFilter, selectedDate, daysInViewMonth]);

  const latestPunch = allLogs.length > 0 ? allLogs[0] : null;

  return (
    <SwipeableBackWrapper>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

        {/* ----------------- SUB-VIEW 1: ATTENDANCE DASHBOARD ----------------- */}
        {activeSubView === 'dashboard' && (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLogs} tintColor="#FFFFFF" />}
          >
            {/* 1. Header Profile Card */}
            <View style={[styles.headerProfileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                <ArrowLeft color={colors.primary} size={20} />
              </TouchableOpacity>

              <View style={[styles.avatarBox, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderColor: colors.primary }]}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.avatarImg} />
                ) : (
                  <User color={colors.textVariant} size={32} />
                )}
              </View>

              <View style={styles.headerTextCol}>
                <Text style={[styles.greetingText, { color: colors.textVariant }]} numberOfLines={1}>Good Afternoon,</Text>
                <View style={styles.nameRow}>
                  <Text style={[styles.userNameText, { color: colors.text }]} numberOfLines={1}>
                    {user?.name || 'PAPPU KUMAR'}
                  </Text>
                  <View style={styles.versionBadge}>
                    <Text style={styles.versionText}>v3.0.4</Text>
                  </View>
                </View>
                <Text style={[styles.empIdText, { color: colors.primary }]}>EMP ID: {user?.employee_id || 'S48453'}</Text>
              </View>
            </View>

            {/* 2. Vibrant Live Session Active Card */}
            <LinearGradient
              colors={['#00599B', '#008BD3']}
              start={{ x: 0, y: 0.2 }}
              end={{ x: 1, y: 0.8 }}
              style={styles.liveSessionCard}
            >
              <View style={styles.cardCirclePattern1} />
              <View style={styles.cardCirclePattern2} />

              {/* Glowing Live Scan Line Running Top to Bottom when Punched In */}
              {sessionTime !== '00:00:00' && (
                <Animated.View
                  style={[
                    styles.scanLine,
                    {
                      transform: [
                        {
                          translateY: scanAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-10, 140],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              )}

              <View style={styles.liveHeaderRow}>
                <View style={styles.pulseDotContainer}>
                  {sessionTime !== '00:00:00' && (
                    <Animated.View
                      style={[
                        styles.pulseRing,
                        {
                          transform: [{ scale: pulseAnim }],
                          opacity: pulseOpacity,
                        },
                      ]}
                    />
                  )}
                  <View style={[styles.liveDot, sessionTime !== '00:00:00' ? styles.liveGreenDot : styles.liveRedDot]} />
                </View>
                <Text style={styles.liveSessionTitle}>
                  {sessionTime !== '00:00:00' ? (t('active_session') || 'LIVE SESSION ACTIVE') : (t('no_active_session') || 'NO ACTIVE SESSION')}
                </Text>
              </View>
              <Text style={styles.liveTimerDigits}>{sessionTime}</Text>
            </LinearGradient>

            {/* 3. Mark Attendance Big Card */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push('/mark-attendance')}
              style={[styles.markAttendanceBigCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.bigFingerprintBox, { backgroundColor: isDark ? '#000000' : '#F1F5F9', borderColor: colors.border }]}>
                <Fingerprint color={colors.primary} size={42} />
              </View>
              <Text style={[styles.markAttendanceTitle, { color: colors.text }]}>MARK ATTENDANCE</Text>
            </TouchableOpacity>

            {/* 4. Monthly Attendance Stats Card */}
            <View style={[styles.standardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardHeaderTitle, { color: colors.primary }]}>
                MONTHLY ATTENDANCE - {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()}
              </Text>

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <View style={[styles.statSquare, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                    <Text style={[styles.statNumberText, { color: '#60A5FA' }]}>
                      {String(monthlyStats.totalDays).padStart(2, '0')}
                    </Text>
                  </View>
                  <Text style={[styles.statLabelText, { color: colors.textVariant }]}>Total Days</Text>
                </View>

                <View style={styles.statBox}>
                  <View style={[styles.statSquare, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                    <Text style={[styles.statNumberText, { color: '#10B981' }]}>
                      {String(monthlyStats.present).padStart(2, '0')}
                    </Text>
                  </View>
                  <Text style={[styles.statLabelText, { color: colors.textVariant }]}>Days Present</Text>
                </View>

                <View style={styles.statBox}>
                  <View style={[styles.statSquare, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                    <Text style={[styles.statNumberText, { color: '#EF4444' }]}>
                      {String(monthlyStats.absent).padStart(2, '0')}
                    </Text>
                  </View>
                  <Text style={[styles.statLabelText, { color: colors.textVariant }]}>Days Absent</Text>
                </View>
              </View>
            </View>

            {/* 5. Recent Activity Card */}
            <View style={[styles.standardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.recentActivityHeader}>
                <Text style={[styles.recentTitleText, { color: colors.primary }]}>RECENT ACTIVITY</Text>
                <TouchableOpacity onPress={() => setActiveSubView('logs')}>
                  <Text style={[styles.viewAllLogsText, { color: colors.primary }]}>VIEW ALL LOGS</Text>
                </TouchableOpacity>
              </View>

              {latestPunch ? (
                <View style={[styles.activityItemBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border }]}>
                  <View style={styles.activityIconSquare}>
                    <LogIn color="#10B981" size={18} />
                  </View>
                  <View style={styles.activityTextCol}>
                    <Text style={[styles.activityMainText, { color: colors.text }]}>
                      {latestPunch.status === 'COMPLETED' || latestPunch.status === 'PRESENT' ? 'Punch Out' : 'Punch In'}
                    </Text>
                    <Text style={[styles.activitySubText, { color: colors.textVariant }]}>
                      {latestPunch.date}, {latestPunch.status === 'COMPLETED' || latestPunch.status === 'PRESENT' ? latestPunch.punchOutTime : latestPunch.punchInTime}
                    </Text>
                  </View>
                  <View style={styles.successBadge}>
                    <Text style={styles.successText}>
                      {latestPunch.status === 'COMPLETED' || latestPunch.status === 'PRESENT' ? 'PRESENT' : 'SUCCESS'}
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
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLogs} tintColor={colors.primary} />}
          >
            {/* Header Bar */}
            <View style={styles.logsHeaderBar}>
              <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                <ArrowLeft color={colors.text} size={22} />
              </TouchableOpacity>
              <View style={styles.logsTitleCol}>
                <Text style={[styles.officerNameText, { color: colors.text }]}>{user?.name || 'PAPPU KUMAR'}</Text>
                <Text style={[styles.officerRoleText, { color: colors.textVariant }]}>{(user?.role || 'OFFICER').toUpperCase()}</Text>
              </View>
            </View>

            {/* Search Input Bar */}
            <View style={[styles.searchBarBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Search color={colors.textVariant} size={18} style={{ marginRight: 10 }} />
              <TextInput
                style={[styles.searchInputText, { color: colors.text }]}
                placeholder="Search logs..."
                placeholderTextColor={colors.textVariant}
                value={searchLogs}
                onChangeText={setSearchLogs}
              />
            </View>

            {/* Time Filter Tabs */}
            <View style={[styles.filterPillsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => {
                  setLogFilter('week');
                  setViewMonthOffset(0);
                  setSelectedDate(null);
                }}
                style={[styles.filterPillBtn, logFilter === 'week' && [styles.filterPillActive, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderColor: colors.primary }]]}
              >
                <Text style={[styles.filterPillText, { color: colors.textVariant }, logFilter === 'week' && { color: colors.primary, fontWeight: '800' }]}>
                  Current Week
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setLogFilter('month');
                  setViewMonthOffset(0);
                  setSelectedDate(null);
                }}
                style={[styles.filterPillBtn, logFilter === 'month' && [styles.filterPillActive, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderColor: colors.primary }]]}
              >
                <Text style={[styles.filterPillText, { color: colors.textVariant }, logFilter === 'month' && { color: colors.primary, fontWeight: '800' }]}>
                  Current Month
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setLogFilter('prev');
                  setViewMonthOffset(-1);
                  setSelectedDate(null);
                }}
                style={[styles.filterPillBtn, logFilter === 'prev' && [styles.filterPillActive, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderColor: colors.primary }]]}
              >
                <Text style={[styles.filterPillText, { color: colors.textVariant }, logFilter === 'prev' && { color: colors.primary, fontWeight: '800' }]}>
                  Previous Month
                </Text>
              </TouchableOpacity>
            </View>

            {/* Dynamic Date Selector Strip - ONLY shown when Previous Month tab is active */}
            {logFilter === 'prev' && (
              <View style={[styles.dateStripCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.monthNavHeader}>
                  <TouchableOpacity
                    onPress={() => {
                      setViewMonthOffset((prev) => prev - 1);
                      setSelectedDate(null);
                    }}
                    style={[styles.navArrowBtn, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}
                  >
                    <ChevronLeft color={colors.textVariant} size={20} />
                  </TouchableOpacity>

                  <Text style={[styles.monthNavTitle, { color: colors.text }]}>{daysInViewMonth.monthName.toUpperCase()}</Text>

                  <TouchableOpacity
                    onPress={() => {
                      setViewMonthOffset((prev) => Math.min(0, prev + 1));
                      setSelectedDate(null);
                    }}
                    style={[styles.navArrowBtn, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}
                  >
                    <ChevronRight color={colors.textVariant} size={20} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dateStripScroll}
                >
                  {daysInViewMonth.days.map((item) => {
                    const isSelected = selectedDate === item.dateStr;
                    const hasRecord = punchRecords.some((r) => r.date === item.dateStr);

                    return (
                      <TouchableOpacity
                        key={item.dateStr}
                        activeOpacity={0.8}
                        onPress={() => setSelectedDate(isSelected ? null : item.dateStr)}
                        style={[
                          styles.dayPillBtn,
                          { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' },
                          isSelected && styles.dayPillActive,
                          hasRecord && !isSelected && {
                            borderColor: 'rgba(59, 130, 246, 0.4)',
                            backgroundColor: isDark ? '#1A2438' : '#DBEAFE',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayNameLabel,
                            { color: colors.textVariant },
                            isSelected && styles.dayNameActive,
                            hasRecord && !isSelected && { color: isDark ? '#94A3B8' : '#1E40AF' },
                          ]}
                        >
                          {item.dayName}
                        </Text>
                        <Text
                          style={[
                            styles.dayNumDigits,
                            { color: colors.text },
                            isSelected && styles.dayNumActive,
                            hasRecord && !isSelected && { color: isDark ? '#FFFFFF' : '#1E3A8A' },
                          ]}
                        >
                          {item.dayNum}
                        </Text>
                        {hasRecord && (
                          <View
                            style={[
                              styles.recordIndicatorDot,
                              isSelected && { backgroundColor: '#FFFFFF' },
                              !isSelected && { backgroundColor: isDark ? '#3B82F6' : '#2563EB' },
                            ]}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {selectedDate && (
                  <View style={styles.selectedDateBanner}>
                    <Text style={[styles.selectedDateText, { color: colors.textVariant }]}>
                      Filtered by date: <Text style={{ color: colors.primary, fontWeight: '800' }}>{selectedDate}</Text>
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedDate(null)}>
                      <Text style={styles.clearFilterText}>Clear Filter</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Dynamic Log Cards List */}
            {filteredLogs.length === 0 ? (
              <View style={styles.emptyLogBox}>
                <Clock color={colors.textVariant} size={32} />
                <Text style={[styles.emptyLogText, { color: colors.textVariant }]}>No attendance logs found.</Text>
              </View>
            ) : (
              filteredLogs.map((log) => {
                const isPresent = log.status === 'COMPLETED' || log.status === 'PRESENT';
                const statusColor = isPresent ? '#10B981' : (isDark ? '#F59E0B' : '#D97706');
                const badgeBg = isPresent
                  ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5')
                  : (isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7');
                const badgeBorder = isPresent
                  ? (isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.4)')
                  : (isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.4)');

                return (
                  <View
                    key={log.id || log.date}
                    style={[
                      styles.logCardItem,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        borderLeftColor: isPresent ? '#10B981' : '#F59E0B',
                      },
                    ]}
                  >
                    <View style={styles.logHeaderRow}>
                      <Text style={[styles.logDateTitle, { color: colors.primary }]}>{log.dayTitle || log.date}</Text>
                      <View
                        style={[
                          styles.punchedInBadge,
                          {
                            backgroundColor: badgeBg,
                            borderColor: badgeBorder,
                          },
                        ]}
                      >
                        <Clock
                          color={statusColor}
                          size={14}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={[styles.punchedInText, { color: statusColor }]}>
                          {isPresent ? 'PRESENT' : 'PUNCHED-IN'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.punchDetailsRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldSubLabel, { color: colors.textVariant }]}>PUNCH IN</Text>
                        <Text style={[styles.timeValText, { color: colors.text }]}>{log.punchInTime || '11:00'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldSubLabel, { color: colors.textVariant }]}>PUNCH OUT</Text>
                        <Text style={[styles.timeValText, { color: colors.text }]}>{log.punchOutTime || '--:--'}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {/* ----------------- SUB-VIEW 3: MISSED PUNCHES ----------------- */}
        {activeSubView === 'missed' && (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLogs} tintColor={colors.primary} />}
          >
            {/* Header Bar */}
            <View style={styles.logsHeaderBar}>
              <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                <ArrowLeft color={colors.text} size={22} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[styles.missedTitleText, { color: colors.primary }]}>Missed Punches</Text>
                <Text style={[styles.missedSubText, { color: colors.textVariant }]}>ATTENDANCE RECTIFICATION CENTER</Text>
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
            <View style={[styles.rangeFilterContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => {
                  setMissedFilter('weekly');
                  setViewMonthOffset(0);
                  setSelectedDate(null);
                }}
                style={[styles.rangePillBtn, missedFilter === 'weekly' && [styles.rangePillActive, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderColor: colors.primary }]]}
              >
                <Text style={[styles.rangePillText, { color: colors.textVariant }, missedFilter === 'weekly' && { color: colors.primary, fontWeight: '800' }]}>
                  WEEKLY
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setMissedFilter('monthly');
                  setViewMonthOffset(0);
                  setSelectedDate(null);
                }}
                style={[styles.rangePillBtn, missedFilter === 'monthly' && [styles.rangePillActive, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderColor: colors.primary }]]}
              >
                <Text style={[styles.rangePillText, { color: colors.textVariant }, missedFilter === 'monthly' && { color: colors.primary, fontWeight: '800' }]}>
                  MONTHLY
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setMissedFilter('custom');
                  setViewMonthOffset(-1);
                  setSelectedDate(null);
                }}
                style={[styles.rangePillBtn, missedFilter === 'custom' && [styles.rangePillActive, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderColor: colors.primary }]]}
              >
                <Text style={[styles.rangePillText, { color: colors.textVariant }, missedFilter === 'custom' && { color: colors.primary, fontWeight: '800' }]}>
                  CUSTOM RANGE
                </Text>
              </TouchableOpacity>
            </View>

            {/* Dynamic Date Selector Strip - ONLY shown when CUSTOM RANGE / PREVIOUS MONTH tab is active */}
            {missedFilter === 'custom' && (
              <View style={[styles.dateStripCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.monthNavHeader}>
                  <TouchableOpacity
                    onPress={() => {
                      setViewMonthOffset((prev) => prev - 1);
                      setSelectedDate(null);
                    }}
                    style={[styles.navArrowBtn, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}
                  >
                    <ChevronLeft color={colors.textVariant} size={20} />
                  </TouchableOpacity>

                  <Text style={[styles.monthNavTitle, { color: colors.text }]}>{daysInViewMonth.monthName.toUpperCase()}</Text>

                  <TouchableOpacity
                    onPress={() => {
                      setViewMonthOffset((prev) => Math.min(0, prev + 1));
                      setSelectedDate(null);
                    }}
                    style={[styles.navArrowBtn, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}
                  >
                    <ChevronRight color={colors.textVariant} size={20} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dateStripScroll}
                >
                  {daysInViewMonth.days.map((item) => {
                    const isSelected = selectedDate === item.dateStr;
                    const hasRecord = punchRecords.some(
                      (r) => (r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--') && r.date === item.dateStr
                    );

                    return (
                      <TouchableOpacity
                        key={item.dateStr}
                        activeOpacity={0.8}
                        onPress={() => setSelectedDate(isSelected ? null : item.dateStr)}
                        style={[
                          styles.dayPillBtn,
                          { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' },
                          isSelected && styles.dayPillActive,
                          hasRecord && !isSelected && {
                            borderColor: 'rgba(59, 130, 246, 0.4)',
                            backgroundColor: isDark ? '#1A2438' : '#DBEAFE',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayNameLabel,
                            { color: colors.textVariant },
                            isSelected && styles.dayNameActive,
                            hasRecord && !isSelected && { color: isDark ? '#94A3B8' : '#1E40AF' },
                          ]}
                        >
                          {item.dayName}
                        </Text>
                        <Text
                          style={[
                            styles.dayNumDigits,
                            { color: colors.text },
                            isSelected && styles.dayNumActive,
                            hasRecord && !isSelected && { color: isDark ? '#FFFFFF' : '#1E3A8A' },
                          ]}
                        >
                          {item.dayNum}
                        </Text>
                        {hasRecord && (
                          <View
                            style={[
                              styles.recordIndicatorDot,
                              isSelected && { backgroundColor: '#FFFFFF' },
                              !isSelected && { backgroundColor: isDark ? '#3B82F6' : '#2563EB' },
                            ]}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {selectedDate && (
                  <View style={styles.selectedDateBanner}>
                    <Text style={[styles.selectedDateText, { color: colors.textVariant }]}>
                      Filtered by date: <Text style={{ color: colors.primary, fontWeight: '800' }}>{selectedDate}</Text>
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedDate(null)}>
                      <Text style={styles.clearFilterText}>Clear Filter</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Dynamic Missed Punch Record Cards */}
            {missedLogs.length === 0 ? (
              <View style={styles.emptyLogBox}>
                <CheckCircle2 color="#10B981" size={32} />
                <Text style={[styles.emptyLogText, { color: colors.textVariant }]}>No pending missed punches found.</Text>
              </View>
            ) : (
              missedLogs.map((log) => (
                <View key={log.id || log.date} style={[styles.standardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.missedCardRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.missedDateTitle, { color: colors.textVariant }]}>{log.dayTitle || log.date}</Text>
                      <View style={styles.onTimeStatusRow}>
                        <View style={styles.redDotSmall} />
                        <Text style={styles.onTimeText}>Missed Punch Out</Text>
                      </View>
                    </View>

                    <View style={{ alignItems: 'center', paddingHorizontal: 12 }}>
                      <Text style={[styles.fieldSubLabel, { color: colors.textVariant }]}>CLOCK IN</Text>
                      <Text style={[styles.timeValText, { color: colors.primary }]}>{log.punchInTime}</Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.fieldSubLabel, { color: colors.textVariant }]}>CLOCK OUT</Text>
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

  /* LIVE SESSION CARD - MATCHING USER SCREENSHOT EXACTLY */
  liveSessionCard: {
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 24,
    marginBottom: 16,
    alignItems: 'flex-start',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 2.5,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 8,
    opacity: 0.85,
    elevation: 8,
    zIndex: 10,
  },
  cardCirclePattern1: {
    position: 'absolute',
    right: -25,
    top: -25,
    width: 165,
    height: 165,
    borderRadius: 82.5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardCirclePattern2: {
    position: 'absolute',
    right: 40,
    bottom: -45,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  liveHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  pulseDotContainer: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34D399',
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  liveGreenDot: {
    backgroundColor: '#34D399',
  },
  liveRedDot: {
    backgroundColor: '#FFFFFF',
    opacity: 0.9,
  },
  liveSessionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  liveTimerDigits: {
    color: '#FFFFFF',
    fontSize: 54,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 2,
    textAlign: 'left',
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
    width: 88,
    height: 88,
    borderRadius: 28,
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

  /* DYNAMIC DATE SELECTOR STRIP STYLES */
  dateStripCard: {
    backgroundColor: '#131C33',
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  monthNavHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  navArrowBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#1E293B',
  },
  monthNavTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  dateStripScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  dayPillBtn: {
    width: 58,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayPillActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#60A5FA',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  dayPillHasRecord: {
    borderColor: 'rgba(59, 130, 246, 0.4)',
    backgroundColor: '#1A2438',
  },
  dayNameLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  dayNameActive: {
    color: '#E0F2FE',
  },
  dayNumDigits: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  dayNumActive: {
    color: '#FFFFFF',
  },
  recordIndicatorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#3B82F6',
    marginTop: 4,
  },
  selectedDateBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  selectedDateText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  clearFilterText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '700',
  },
});
