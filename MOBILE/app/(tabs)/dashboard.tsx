import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useAttendance } from '../../context/AttendanceContext';
import { useLanguage } from '../../context/LanguageContext';
import { getPlannedVisits, createPlannedVisit, getSites, getClients, Site, Client, PlannedVisit } from '../../services/siteService';
import { getPunchRecords } from '../../services/db';
import { getDayVisitReports, getNightVisitReports, getGeneralVisits } from '../../services/visitService';

export default function DashboardScreen() {
  const { user, profileImage } = useAuth();
  const { todayRecord, attendanceLogs, profileData, refreshStatus } = useAttendance();
  const { t } = useLanguage();
  const router = useRouter();

  const [greeting, setGreeting] = useState('Good Afternoon');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Add Visit Modal State
  const [addVisitModalVisible, setAddVisitModalVisible] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [newClientId, setNewClientId] = useState('');
  const [newSiteId, setNewSiteId] = useState('');
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

  // Sub-modal Pickers
  const [pickerClientVisible, setPickerClientVisible] = useState(false);
  const [pickerSiteVisible, setPickerSiteVisible] = useState(false);
  const [modalClientSearch, setModalClientSearch] = useState('');
  const [modalSiteSearch, setModalSiteSearch] = useState('');

  const filteredModalClients = clients.filter((c) =>
    c.name.toLowerCase().includes(modalClientSearch.toLowerCase())
  );

  const filteredModalSites = modalSites.filter((s) => {
    const matchesClient = newClientId ? String(s.client_id) === String(newClientId) : false;
    const matchesSearch = s.name.toLowerCase().includes(modalSiteSearch.toLowerCase()) ||
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

  const loadClientsForModal = async () => {
    try {
      const [cList, sList] = await Promise.all([getClients(), getSites()]);
      setClients(cList || []);
      setModalSites(sList || []);
      setNewClientId('');
      setNewSiteId('');
    } catch (err) {
      console.error('Failed to load clients & sites', err);
    }
  };

  const handleOpenAddVisitModal = () => {
    setPickerClientVisible(false);
    setPickerSiteVisible(false);
    setModalClientSearch('');
    setModalSiteSearch('');
    setNewClientId('');
    setNewSiteId('');
    loadClientsForModal();
    setAddVisitModalVisible(true);
  };

  const handleCloseAddVisitModal = () => {
    setPickerClientVisible(false);
    setPickerSiteVisible(false);
    setModalClientSearch('');
    setModalSiteSearch('');
    setAddVisitModalVisible(false);
  };

  const handleCreateNewVisit = async () => {
    if (!newSiteId) {
      alert(t('select_site_alert'));
      return;
    }
    setCreatingVisit(true);
    try {
      const empOidVal = user?.empOid || user?.id || user?.employee_id || 7558;
      const payload: any = {
        planningType: newPlanningType,
        siteId: parseInt(newSiteId, 10),
        officerId: empOidVal,
        visitFrequency: parseInt(newVisitFrequency, 10) || 1,
      };

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
        setAddVisitModalVisible(false);
        fetchDashboardData();
      } else {
        alert(res?.message || t('failed_assign_visit'));
      }
    } catch (e: any) {
      console.error('Create visit error:', e);
      const isTimeout = e?.code === 'ECONNABORTED' || (e?.message && e.message.toLowerCase().includes('timeout'));
      if (isTimeout) {
        alert('Network request timed out. Please check your connection and try again.');
      } else {
        alert(t('failed_assign_visit_db'));
      }
    } finally {
      setCreatingVisit(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      updateGreeting();
      refreshStatus();
      fetchDashboardData();
    }, [])
  );

  // Synchronize Active Session state whenever server todayRecord updates
  useEffect(() => {
    if (todayRecord) {
      if (todayRecord.check_in && !todayRecord.check_out) {
        setIsCheckedIn(true);
        setSessionStart(new Date(todayRecord.check_in));
      } else {
        setIsCheckedIn(false);
        setSessionStart(null);
        setSessionTime('00:00:00');
      }
    }
    fetchDashboardData();
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

  const fetchDashboardData = async () => {
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
      if (todayRecord) {
        if (todayRecord.check_in && !todayRecord.check_out) {
          setIsCheckedIn(true);
          setSessionStart(new Date(todayRecord.check_in));
        } else {
          setIsCheckedIn(false);
          setSessionStart(null);
          setSessionTime('00:00:00');
        }
      } else {
        const empId = user?.employee_id || (user?.id ? String(user.id) : '');
        const punchLogs = await getPunchRecords(empId);
        const nowMs = Date.now();
        const activePunch = punchLogs.find((r) => {
          const isPunchedIn = r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--';
          const punchMs = r.timestamp || 0;
          const isWithin16Hours = (nowMs - punchMs) < 16 * 3600 * 1000;
          return isPunchedIn && isWithin16Hours;
        });

        if (activePunch) {
          setIsCheckedIn(true);
          const punchMs = activePunch.timestamp || Date.now();
          setSessionStart(new Date(punchMs));
        } else {
          setIsCheckedIn(false);
          setSessionStart(null);
          setSessionTime('00:00:00');
        }
      }

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
    }
  };

  const onlyPendingPlannedVisits = plannedVisits.filter((pv) => {
    if (pv.status === 'Completed') return false;
    const done = pv.completedVisits || 0;
    const freq = pv.visitFrequency ? parseInt(String(pv.visitFrequency), 10) : (pv.frequency ? parseInt(String(pv.frequency), 10) : 1);
    if (done >= freq && freq > 0) return false;
    return true;
  });

  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0A1128" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDashboardData} tintColor="#3B82F6" />}
      >
        {/* 1. HEADER PROFILE CARD (CENTER ALIGNED) */}
        <View style={styles.standardCard}>
          <View style={styles.headerProfileCardContent}>
            <TouchableOpacity onPress={() => router.push('/profile')} style={styles.userProfileSection}>
              <View style={styles.avatarWrapper}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                ) : (
                  <User color="#FFFFFF" size={26} />
                )}
              </View>
              <View style={styles.userTextCol}>
                <Text style={styles.greetingText}>{greeting},</Text>
                <Text style={styles.userNameText}>{user?.name || 'Field Officer'}</Text>
                <Text style={styles.empIdText}>EMP ID: {user?.employee_id || 'EMP001'}</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.companyLogoContainer}>
              <Image source={getCompanyLogo()} style={styles.companyLogoImage} resizeMode="contain" />
            </View>
          </View>
        </View>



        {/* 3. SESSION CARD (BLUE GRADIENT - MATCHING USER SCREENSHOT EXACTLY) */}
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => router.push('/(tabs)/attendance')}
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

        {/* 4. ACTION CARDS (MARK ATTENDANCE & ADD VISIT - CENTER ALIGNED) */}
        <View style={styles.actionCardsRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/mark-attendance')}
            style={styles.actionCard}
          >
            <View style={styles.actionIconBox}>
              <Fingerprint color="#3B82F6" size={38} />
            </View>
            <Text style={styles.actionCardTitle}>{t('mark_attendance').toUpperCase().replace(' ', '\n')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleOpenAddVisitModal}
            style={styles.actionCard}
          >
            <View style={styles.actionIconBox}>
              <PlusCircle color="#10B981" size={38} />
            </View>
            <Text style={styles.actionCardTitle}>{t('add_visit').toUpperCase().replace(' ', '\n')}</Text>
          </TouchableOpacity>
        </View>

        {/* 5. FIELD OFFICER VISITS SECTION (CENTER ALIGNED) */}
        <View style={styles.standardCard}>
          <Text style={styles.sectionTitle}>{t('field_officer_visits').toUpperCase()}</Text>

          <View style={styles.gridItemsRow}>
            {/* Pending Visits */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/visits?tab=pending')}
              style={styles.gridItem}
            >
              <View style={styles.gridIconCircleWrapper}>
                <View style={styles.gridIconCircle}>
                  <Clock color="#3B82F6" size={30} />
                </View>
                {onlyPendingPlannedVisits.length > 0 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{onlyPendingPlannedVisits.length}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.gridItemLabel}>{t('pending_visits')}</Text>
            </TouchableOpacity>

            {/* Completed Visits */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/visits?tab=completed')}
              style={styles.gridItem}
            >
              <View style={styles.gridIconCircleWrapper}>
                <View style={styles.gridIconCircle}>
                  <CheckCircle2 color="#10B981" size={30} />
                </View>
                {completedVisits.length > 0 && (
                  <View style={[styles.countBadge, { backgroundColor: '#10B981' }]}>
                    <Text style={styles.countBadgeText}>{completedVisits.length}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.gridItemLabel}>{t('completed_visits')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 6. ATTENDANCE CARD (CENTER ALIGNED) */}
        <View style={styles.standardCard}>
          <Text style={styles.sectionTitle}>{t('attendance').toUpperCase()}</Text>

          <View style={styles.gridItemsRow}>
            <TouchableOpacity
              onPress={() => router.push('/attendance?view=dashboard')}
              style={styles.gridItem}
            >
              <View style={styles.gridIconCircle}>
                <LayoutGrid color="#3B82F6" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>{t('dashboard')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/attendance?view=logs')}
              style={styles.gridItem}
            >
              <View style={styles.gridIconCircle}>
                <CheckCircle2 color="#10B981" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>{t('attendance_log')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/attendance?view=missed')}
              style={styles.gridItem}
            >
              <View style={styles.gridIconCircle}>
                <Clock color="#F59E0B" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>{t('missed_punches')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 7. PROFILE & SETTINGS CARD (CENTER ALIGNED) */}
        <View style={styles.standardCard}>
          <Text style={styles.sectionTitle}>{`${t('profile')} & ${t('settings')}`.toUpperCase()}</Text>

          <View style={styles.gridItemsRow}>
            <TouchableOpacity
              onPress={() => router.push('/profile')}
              style={styles.gridItem}
            >
              <View style={styles.gridIconCircle}>
                <User color="#EC4899" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>{t('profile')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/settings')}
              style={styles.gridItem}
            >
              <View style={styles.gridIconCircle}>
                <Settings color="#94A3B8" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>{t('settings')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.copyrightText}>❖ 2026 HUMANKIND TECHNOLOGY</Text>
      </ScrollView>

      {/* ADD VISIT / ASSIGN VISIT PLAN MODAL */}
      <Modal visible={addVisitModalVisible} transparent animationType="slide" onRequestClose={handleCloseAddVisitModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {pickerClientVisible ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t('select_client')}</Text>
                  <TouchableOpacity onPress={() => setPickerClientVisible(false)}>
                    <X color="#94A3B8" size={24} />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[styles.modalInput, { marginTop: 12, marginBottom: 12 }]}
                  placeholder={t('search_client')}
                  placeholderTextColor="#64748B"
                  value={modalClientSearch}
                  onChangeText={setModalClientSearch}
                />

                <FlatList
                  data={filteredModalClients}
                  keyExtractor={(item) => String(item.id)}
                  initialNumToRender={15}
                  maxToRenderPerBatch={15}
                  windowSize={5}
                  removeClippedSubviews
                  ListEmptyComponent={
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>No clients found.</Text>
                    </View>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.modalItemRow}
                      onPress={() => {
                        setNewClientId(String(item.id));
                        setNewSiteId('');
                        setPickerClientVisible(false);
                      }}
                    >
                      <Building color="#3B82F6" size={18} style={{ marginRight: 10 }} />
                      <Text style={styles.modalItemRowText}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            ) : pickerSiteVisible ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t('select_site')}</Text>
                  <TouchableOpacity onPress={() => setPickerSiteVisible(false)}>
                    <X color="#94A3B8" size={24} />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[styles.modalInput, { marginTop: 12, marginBottom: 12 }]}
                  placeholder={t('search_site')}
                  placeholderTextColor="#64748B"
                  value={modalSiteSearch}
                  onChangeText={setModalSiteSearch}
                />

                <FlatList
                  data={filteredModalSites}
                  keyExtractor={(item) => String(item.id)}
                  initialNumToRender={15}
                  maxToRenderPerBatch={15}
                  windowSize={5}
                  removeClippedSubviews
                  ListEmptyComponent={
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
                        {!newClientId ? t('select_client_first') : t('no_sites_found')}
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.modalItemRow}
                      onPress={() => {
                        setNewSiteId(String(item.id));
                        setPickerSiteVisible(false);
                      }}
                    >
                      <Building color="#10B981" size={18} style={{ marginRight: 10 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalItemRowText}>{item.name}</Text>
                        {item.client_name ? (
                          <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{item.client_name}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </>
            ) : (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t('assign_visit_plan')}</Text>
                  <TouchableOpacity onPress={handleCloseAddVisitModal}>
                    <X color="#94A3B8" size={24} />
                  </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={{ paddingVertical: 10 }}>
                  <Text style={styles.fieldLabel}>{t('select_client')}</Text>
                  <TouchableOpacity
                    style={styles.pickerBtn}
                    onPress={() => setPickerClientVisible(true)}
                  >
                    <Text style={styles.pickerBtnText}>
                      {clients.find((c) => String(c.id) === String(newClientId))?.name || `${t('select_client')}...`}
                    </Text>
                    <ChevronDown color="#94A3B8" size={20} />
                  </TouchableOpacity>

                  <Text style={styles.fieldLabel}>{t('select_site')}</Text>
                  <TouchableOpacity
                    style={styles.pickerBtn}
                    onPress={() => setPickerSiteVisible(true)}
                  >
                    <Text style={styles.pickerBtnText}>
                      {modalSites.find((s) => String(s.id) === String(newSiteId))?.name || `${t('select_site')}...`}
                    </Text>
                    <ChevronDown color="#94A3B8" size={20} />
                  </TouchableOpacity>

                  <Text style={styles.fieldLabel}>{t('planning_type')}</Text>
                  <View style={styles.typeRow}>
                    {['SINGLE', 'WEEKLY', 'MONTHLY'].map((pt) => (
                      <TouchableOpacity
                        key={pt}
                        style={[styles.typePill, newPlanningType === pt && styles.typePillActive]}
                        onPress={() => handleTypeChange(pt)}
                      >
                        <Text style={[styles.typePillText, newPlanningType === pt && styles.typePillTextActive]}>
                          {pt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.fieldLabel}>{t('visit_frequency')}</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    value={newVisitFrequency}
                    onChangeText={setNewVisitFrequency}
                    placeholder="e.g. 1"
                    placeholderTextColor="#64748B"
                  />

                  {newPlanningType === 'SINGLE' ? (
                    <>
                      <Text style={styles.fieldLabel}>{t('visit_date')}</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={newVisitDate}
                        onChangeText={setNewVisitDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#64748B"
                      />
                    </>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>{t('start_date')}</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={newStartDate}
                          onChangeText={setNewStartDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#64748B"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>{t('end_date')}</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={newEndDate}
                          onChangeText={setNewEndDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#64748B"
                        />
                      </View>
                    </View>
                  )}

                  <Text style={styles.fieldLabel}>{t('assigned_officer')}</Text>
                  <TextInput
                    style={[styles.modalInput, { opacity: 0.7 }]}
                    value={user?.name || 'Field Officer'}
                    editable={false}
                  />

                  <TouchableOpacity
                    style={styles.submitPlanBtn}
                    onPress={handleCreateNewVisit}
                    disabled={creatingVisit}
                  >
                    <Text style={styles.submitPlanBtnText}>
                      {creatingVisit ? '...' : t('assign_visit_plan')}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#0A1128',
  },
  container: {
    flex: 1,
    backgroundColor: '#0A1128',
  },
  content: {
    padding: 16,
    paddingTop: Platform.OS === 'android' ? 24 : 12,
    paddingBottom: 40,
  },

  /* DARK BLUISH SHADE CARD DESIGN (#131C33) */
  standardCard: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },

  /* Header Card Details - Original Left-Aligned Row Layout */
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
    backgroundColor: '#000000',
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
  },
  greetingText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
    textAlign: 'left',
  },
  userNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
    textAlign: 'left',
  },
  empIdText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'left',
  },

  /* LOGO CONTAINER - RIGHT ALIGNED */
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

  /* Search Bar - Centered Content */
  searchBarContainer: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
    textAlign: 'center',
  },

  /* Session Blue Card - Matching User Screenshot Exactly */
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

  /* Action Cards Row - Centered Tile Layout */
  actionCardsRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    height: 146,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  actionIconBox: {
    width: 66,
    height: 66,
    borderRadius: 20,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 17,
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  /* Features Container Section Titles - Centered */
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.8,
    marginBottom: 16,
    textAlign: 'center',
  },

  /* UNIFIED BLACK ICON GRID ROW - CENTERED */
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
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  gridItemLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  countBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#3B82F6',
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

  /* Footer - Centered */
  copyrightText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 20,
  },

  /* Modal Styling */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#131C33',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
  },
  modalItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  modalItemRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 6,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  pickerBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  typePill: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#000000',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  typePillActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  typePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  typePillTextActive: {
    color: '#FFFFFF',
  },
  modalInput: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
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
