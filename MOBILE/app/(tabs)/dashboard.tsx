import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Platform,
  StatusBar,
  Image,
  Modal,
  FlatList,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Search,
  Fingerprint,
  LayoutGrid,
  CheckCircle2,
  Clock,
  PlusCircle,
  User,
  Settings,
  ChevronDown,
  X,
  Building,
  Calendar,
  Building2,
  UserPlus,
  ClipboardCheck,
  Sun,
  Moon,
  BookOpen,
  ChevronRight,
  Shield,
  Power,
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../../context/AuthContext';
import { useAttendance } from '../../context/AttendanceContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { getPlannedVisits, createPlannedVisit, getSites, getClients, Site, Client, PlannedVisit, isVisitDateRangeExpired } from '../../services/siteService';
import { getPunchRecords } from '../../services/db';
import { getDayVisitReports, getNightVisitReports, getGeneralVisits } from '../../services/visitService';
import { getConsentSetting } from '../../services/db';
import { fuzzyFilter } from '../../utils/fuzzySearch';

export default function DashboardScreen() {
  const { user, profileImage } = useAuth();
  const { todayRecord, attendanceLogs, profileData, refreshStatus } = useAttendance();
  const { t } = useLanguage();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const router = useRouter();

  const [greeting, setGreeting] = useState('Good Afternoon');
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Check if officer has a registered profile photo
  const hasProfilePhoto = Boolean(
    profileImage ||
    (profileData && profileData.profile_photo) ||
    (user && (user as any).profile_photo)
  );

  const checkDutyAccess = (actionName: string = 'access this feature'): boolean => {
    if (!hasProfilePhoto) {
      Alert.alert(
        'Profile Photo Required',
        `Please upload your profile photo first in Settings before ${actionName}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upload Photo', onPress: () => router.push('/settings') }
        ]
      );
      return false;
    }

    if (!isCheckedIn) {
      Alert.alert(
        'Active Status Required',
        `You are currently INACTIVE. Please activate your session before ${actionName}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Activate', onPress: () => router.push('/mark-attendance') }
        ]
      );
      return false;
    }

    return true;
  };

  const handleDutyCardPress = () => {
    if (!isCheckedIn) {
      if (!hasProfilePhoto) {
        Alert.alert(
          'Profile Photo Required',
          'Please upload your profile photo first in Settings before activating.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upload Photo', onPress: () => router.push('/settings') }
          ]
        );
        return;
      }
      router.push('/mark-attendance');
    } else {
      router.push('/mark-attendance');
    }
  };

  useEffect(() => {
    (async () => {
      const consentAccepted = await getConsentSetting();
      if (!consentAccepted) {
        router.replace('/consent');
      }
    })();
  }, []);

  const getCompanyLogo = () => {
    const compId = user?.company_id || (profileData as any)?.company_id;
    const compName = (user?.company_name || (profileData as any)?.company_name || '').toLowerCase();

    const isEagle = 
      compId === 4 || 
      Number(compId) === 4 ||
      compName.includes('eagle') || 
      compName.includes('eispl');

    if (isEagle) {
      return require('../../assets/images/eagle_logo.png');
    }
    return require('../../assets/images/udf_logo.png');
  };

  // Sites State
  const [sites, setSites] = useState<Site[]>([]);
  const [modalSites, setModalSites] = useState<Site[]>([]);
  const [baseSiteName, setBaseSiteName] = useState('Main Base HQ');

  // Session timer state
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [sessionTime, setSessionTime] = useState('00:00:00');
  const [sessionStart, setSessionStart] = useState<Date | null>(null);

  // Live pulse animation for Active Session card
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  const pulseOpacity = React.useRef(new Animated.Value(0.8)).current;

  // Glowing top-to-bottom scan line animation for active session
  const scanAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isCheckedIn) {
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
  }, [isCheckedIn]);

  // Visit Planning Modal State & Tab: 0 = Existing Client, 1 = New Client
  const [planVisitModalVisible, setPlanVisitModalVisible] = useState(false);
  const [activeVisitTab, setActiveVisitTab] = useState<0 | 1>(0);
  const [clients, setClients] = useState<Client[]>([]);
  const [newClientId, setNewClientId] = useState('');
  const [newSiteId, setNewSiteId] = useState('');
  const [customClientName, setCustomClientName] = useState('');
  const [customSiteName, setCustomSiteName] = useState('');
  const [newPlanningType, setNewPlanningType] = useState('SINGLE');
  const [newVisitFrequency, setNewVisitFrequency] = useState('1');
  const [newVisitDate, setNewVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [newEndDate, setNewEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0];
  });
  const [creatingVisit, setCreatingVisit] = useState(false);

  // Date Picker State
  const [activeDatePicker, setActiveDatePicker] = useState<'visit' | 'start' | 'end' | null>(null);

  const parseDateString = (str: string): Date => {
    if (!str) return new Date();
    const parts = str.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(year, month, day);
      }
    }
    return new Date();
  };

  const formatDateString = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleDatePickerChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      const currentTarget = activeDatePicker;
      setActiveDatePicker(null);
      if (event.type === 'set' && selectedDate) {
        const formatted = formatDateString(selectedDate);
        if (currentTarget === 'visit') setNewVisitDate(formatted);
        else if (currentTarget === 'start') setNewStartDate(formatted);
        else if (currentTarget === 'end') setNewEndDate(formatted);
      }
    } else {
      // iOS
      if (selectedDate) {
        const formatted = formatDateString(selectedDate);
        if (activeDatePicker === 'visit') setNewVisitDate(formatted);
        else if (activeDatePicker === 'start') setNewStartDate(formatted);
        else if (activeDatePicker === 'end') setNewEndDate(formatted);
      }
    }
  };

  // Sub-modal Pickers
  const [pickerClientVisible, setPickerClientVisible] = useState(false);
  const [pickerSiteVisible, setPickerSiteVisible] = useState(false);
  const [modalClientSearch, setModalClientSearch] = useState('');
  const [modalSiteSearch, setModalSiteSearch] = useState('');

  const filteredModalClients = useMemo(() => {
    return fuzzyFilter(clients, modalClientSearch, (c) => c.name || '');
  }, [clients, modalClientSearch]);

  const filteredModalSites = modalSites.filter((s) => {
    const matchesClient = newClientId ? String(s.client_id) === String(newClientId) : false;
    const matchesSearch = (s.name || '').toLowerCase().includes(modalSiteSearch.toLowerCase()) ||
                          (s.client_name && s.client_name.toLowerCase().includes(modalSiteSearch.toLowerCase()));
    return matchesClient && matchesSearch;
  });

  const handleTypeChange = (type: string) => {
    setNewPlanningType(type);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (type === 'SINGLE') {
      setNewVisitDate(todayStr);
      setNewStartDate(todayStr);
      setNewEndDate(todayStr);
    } else if (type === 'WEEKLY') {
      setNewStartDate(todayStr);
      const end = new Date(today);
      end.setDate(end.getDate() + 6);
      setNewEndDate(end.toISOString().split('T')[0]);
    } else if (type === 'MONTHLY') {
      const year = today.getFullYear();
      const month = today.getMonth();
      const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
      const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];
      setNewStartDate(firstDay);
      setNewEndDate(lastDay);
    }
  };

  // Visits Data
  const [plannedVisits, setPlannedVisits] = useState<PlannedVisit[]>([]);
  const [completedVisits, setCompletedVisits] = useState<Array<any>>([]);
  const [loadingClients, setLoadingClients] = useState(false);

  const loadClientsForModal = async () => {
    try {
      setLoadingClients(true);
      const empOidVal = user?.id || user?.empOid || user?.employee_id || 7558;
      const [cList, sList] = await Promise.all([getClients(empOidVal), getSites(empOidVal)]);
      setClients(cList || []);
      setModalSites(sList || []);
    } catch (err) {
      console.error('Failed to load clients & sites', err);
    } finally {
      setLoadingClients(false);
    }
  };

  useEffect(() => {
    loadClientsForModal();
  }, []);

  const handleCreateNewVisit = async () => {
    const isOtherClient = activeVisitTab === 1;

    if (isOtherClient) {
      if (!customClientName.trim()) {
        Alert.alert('Required', 'Please enter Client Name.');
        return;
      }
      if (!customSiteName.trim()) {
        Alert.alert('Required', 'Please enter Site Name.');
        return;
      }
    } else {
      if (!newClientId) {
        Alert.alert('Required', 'Please select a Client first.');
        return;
      }
      if (!newSiteId) {
        Alert.alert('Required', t('select_site_alert') || 'Please select a site to assign visit.');
        return;
      }
    }

    setCreatingVisit(true);
    try {
      const empOidVal = user?.empOid || user?.id || user?.employee_id || 7558;
      const payload: any = {
        planningType: newPlanningType,
        officerId: empOidVal,
        visitFrequency: parseInt(newVisitFrequency, 10) || 1,
      };

      if (isOtherClient) {
        payload.siteId = 0;
        payload.isCustomVisit = true;
        payload.clientName = customClientName.trim();
        payload.siteName = customSiteName.trim();
        payload.customClientName = customClientName.trim();
        payload.customSiteName = customSiteName.trim();
      } else {
        payload.siteId = parseInt(newSiteId, 10);
      }

      if (newPlanningType === 'SINGLE') {
        payload.visitDate = newVisitDate;
      } else if (newPlanningType === 'WEEKLY') {
        payload.weekStartDate = newStartDate;
        payload.weekEndDate = newEndDate;
      } else if (newPlanningType === 'MONTHLY') {
        try {
          const d = new Date(newStartDate);
          payload.planningMonth = d.getMonth() + 1;
          payload.planningYear = d.getFullYear();
        } catch (e) {
          const now = new Date();
          payload.planningMonth = now.getMonth() + 1;
          payload.planningYear = now.getFullYear();
        }
      }

      const res = await createPlannedVisit(payload);

      if (res && res.success) {
        Alert.alert('Success', 'Visit planned successfully!');
        if (isOtherClient) {
          setCustomClientName('');
          setCustomSiteName('');
        } else {
          setNewClientId('');
          setNewSiteId('');
        }
        setPlanVisitModalVisible(false);
        fetchDashboardData();
      } else {
        Alert.alert('Notice', res?.message || t('failed_assign_visit') || 'Failed to assign visit.');
      }
    } catch (e: any) {
      console.error('Create visit error:', e);
      const isTimeout = e?.code === 'ECONNABORTED' || (e?.message && e.message.toLowerCase().includes('timeout'));
      if (isTimeout) {
        Alert.alert('Network Timeout', 'Network request timed out. Please check your connection and try again.');
      } else {
        Alert.alert('Error', t('failed_assign_visit_db') || 'Failed to assign visit to DB.');
      }
    } finally {
      setCreatingVisit(false);
    }
  };

  const syncAttendanceStatus = async () => {
    const isServerActive = !!(todayRecord && todayRecord.check_in && !todayRecord.check_out);
    const hasServerExplicitInactive = !!(
      (todayRecord && (todayRecord as any).no_active_session) ||
      (todayRecord && todayRecord.check_out)
    );

    let activePunch: any = null;
    if (!hasServerExplicitInactive) {
      try {
        const empId = user?.employee_id || (user?.id ? String(user.id) : '');
        const punchLogs = await getPunchRecords(empId);
        const nowMs = Date.now();
        const todayStr = new Date().toISOString().split('T')[0];
        activePunch = punchLogs.find((r) => {
          const isPunchedIn = r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--';
          const punchMs = r.timestamp || 0;
          const isWithin16Hours = (nowMs - punchMs) < 16 * 3600 * 1000;
          const isToday = !r.date || r.date === todayStr;
          return isPunchedIn && isWithin16Hours && isToday;
        });
      } catch (e) {
        console.warn('Error reading punch records in dashboard sync:', e);
      }
    }

    const isOfficerActive = isServerActive || (!hasServerExplicitInactive && !!activePunch);
    setIsCheckedIn(isOfficerActive);
    if (isOfficerActive) {
      if (isServerActive && todayRecord?.check_in) {
        setSessionStart(new Date(todayRecord.check_in));
      } else if (activePunch) {
        setSessionStart(new Date(activePunch.timestamp || Date.now()));
      }
    } else {
      setSessionStart(null);
      setSessionTime('00:00:00');
    }
  };

  useFocusEffect(
    useCallback(() => {
      updateGreeting();
      refreshStatus();
      syncAttendanceStatus();
      fetchDashboardData(false);
    }, [])
  );

  // Synchronize Active Session state whenever server todayRecord or logs update
  useEffect(() => {
    syncAttendanceStatus();
    fetchDashboardData(false);
  }, [todayRecord, attendanceLogs]);


  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isCheckedIn && sessionStart) {
      timer = setInterval(() => {
        const diff = Math.floor((new Date().getTime() - sessionStart.getTime()) / 1000);
        const hrs = String(Math.floor(diff / 3600)).padStart(2, '0');
        const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const secs = String(diff % 60).padStart(2, '0');
        setSessionTime(`${hrs}:${mins}:${secs}`);
      }, 1000);
    } else {
      setSessionTime('00:00:00');
    }
    return () => clearInterval(timer);
  }, [isCheckedIn, sessionStart]);

  const updateGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting(t('good_morning'));
    else if (hour < 17) setGreeting(t('good_afternoon'));
    else setGreeting(t('good_evening'));
  };

  const fetchDashboardData = async (isPull: boolean = false) => {
    if (isPull) setIsRefreshing(true);
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const empOidVal = user?.id || user?.empOid || user?.employee_id || 7558;

      // 1. Fetch Sites safely
      try {
        const siteList = await getSites(empOidVal);
        setSites(siteList || []);
        if (siteList && siteList.length > 0) {
          setBaseSiteName(siteList[0].name || 'Main Base HQ');
        }
      } catch (err) {
        console.warn('Dashboard sites fetch warning:', err);
      }

      // 2. Attendance & Punch Record Session state
      await syncAttendanceStatus();

      // 3. Fetch Planned Visits safely
      try {
        const planned = await getPlannedVisits(empOidVal);
        setPlannedVisits(planned || []);
      } catch (err) {
        console.warn('Dashboard planned visits fetch warning:', err);
      }

      // 4. Fetch Completed Visit Reports safely
      const compiled: any[] = [];
      const seenIds = new Set<string>();

      try {
        const dayReps = await getDayVisitReports(empOidVal);
        (dayReps || []).forEach((r: any, idx: number) => {
          const rawOid = String(r.id || r.oid || idx);
          const itemKey = rawOid.startsWith('day_') ? rawOid : `day_${rawOid}`;
          if (!seenIds.has(itemKey)) {
            seenIds.add(itemKey);
            compiled.push({
              id: itemKey,
              reportNo: r.reportNo || r.report_id || `DVR-${rawOid}`,
              clientName: r.client_name || r.clientName || r.company || 'Client',
              siteName: r.site_name || r.unit || 'Site',
              visitType: 'Day Visit',
              date: r.visitDate || r.visit_date || r.createdOn || today,
              officer: r.officer || user?.name || 'FO Officer',
              status: 'Completed',
              rawReport: r,
            });
          }
        });
      } catch (err) {
        console.warn('Day visit reports fetch warning:', err);
      }

      try {
        const nightReps = await getNightVisitReports(empOidVal);
        (nightReps || []).forEach((r: any, idx: number) => {
          const rawOid = String(r.id || r.oid || idx);
          const itemKey = rawOid.startsWith('night_') ? rawOid : `night_${rawOid}`;
          if (!seenIds.has(itemKey)) {
            seenIds.add(itemKey);
            compiled.push({
              id: itemKey,
              reportNo: r.reportNo || r.report_id || `NVR-${rawOid}`,
              clientName: r.client_name || r.clientName || r.company || 'Client',
              siteName: r.site_name || r.unit || 'Site',
              visitType: 'Night Round',
              date: r.visitDate || r.visit_date || r.createdOn || today,
              officer: r.officer || user?.name || 'FO Officer',
              status: 'Completed',
              rawReport: r,
            });
          }
        });
      } catch (err) {
        console.warn('Night visit reports fetch warning:', err);
      }

      try {
        const genReps = await getGeneralVisits(empOidVal);
        (genReps || []).forEach((r: any, idx: number) => {
          const rawOid = String(r.id || r.oid || idx);
          const itemKey = rawOid.startsWith('gen_') ? rawOid : `gen_${rawOid}`;
          if (!seenIds.has(itemKey)) {
            seenIds.add(itemKey);
            compiled.push({
              id: itemKey,
              reportNo: r.report_id || r.report_no || r.reportNo || `GVR-${rawOid}`,
              clientName: r.client_name || r.clientName || 'Client',
              siteName: r.site_name || r.siteName || 'Site',
              visitType: 'General Audit',
              date: r.visit_date || r.visitDate || today,
              officer: r.officer || user?.name || 'FO Officer',
              status: 'Completed',
              rawReport: r,
            });
          }
        });
      } catch (err) {
        console.warn('General visit reports fetch warning:', err);
      }

      compiled.sort((a: any, b: any) => {
        const getTimestamp = (item: any) => {
          const r = item.rawReport || {};
          const created = r.created_on || r.createdOn || item.date;
          const checkOut = r.check_out_time || r.checkOutTime || r['check-out_time'];
          const checkIn = r.check_in_time || r.checkInTime || r['check-in_time'];

          let timeMs = 0;
          if (created) {
            const normCreated = typeof created === 'string' ? created.replace(' ', 'T') : created;
            const dt = new Date(normCreated);
            if (!isNaN(dt.getTime())) timeMs = dt.getTime();
          }

          if (timeMs === 0) {
            const datePart = (item.date || (typeof created === 'string' ? created : '') || '').slice(0, 10);
            const timePart = checkOut || checkIn || '00:00';
            const combined = new Date(`${datePart}T${timePart}:00`);
            if (!isNaN(combined.getTime())) timeMs = combined.getTime();
          }

          return timeMs;
        };

        const tA = getTimestamp(a);
        const tB = getTimestamp(b);
        if (tA !== tB) return tB - tA;

        const oidA = parseInt(String(a.rawReport?.oid || a.id || '0').replace(/\D/g, ''), 10) || 0;
        const oidB = parseInt(String(b.rawReport?.oid || b.id || '0').replace(/\D/g, ''), 10) || 0;
        return oidB - oidA;
      });

      setCompletedVisits(compiled);
    } catch (e) {
      console.warn('Dashboard global data error handled:', e);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const onlyPendingPlannedVisits = plannedVisits.filter((pv) => {
    if (pv.status === 'Completed') return false;
    const done = pv.completedVisits || 0;
    const freq = pv.visitFrequency ? parseInt(String(pv.visitFrequency), 10) : (pv.frequency ? parseInt(String(pv.frequency), 10) : 1);
    if (done >= freq && freq > 0) return false;
    if (isVisitDateRangeExpired(pv)) return false;
    return true;
  });

  return (
    <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={async () => {
              await refreshStatus();
              await fetchDashboardData(true);
            }}
            tintColor="#3B82F6"
          />
        }
      >

        {/* 1. HEADER PROFILE CARD (CENTER ALIGNED) */}
        <View style={[styles.standardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.headerProfileCardContent}>
            <View style={styles.userProfileSection}>
              <View style={[styles.avatarWrapper, { backgroundColor: isDark ? '#000000' : colors.surfaceSecondary }]}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                ) : (
                  <User color={colors.text} size={26} />
                )}
              </View>
              <View style={styles.userTextCol}>
                <Text style={[styles.greetingText, { color: colors.textSecondary }]} numberOfLines={1}>{greeting.replace(/,+$/, '')},</Text>
                <Text style={[styles.userNameText, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
                  {user?.name ? (user.name.trim().length > 16 ? `${user.name.trim().substring(0, 16)}...` : user.name.trim()) : 'Officer'}
                </Text>
              </View>
            </View>

            <View style={styles.companyLogoContainer}>
              <Image source={getCompanyLogo()} style={styles.companyLogoImage} resizeMode="contain" />
            </View>
          </View>
        </View>



        {/* 3. SESSION CARD (BLUE GRADIENT - MATCHING USER SCREENSHOT EXACTLY) */}
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={handleDutyCardPress}
        >
          <LinearGradient
            colors={['#00599B', '#008BD3']}
            start={{ x: 0, y: 0.2 }}
            end={{ x: 1, y: 0.8 }}
            style={styles.sessionGradientCard}
          >
            {/* Background Overlapping Circle Patterns Matching Screenshot */}
            <View style={styles.cardCirclePattern1} />
            <View style={styles.cardCirclePattern2} />

            {/* Glowing Live Scan Line Running Top to Bottom when Punched In */}
            {isCheckedIn && (
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

            <View style={styles.sessionHeaderRow}>
              <View style={styles.pulseDotContainer}>
                {isCheckedIn && (
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
                <View style={[styles.dot, isCheckedIn ? styles.dotActive : styles.dotInactive]} />
              </View>
              <Text style={styles.sessionStatusText}>
                {isCheckedIn ? (t('active_session') || 'Active Session') : (t('no_active_session') || 'No Active Session')}
              </Text>
            </View>
            <Text style={styles.timerDigits}>{sessionTime}</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* 4. DUTY STATUS CARD (ACTIVE / INACTIVE WITH CLEAR ACTIVATE DUTY ACTION) */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={handleDutyCardPress}
          style={[
            styles.attendanceStatusCard,
            isCheckedIn
              ? (isDark ? styles.attendanceCardActive : { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' })
              : (isDark ? styles.attendanceCardInactive : { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }),
          ]}
        >
          <View style={styles.attendanceCardLeft}>
            <View
              style={[
                styles.attendanceIconCircle,
                isCheckedIn ? styles.iconCircleActive : styles.iconCircleInactive,
                !isDark && { backgroundColor: isCheckedIn ? '#D1FAE5' : '#FEE2E2', borderColor: isCheckedIn ? '#10B981' : '#EF4444' },
              ]}
            >
              <Fingerprint
                color={isCheckedIn ? '#10B981' : '#EF4444'}
                size={28}
              />
              {isCheckedIn && <View style={styles.activeDotBadge} />}
            </View>

            <View style={styles.attendanceTextCol}>
              <View style={styles.attendanceStatusRow}>
                <View style={[styles.statusDot, isCheckedIn ? styles.statusDotActive : styles.statusDotInactive]} />
                <Text
                  style={[
                    styles.attendanceStatusBadgeText,
                    { color: isCheckedIn ? '#10B981' : '#EF4444' },
                  ]}
                >
                  {isCheckedIn ? t('active') : t('inactive')}
                </Text>
              </View>
              <Text style={[styles.attendanceActionHelperText, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
                {isCheckedIn ? t('officer_active_helper') : t('officer_inactive_helper')}
              </Text>
            </View>
          </View>

          <View style={styles.attendanceCardRight}>
            {isCheckedIn ? (
              <View
                style={[
                  styles.statusPillBadge,
                  styles.statusPillActive,
                  !isDark && {
                    backgroundColor: '#D1FAE5',
                    borderColor: '#10B981',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    { color: '#10B981' },
                  ]}
                >
                  {t('active') || 'ACTIVE'}
                </Text>
              </View>
            ) : (
              <View style={styles.activateDutyButton}>
                <Power color="#FFFFFF" size={14} strokeWidth={2.5} style={{ marginRight: 5 }} />
                <Text style={styles.activateDutyButtonText}>
                  ACTIVATE
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* 5. CLIENT VISITS CARD */}
        <View style={[styles.standardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>{t('client_visits').toUpperCase()}</Text>

          <View style={styles.gridItemsRow}>
            {/* Existing Client Visit */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (!checkDutyAccess('planning or starting client visits')) return;
                setActiveVisitTab(0);
                setModalClientSearch('');
                loadClientsForModal();
                setPlanVisitModalVisible(true);
              }}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: colors.gridIconBg, borderColor: colors.gridIconBorder }]}>
                <Building2 color="#3B82F6" size={28} />
              </View>
              <Text style={[styles.gridItemLabel, { color: colors.text }]}>Existing Client</Text>
            </TouchableOpacity>

            {/* New Client Visit */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (!checkDutyAccess('creating new client visits')) return;
                setActiveVisitTab(1);
                setPlanVisitModalVisible(true);
              }}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: colors.gridIconBg, borderColor: colors.gridIconBorder }]}>
                <UserPlus color="#10B981" size={28} />
              </View>
              <Text style={[styles.gridItemLabel, { color: colors.text }]}>New Client</Text>
            </TouchableOpacity>

            {/* Patrolling / Checklist Tours */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (!checkDutyAccess('starting checklist')) return;
                router.push('/patrol');
              }}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: colors.gridIconBg, borderColor: colors.gridIconBorder }]}>
                <Shield color="#3B82F6" size={28} />
              </View>
              <Text style={[styles.gridItemLabel, { color: colors.text }]}>{t('patrolling') || 'Checklist'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 5. OFFICER VISITS SECTION (CENTER ALIGNED) */}
        <View style={[styles.standardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>{t('field_officer_visits').toUpperCase()}</Text>

          <View style={styles.gridItemsRow}>
            {/* Pending Visits */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (!checkDutyAccess('starting site visits')) return;
                router.push('/visits?tab=pending');
              }}
              style={styles.gridItem}
            >
              <View style={styles.gridIconCircleWrapper}>
                <View style={[styles.gridIconCircle, { backgroundColor: colors.gridIconBg, borderColor: colors.gridIconBorder }]}>
                  <Clock color="#3B82F6" size={30} />
                </View>
                {onlyPendingPlannedVisits.length > 0 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{onlyPendingPlannedVisits.length}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.gridItemLabel, { color: colors.text }]}>{t('pending_visits')}</Text>
            </TouchableOpacity>

            {/* Completed Visits */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/visits?tab=completed')}
              style={styles.gridItem}
            >
              <View style={styles.gridIconCircleWrapper}>
                <View style={[styles.gridIconCircle, { backgroundColor: colors.gridIconBg, borderColor: colors.gridIconBorder }]}>
                  <CheckCircle2 color="#10B981" size={30} />
                </View>
              </View>
              <Text style={[styles.gridItemLabel, { color: colors.text }]}>{t('completed_visits')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 6. ATTENDANCE CARD (COMMENTED OUT FROM APP AS REQUESTED) */}
        {/*
        <View style={[styles.standardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>{t('attendance').toUpperCase()}</Text>

          <View style={styles.gridItemsRow}>
            <TouchableOpacity
              onPress={() => router.push('/attendance?view=dashboard')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: colors.gridIconBg, borderColor: colors.gridIconBorder }]}>
                <LayoutGrid color="#3B82F6" size={24} />
              </View>
              <Text style={[styles.gridItemLabel, { color: colors.text }]}>{t('dashboard')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/attendance?view=logs')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: colors.gridIconBg, borderColor: colors.gridIconBorder }]}>
                <CheckCircle2 color="#10B981" size={24} />
              </View>
              <Text style={[styles.gridItemLabel, { color: colors.text }]}>{t('attendance_log')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/attendance?view=missed')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: colors.gridIconBg, borderColor: colors.gridIconBorder }]}>
                <Clock color="#F59E0B" size={24} />
              </View>
              <Text style={[styles.gridItemLabel, { color: colors.text }]}>{t('missed_punches')}</Text>
            </TouchableOpacity>
          </View>
        </View>
        */}

        {/* 7. PROFILE & SETTINGS CARD (CENTER ALIGNED) */}
        <View style={[styles.standardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>{`${t('profile')} & ${t('settings')}`.toUpperCase()}</Text>

          <View style={styles.gridItemsRow}>
            <TouchableOpacity
              onPress={() => router.push('/profile')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: colors.gridIconBg, borderColor: colors.gridIconBorder }]}>
                <User color="#EC4899" size={24} />
              </View>
              <Text style={[styles.gridItemLabel, { color: colors.text }]}>{t('profile')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/settings')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: colors.gridIconBg, borderColor: colors.gridIconBorder }]}>
                <Settings color={colors.textSecondary} size={24} />
              </View>
              <Text style={[styles.gridItemLabel, { color: colors.text }]}>{t('settings')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.copyrightText, { color: colors.textMuted }]}>❖ 2026 HUMANKIND TECHNOLOGY</Text>
      </ScrollView>

      {/* PLAN VISIT MODAL (OPENED VIA EXISTING CLIENT OR NEW CLIENT BUTTON) */}
      <Modal
        visible={planVisitModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (pickerClientVisible) setPickerClientVisible(false);
          else if (pickerSiteVisible) setPickerSiteVisible(false);
          else setPlanVisitModalVisible(false);
        }}
      >
        <KeyboardAvoidingView style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalContainer, { backgroundColor: colors.modalBg, borderColor: colors.border }]}>
            {pickerClientVisible ? (
              <View style={{ maxHeight: 480, minHeight: 360, flexShrink: 1 }}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>{t('select_client')}</Text>
                  <TouchableOpacity
                    onPress={() => setPickerClientVisible(false)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <X color={colors.textSecondary} size={24} />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[styles.modalInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text, marginTop: 12, marginBottom: 12 }]}
                  placeholder={t('search_client')}
                  placeholderTextColor={colors.placeholder}
                  value={modalClientSearch}
                  onChangeText={setModalClientSearch}
                />

                <FlatList
                  data={filteredModalClients}
                  keyExtractor={(item) => String(item.id)}
                  initialNumToRender={20}
                  keyboardShouldPersistTaps="handled"
                  style={{ flexShrink: 1 }}
                  contentContainerStyle={{ paddingBottom: 20 }}
                  ListEmptyComponent={
                    <View style={{ padding: 28, alignItems: 'center', justifyContent: 'center' }}>
                      <Search color={colors.textSecondary} size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
                      <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', fontWeight: '500' }}>
                        {loadingClients
                          ? 'Loading clients...'
                          : !modalClientSearch.trim()
                          ? 'Type client name to search...'
                          : `No clients found matching "${modalClientSearch}".`}
                      </Text>
                      {!modalClientSearch.trim() && !loadingClients && (
                        <Text style={{ color: colors.placeholder, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
                          Names remain hidden until you search.
                        </Text>
                      )}
                    </View>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.modalItemRow,
                        { borderBottomColor: colors.border },
                        String(item.id) === String(newClientId) && { borderColor: '#3B82F6' },
                      ]}
                      onPress={() => {
                        setNewClientId(String(item.id));
                        setNewSiteId('');
                        setPickerClientVisible(false);
                      }}
                    >
                      <Building color="#3B82F6" size={18} style={{ marginRight: 10 }} />
                      <Text style={[styles.modalItemRowText, { color: colors.text }, String(item.id) === String(newClientId) && { color: '#3B82F6', fontWeight: '700' }]}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            ) : pickerSiteVisible ? (
              <View style={{ maxHeight: 480, minHeight: 360, flexShrink: 1 }}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>{t('select_site')}</Text>
                  <TouchableOpacity
                    onPress={() => setPickerSiteVisible(false)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <X color={colors.textSecondary} size={24} />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[styles.modalInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text, marginTop: 12, marginBottom: 12 }]}
                  placeholder={t('search_site')}
                  placeholderTextColor={colors.placeholder}
                  value={modalSiteSearch}
                  onChangeText={setModalSiteSearch}
                />

                <FlatList
                  data={filteredModalSites}
                  keyExtractor={(item) => String(item.id)}
                  initialNumToRender={20}
                  keyboardShouldPersistTaps="handled"
                  style={{ flexShrink: 1 }}
                  contentContainerStyle={{ paddingBottom: 20 }}
                  ListEmptyComponent={
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                        {!newClientId
                          ? t('select_client_first')
                          : loadingClients
                          ? 'Loading sites...'
                          : t('no_sites_found')}
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.modalItemRow,
                        { borderBottomColor: colors.border },
                        String(item.id) === String(newSiteId) && { borderColor: '#10B981' },
                      ]}
                      onPress={() => {
                        setNewSiteId(String(item.id));
                        setPickerSiteVisible(false);
                      }}
                    >
                      <Building color="#10B981" size={18} style={{ marginRight: 10 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalItemRowText, { color: colors.text }, String(item.id) === String(newSiteId) && { color: '#10B981', fontWeight: '700' }]}>
                          {item.name}
                        </Text>
                        {item.client_name ? (
                          <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>{item.client_name}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </View>
            ) : (
              <>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>
                    {activeVisitTab === 0 ? 'PLAN VISIT - REGISTERED CLIENT' : 'PLAN VISIT - NEW CLIENT'}
                  </Text>
                  <TouchableOpacity onPress={() => setPlanVisitModalVisible(false)}>
                    <X color={colors.textSecondary} size={24} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {activeVisitTab === 0 ? (
                    <>
                      <Text style={[styles.tabFieldLabel, { color: colors.textSecondary }]}>{t('select_client')}</Text>
                      <TouchableOpacity
                        style={[styles.tabPickerBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                        onPress={() => {
                          if (clients.length === 0) {
                            loadClientsForModal();
                          }
                          setModalClientSearch('');
                          setPickerClientVisible(true);
                        }}
                      >
                        <Text
                          style={[
                            styles.tabPickerBtnText,
                            { color: colors.text },
                            !newClientId && { color: colors.placeholder },
                          ]}
                          numberOfLines={1}
                        >
                          {clients.find((c) => String(c.id) === String(newClientId))?.name || 'Choose registered client...'}
                        </Text>
                        <ChevronDown color={colors.textSecondary} size={18} />
                      </TouchableOpacity>

                      <Text style={[styles.tabFieldLabel, { color: colors.textSecondary }]}>{t('select_site')}</Text>
                      <TouchableOpacity
                        style={[styles.tabPickerBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                        onPress={() => {
                          if (!newClientId) {
                            Alert.alert('Notice', 'Please select a Client first.');
                            return;
                          }
                          if (modalSites.length === 0) {
                            loadClientsForModal();
                          }
                          setPickerSiteVisible(true);
                        }}
                      >
                        <Text
                          style={[
                            styles.tabPickerBtnText,
                            { color: colors.text },
                            !newSiteId && { color: colors.placeholder },
                          ]}
                          numberOfLines={1}
                        >
                          {modalSites.find((s) => String(s.id) === String(newSiteId))?.name || (newClientId ? 'Choose assigned site...' : 'Select client first')}
                        </Text>
                        <ChevronDown color={colors.textSecondary} size={18} />
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.tabFieldLabel, { color: colors.textSecondary }]}>NEW CLIENT NAME</Text>
                      <TextInput
                        style={[styles.tabTextInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                        value={customClientName}
                        onChangeText={setCustomClientName}
                        placeholder="Enter client or company name"
                        placeholderTextColor={colors.placeholder}
                      />

                      <Text style={[styles.tabFieldLabel, { color: colors.textSecondary }]}>NEW SITE / BRANCH NAME</Text>
                      <TextInput
                        style={[styles.tabTextInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                        value={customSiteName}
                        onChangeText={setCustomSiteName}
                        placeholder="Enter site, premise or unit name"
                        placeholderTextColor={colors.placeholder}
                      />
                    </>
                  )}

                  <Text style={[styles.tabFieldLabel, { color: colors.textSecondary }]}>{t('planning_type')}</Text>
                  <View style={styles.tabPillRow}>
                    {['SINGLE', 'WEEKLY', 'MONTHLY'].map((pt) => (
                      <TouchableOpacity
                        key={pt}
                        style={[
                          styles.tabPill,
                          { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                          newPlanningType === pt && styles.tabPillActive,
                        ]}
                        onPress={() => handleTypeChange(pt)}
                      >
                        <Text style={[styles.tabPillText, { color: colors.textSecondary }, newPlanningType === pt && styles.tabPillTextActive]}>
                          {pt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tabFieldLabel, { color: colors.textSecondary }]}>{t('visit_frequency')}</Text>
                      <TextInput
                        style={[styles.tabTextInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                        keyboardType="numeric"
                        value={newVisitFrequency}
                        onChangeText={setNewVisitFrequency}
                        placeholder="1"
                        placeholderTextColor={colors.placeholder}
                      />
                    </View>

                    <View style={{ flex: 1.5 }}>
                      <Text style={[styles.tabFieldLabel, { color: colors.textSecondary }]}>{newPlanningType === 'SINGLE' ? t('visit_date') : t('start_date')}</Text>
                      <TouchableOpacity
                        style={[styles.tabPickerBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                        onPress={() => setActiveDatePicker(newPlanningType === 'SINGLE' ? 'visit' : 'start')}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.tabPickerBtnText, { color: colors.text }]} numberOfLines={1}>
                          {newPlanningType === 'SINGLE' ? newVisitDate : newStartDate}
                        </Text>
                        <Calendar color="#3B82F6" size={16} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {newPlanningType !== 'SINGLE' && (
                    <View style={{ marginTop: 4 }}>
                      <Text style={[styles.tabFieldLabel, { color: colors.textSecondary }]}>{t('end_date')}</Text>
                      <TouchableOpacity
                        style={[styles.tabPickerBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                        onPress={() => setActiveDatePicker('end')}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.tabPickerBtnText, { color: colors.text }]} numberOfLines={1}>{newEndDate}</Text>
                        <Calendar color="#3B82F6" size={16} />
                      </TouchableOpacity>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.tabSubmitBtn, activeVisitTab === 1 && { backgroundColor: '#10B981' }]}
                    onPress={handleCreateNewVisit}
                    disabled={creatingVisit}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.tabSubmitBtnText}>
                      {creatingVisit
                        ? 'CREATING...'
                        : activeVisitTab === 0
                        ? 'ASSIGN VISIT PLAN'
                        : 'CREATE NEW CLIENT VISIT'}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}

            {/* In-Modal iOS DatePicker Overlay (Prevents iOS Modal-over-Modal presentation failure) */}
            {activeDatePicker !== null && Platform.OS === 'ios' && (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', borderRadius: 24, zIndex: 9999 }]}>
                <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 16, padding: 20, width: '90%', alignItems: 'center' }}>
                  <DateTimePicker
                    value={parseDateString(
                      activeDatePicker === 'visit' ? newVisitDate : activeDatePicker === 'start' ? newStartDate : newEndDate
                    )}
                    mode="date"
                    display="inline"
                    themeVariant={isDark ? "dark" : "light"}
                    onChange={handleDatePickerChange}
                  />
                  <TouchableOpacity
                    style={{ marginTop: 14, backgroundColor: '#3B82F6', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 }}
                    onPress={() => setActiveDatePicker(null)}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ANDROID CALENDAR DATE PICKER */}
      {activeDatePicker !== null && Platform.OS === 'android' && (
        <DateTimePicker
          value={parseDateString(
            activeDatePicker === 'visit' ? newVisitDate : activeDatePicker === 'start' ? newStartDate : newEndDate
          )}
          mode="date"
          display="calendar"
          onChange={handleDatePickerChange}
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingTop: Platform.OS === 'android' ? 24 : 12,
    paddingBottom: 40,
  },

  /* Standard Card */
  standardCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },

  /* Header Card Details */
  headerProfileCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  userProfileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarWrapper: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: isDark ? '#000000' : colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  userTextCol: {
    justifyContent: 'center',
    flex: 1,
    marginRight: 8,
  },
  greetingText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'left',
  },
  userNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
    textAlign: 'left',
  },
  empIdText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'left',
  },

  /* LOGO CONTAINER */
  companyLogoContainer: {
    width: 90,
    height: 60,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 12,
    backgroundColor: 'transparent',
  },
  companyLogoImage: {
    width: '100%',
    height: '100%',
  },

  /* Search Bar */
  searchBarContainer: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    textAlign: 'center',
  },

  /* Session Blue Card */
  sessionGradientCard: {
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
  sessionHeaderRow: {
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
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotActive: {
    backgroundColor: '#34D399',
  },
  dotInactive: {
    backgroundColor: '#FFFFFF',
    opacity: 0.9,
  },
  sessionStatusText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  timerDigits: {
    color: '#FFFFFF',
    fontSize: 54,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 2,
    textAlign: 'left',
  },

  /* ATTENDANCE STATUS CARD (ACTIVE / INACTIVE) */
  attendanceStatusCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
  },
  attendanceCardActive: {
    borderColor: 'rgba(16, 185, 129, 0.45)',
    backgroundColor: isDark ? '#0D2322' : '#ECFDF5',
  },
  attendanceCardInactive: {
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: isDark ? '#1C1420' : '#FEF2F2',
  },
  attendanceCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  attendanceIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: isDark ? '#120D16' : '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    position: 'relative',
  },
  iconCircleActive: {
    backgroundColor: isDark ? '#0A1C1C' : '#D1FAE5',
    borderColor: 'rgba(16, 185, 129, 0.45)',
  },
  iconCircleInactive: {
    backgroundColor: isDark ? '#160B14' : '#FEE2E2',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  activeDotBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  attendanceTextCol: {
    flex: 1,
  },
  attendanceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotActive: {
    backgroundColor: '#10B981',
  },
  statusDotInactive: {
    backgroundColor: '#EF4444',
  },
  attendanceStatusBadgeText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  attendanceActionHelperText: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
    lineHeight: 15,
  },
  attendanceCardRight: {
    marginLeft: 10,
  },
  statusPillBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  statusPillInactive: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: '#EF4444',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activateDutyButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  activateDutyButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /* VISIT HUB 3-TAB CARD */
  visitHubCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: isDark ? '#0A1128' : colors.surfaceSecondary,
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: isDark ? '#1E293B' : colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tabButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabButtonTextActive: {
    color: isDark ? '#FFFFFF' : colors.text,
    fontWeight: '800',
  },
  tabContentContainer: {
    width: '100%',
  },
  tabSectionHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  tabFieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 6,
  },
  tabPickerBtn: {
    backgroundColor: colors.inputBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  tabPickerBtnText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  tabTextInput: {
    backgroundColor: colors.inputBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    height: 46,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  tabPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  tabPillActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: colors.primary,
  },
  tabPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabPillTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  tabSubmitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  tabSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  checklistTile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checklistIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checklistTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  checklistTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  checklistDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },

  /* Features Container Section Titles */
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.8,
    marginBottom: 16,
    textAlign: 'center',
  },

  /* UNIFIED ICON GRID ROW */
  gridItemsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
  },
  gridItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  gridIconCircleWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridIconCircle: {
    width: 66,
    height: 66,
    borderRadius: 20,
    backgroundColor: isDark ? '#000000' : colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  gridItemLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  countBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  /* Footer */
  copyrightText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 20,
  },

  /* Modal Styling */
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.modalOverlay,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.modalBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  modalItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalItemRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 6,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  pickerBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  typePill: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  typePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  typePillTextActive: {
    color: '#FFFFFF',
  },
  modalInput: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 13,
    marginBottom: 10,
  },
  submitPlanBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  submitPlanBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
