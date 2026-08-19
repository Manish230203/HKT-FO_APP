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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Search,
  Fingerprint,
  LayoutGrid,
  CheckCircle2,
  Clock,
  Building2,
  MapPin,
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
import { getAttendanceRecords } from '../../services/attendanceService';
import { getPunchRecords } from '../../services/db';
import { getDayVisitReports, getNightVisitReports, getGeneralVisits } from '../../services/visitService';

export default function DashboardScreen() {
  const { user, profileImage } = useAuth();
  const { todayRecord, profileData, refreshStatus } = useAttendance();
  const { t } = useLanguage();
  const router = useRouter();

  const [greeting, setGreeting] = useState('Good Day');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');


  const getCompanyLogo = () => {
    const compId = user?.company_id || (profileData as any)?.company_id;
    const compName = (user?.company_name || (profileData as any)?.company_name || '').toLowerCase();

    // Company OID 4 = Eagle Industrial Services Pvt. Ltd. (EISPL)
    // Company OID 1 = Unique Delta Force (UDF)
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
    const matchesClient = !newClientId ? true : String(s.client_id) === String(newClientId);
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
  const [completedVisits, setCompletedVisits] = useState<Array<{
    id: string;
    reportNo: string;
    clientName: string;
    siteName: string;
    visitType: string;
    date: string;
    officer: string;
    status: string;
  }>>([]);

  const loadClientsForModal = async () => {
    try {
      // Fetch ALL clients and sites (no empOid filter) so the modal shows
      // every available client/site that can be assigned to the employee.
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
    // Reset all modal sub-states before opening
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
    // Always reset sub-modal states to unblock touch events
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
      const empOidVal = user?.id || user?.empOid || user?.employee_id || 7558;
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
      alert(t('failed_assign_visit_db'));
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

      // 1. Sites allocated to current Field Officer
      const siteList = await getSites(empOidVal);
      setSites(siteList || []);
      if (siteList && siteList.length > 0) {
        setBaseSiteName(siteList[0].name || 'Main Base HQ');
      }

      // 2. Attendance (Check Active Punch-In from todayRecord or DB for current user)
      if (todayRecord && todayRecord.check_in && !todayRecord.check_out) {
        setIsCheckedIn(true);
        setSessionStart(new Date(todayRecord.check_in));
      } else {
        const empId = user?.employee_id || (user?.id ? String(user.id) : '');
        const punchLogs = await getPunchRecords(empId);
        const activePunch = punchLogs.find((r) => r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--');

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

      // 3. Planned / Pending Visits from backend API (Allocated to current officer)
      const planned = await getPlannedVisits(empOidVal);
      setPlannedVisits(planned || []);

      // 4. Completed Visit Reports from backend APIs (Submitted by current officer)
      const compiled: any[] = [];

      const dayReps = await getDayVisitReports(empOidVal);
      (dayReps || []).forEach((r: any) => {
        compiled.push({
          id: `day_${r.id}`,
          reportNo: r.reportNo || `DVR-${r.id}`,
          clientName: r.clientName || r.company || 'Client',
          siteName: r.site_name || r.unit || 'Site',
          visitType: 'Day Visit',
          date: r.visitDate || r.createdOn || today,
          officer: r.officer || user?.name || 'FO Officer',
          status: 'Completed',
        });
      });

      const nightReps = await getNightVisitReports(empOidVal);
      (nightReps || []).forEach((r: any) => {
        compiled.push({
          id: `night_${r.id}`,
          reportNo: r.reportNo || `NVR-${r.id}`,
          clientName: r.clientName || r.company || 'Client',
          siteName: r.site_name || r.unit || 'Site',
          visitType: 'Night Round',
          date: r.visitDate || r.createdOn || today,
          officer: r.officer || user?.name || 'FO Officer',
          status: 'Completed',
        });
      });

      const genReps = await getGeneralVisits(empOidVal);
      (genReps || []).forEach((r: any) => {
        compiled.push({
          id: `gen_${r.id}`,
          reportNo: r.report_no || `GVR-${r.id}`,
          clientName: r.client_name || 'Client',
          siteName: r.site_name || 'Site',
          visitType: 'General Audit',
          date: r.visit_date || today,
          officer: r.officer || user?.name || 'FO Officer',
          status: 'Completed',
        });
      });

      setCompletedVisits(compiled);
    } catch (e) {
      console.error('Failed to fetch dashboard data', e);
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
        {/* 1. Header Profile Card */}
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
                <Text style={styles.greetingText}>{greeting}</Text>
                <Text style={styles.userNameText}>{user?.name || 'Field Officer'}</Text>
                <Text style={styles.empIdText}>EMP ID: {user?.employee_id || 'EMP001'}</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.companyLogoContainer}>
              <Image source={getCompanyLogo()} style={styles.companyLogoImage} resizeMode="contain" />
            </View>
          </View>
        </View>

        {/* 2. Search Bar */}
        <View style={styles.searchBarContainer}>
          <Search color="#64748B" size={20} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('search_placeholder')}
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* 3. Session Card */}
        <View style={styles.standardCard}>
          <View style={styles.sessionHeaderRow}>
            <View style={[styles.dot, isCheckedIn ? styles.dotActive : styles.dotInactive]} />
            <Text style={styles.sessionStatusText}>
              {isCheckedIn ? t('active_session') : t('no_active_session')}
            </Text>
          </View>
          <Text style={styles.timerDigits}>{sessionTime}</Text>
        </View>

        {/* 4. Action Cards (MANUAL ATTENDANCE & ADD VISIT) */}
        <View style={styles.actionCardsRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/mark-attendance')}
            style={styles.actionCard}
          >
            <View style={[styles.actionIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
              <Fingerprint color="#3B82F6" size={30} />
            </View>
            <Text style={styles.actionCardTitle}>{t('mark_attendance').toUpperCase().replace(' ', '\n')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleOpenAddVisitModal}
            style={styles.actionCard}
          >
            <View style={[styles.actionIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <PlusCircle color="#10B981" size={30} />
            </View>
            <Text style={styles.actionCardTitle}>{t('add_visit').toUpperCase().replace(' ', '\n')}</Text>
          </TouchableOpacity>
        </View>

        {/* 5. FIELD OFFICER VISITS SECTION */}
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
                <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Clock color="#3B82F6" size={24} />
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
                <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <CheckCircle2 color="#10B981" size={24} />
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

        {/* 6. ATTENDANCE CARD */}
        <View style={styles.standardCard}>
          <Text style={styles.sectionTitle}>{t('attendance').toUpperCase()}</Text>

          <View style={styles.gridItemsRow}>
            <TouchableOpacity
              onPress={() => router.push('/attendance?view=dashboard')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <LayoutGrid color="#3B82F6" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>{t('dashboard')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/attendance?view=logs')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <CheckCircle2 color="#10B981" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>{t('attendance_log')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/attendance?view=missed')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <Clock color="#F59E0B" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>{t('missed_punches')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 7. PROFILE & SETTINGS CARD */}
        <View style={styles.standardCard}>
          <Text style={styles.sectionTitle}>{`${t('profile')} & ${t('settings')}`.toUpperCase()}</Text>

          <View style={styles.gridItemsRow}>
            <TouchableOpacity
              onPress={() => router.push('/profile')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(236, 72, 153, 0.15)' }]}>
                <User color="#EC4899" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>{t('profile')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/settings')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(148, 163, 184, 0.15)' }]}>
                <Settings color="#94A3B8" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>{t('settings')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 8. SITES SECTION */}
        <View style={styles.standardCard}>
          <Text style={styles.sectionTitle}>{t('my_sites').toUpperCase()}</Text>

          <View style={styles.gridItemsRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/sites?type=base')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <Building2 color="#3B82F6" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>{t('my_base_site')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/sites?type=allocated')}
              style={styles.gridItem}
            >
              <View style={styles.gridIconCircleWrapper}>
                <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <MapPin color="#10B981" size={24} />
                </View>
                {sites.length > 0 && (
                  <View style={[styles.countBadge, { backgroundColor: '#10B981' }]}>
                    <Text style={styles.countBadgeText}>{sites.length}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.gridItemLabel}>{t('assigned_sites')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.copyrightText}>© 2026 HUMANKIND TECHNOLOGY</Text>
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
                      <Text style={{ color: '#94A3B8', fontSize: 13 }}>No clients found.</Text>
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
                      <Text style={{ color: '#94A3B8', fontSize: 13 }}>{t('no_sites_found')}</Text>
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
                  {/* Select Client */}
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

                  {/* Select Site */}
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

                  {/* Planning Type */}
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

                  {/* Visit Frequency */}
                  <Text style={styles.fieldLabel}>{t('visit_frequency')}</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    value={newVisitFrequency}
                    onChangeText={setNewVisitFrequency}
                    placeholder="e.g. 1"
                    placeholderTextColor="#64748B"
                  />

                  {/* Date Selection: Single vs Range */}
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

                  {/* Assigning Officer */}
                  <Text style={styles.fieldLabel}>{t('assigned_officer')}</Text>
                  <TextInput
                    style={[styles.modalInput, { opacity: 0.7 }]}
                    value={user?.name || 'Amit Kulkarni'}
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
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
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
    backgroundColor: '#1E293B',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
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
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
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

  /* UNIFIED STANDARD CARD DESIGN (Matching Attendance Container Card) */
  standardCard: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  /* Header Card Details */
  headerProfileCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userProfileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 2,
    borderColor: '#3B82F6',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
  },
  userTextCol: {
    justifyContent: 'center',
  },
  greetingText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  userNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  empIdText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '700',
    marginTop: 2,
  },
  companyLogoContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginLeft: 12,
  },
  companyLogoImage: {
    width: '100%',
    height: '100%',
  },

  /* Search Bar */
  searchBarContainer: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },

  /* Session Blue Card */
  sessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotActive: {
    backgroundColor: '#10B981',
  },
  dotInactive: {
    backgroundColor: '#93C5FD',
  },
  sessionStatusText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  timerDigits: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '800',
    marginTop: 8,
    letterSpacing: 1,
  },

  /* Action Cards Row */
  actionCardsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 20,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    height: 150,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  actionIconBox: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  actionCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 18,
    letterSpacing: 0.3,
  },

  /* Features Container Section Titles */
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  sectionTitleNoMargin: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.8,
  },

  /* UNIFIED ICON GRID ROW (ATTENDANCE / VISITS / SETTINGS / SITES) */
  gridItemsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  gridItem: {
    alignItems: 'center',
    flex: 1,
  },
  gridIconCircleWrapper: {
    position: 'relative',
  },
  gridIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 20,
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

  collapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  collapseText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
  },

  /* Visits Section with Tab Toggle */
  tableHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  tabToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: '#3B82F6',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
  },
  emptyTableBox: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyTableText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  tableContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeadRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  thCell: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  reportNoText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
  },
  dateSubText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  siteNameCell: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  clientSubText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  visitTypeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 14,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  visitsDoneText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 3,
    fontWeight: '500',
  },
  startVisitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  startVisitText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  copyrightText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 20,
  },
});
