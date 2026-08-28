import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  CheckCircle2,
  Play,
  CalendarDays,
  Building2,
  AlertCircle,
  RefreshCw,
  LogIn,
  LogOut,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useAttendance } from '../../context/AttendanceContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  getPlannedVisits,
  PlannedVisit,
  getActiveSiteVisitSession,
  checkInSiteVisit,
  checkOutSiteVisit,
  ActiveSiteSession,
} from '../../services/siteService';
import { getDayVisitReports, getNightVisitReports, getGeneralVisits, sendReportEmail } from '../../services/visitService';
import { getActiveCheckIns, saveActiveCheckIns, clearActiveCheckIn } from '../../services/db';
import { THEME } from '../../constants/theme';
import * as Location from 'expo-location';

import { Modal } from 'react-native';
import { X, User, MapPin, Building, FileText, Mail, Clock as ClockIcon, ShieldAlert, LogOut as LogOutIcon, Navigation } from 'lucide-react-native';

type CompletedVisit = {
  id: string;
  reportNo: string;
  clientName: string;
  siteName: string;
  visitType: string;
  date: string;
  officer: string;
  status: string;
  siteId?: number | string;
  emailAccess?: number | boolean;
  rawReport?: any;
};

// Haversine distance calculation in meters
function calculateHaversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function VisitsScreen() {
  const { user } = useAuth();
  const { todayRecord } = useAttendance();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();

  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [loading, setLoading] = useState(false);
  const [plannedVisits, setPlannedVisits] = useState<PlannedVisit[]>([]);
  const [completedVisits, setCompletedVisits] = useState<CompletedVisit[]>([]);
  const [selectedReport, setSelectedReport] = useState<CompletedVisit | null>(null);

  // Active Checked-In Site Visits State (persisted in AsyncStorage / db.ts)
  const [activeCheckIns, setActiveCheckIns] = useState<Record<string, { checkInTime: string; date: string; siteId?: string | number; siteName?: string; clientId?: string | number }>>({});
  
  // Backend Active Site Session State (SITE_VISIT_SESSIONS table)
  const [activeBackendSession, setActiveBackendSession] = useState<ActiveSiteSession | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [liveDurationMins, setLiveDurationMins] = useState<number>(0);

  // Dynamic Live Duration Timer for Active Site Visit Session
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (activeBackendSession && activeBackendSession.start_time) {
      const calcDuration = () => {
        const startMs = new Date(activeBackendSession.start_time).getTime();
        const nowMs = Date.now();
        const mins = Math.max(0, Math.floor((nowMs - startMs) / 60000));
        setLiveDurationMins(mins);
      };
      calcDuration();
      timer = setInterval(calcDuration, 5000);
    } else {
      setLiveDurationMins(0);
    }
    return () => clearInterval(timer);
  }, [activeBackendSession]);

  // Active Visit Check-out Enforcer Modal State
  const [enforcerModal, setEnforcerModal] = useState<{
    visible: boolean;
    pendingVisit?: PlannedVisit;
    activeSiteName?: string;
    activeStartTime?: string;
  }>({ visible: false });

  const getEmpOid = () => {
    if (!user) return 7558;
    return user.id || (user as any).oid || user.employee_id || 7558;
  };

  useFocusEffect(
    useCallback(() => {
      loadStoredCheckIns();
      fetchCurrentLocation();
      fetchActiveSession();
    }, [])
  );

  const fetchCurrentLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (loc && loc.coords) {
        setUserLocation(loc.coords);
      }
    } catch (e) {
      console.warn('Could not fetch current location for geofence:', e);
    }
  };

  const fetchActiveSession = async () => {
    const empOid = getEmpOid();
    if (!empOid) return;
    try {
      const active = await getActiveSiteVisitSession(empOid);
      setActiveBackendSession(active);
    } catch (e) {
      console.warn('Error fetching active site session:', e);
    }
  };

  const loadStoredCheckIns = async () => {
    try {
      const stored = await getActiveCheckIns();
      if (stored) {
        setActiveCheckIns(stored);
      }
    } catch (e) {
      console.error('Failed to load active checkins', e);
    }
  };

  const handleCheckIn = async (pv: PlannedVisit) => {
    // 0. Enforce duty attendance punch-in requirement
    if (!todayRecord || !todayRecord.check_in || todayRecord.check_out) {
      Alert.alert(
        'Punch-In Required',
        'You must punch in for duty attendance before starting or checking into a site visit.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Mark Attendance', onPress: () => router.push('/(tabs)/attendance') }
        ]
      );
      return;
    }

    const empOid = getEmpOid();
    
    // 1. Check if officer has an active IN_PROGRESS session at a different site
    if (activeBackendSession && activeBackendSession.site_id !== Number(pv.siteId)) {
      setEnforcerModal({
        visible: true,
        pendingVisit: pv,
        activeSiteName: activeBackendSession.site_name,
        activeStartTime: activeBackendSession.start_time,
      });
      return;
    }

    // 2. Perform Geofence Validation (Compare Site Lat/Long vs Officer Lat/Long)
    if (pv.latitude && pv.longitude && userLocation) {
      const dist = calculateHaversineDistanceMeters(
        userLocation.latitude,
        userLocation.longitude,
        Number(pv.latitude),
        Number(pv.longitude)
      );

      // Geofence cutoff: 200 meters
      if (dist > 200) {
        Alert.alert(
          'Geofence Warning: Outside Site Radius',
          `You are currently ${Math.round(dist)} meters away from ${pv.siteName || 'Site'}.\n\nPlease move within 200 meters of the site to check in.`,
          [
            { text: 'Refresh Location', onPress: fetchCurrentLocation },
            { text: 'OK', style: 'cancel' }
          ]
        );
        return;
      }
    }

    // 3. Trigger Backend Check-in in SITE_VISIT_SESSIONS
    try {
      const res = await checkInSiteVisit({
        employee_id: empOid,
        site_id: Number(pv.siteId || 1),
        site_name: pv.siteName,
        latitude: userLocation?.latitude,
        longitude: userLocation?.longitude,
      });

      if (res && res.success) {
        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const todayStr = new Date().toISOString().split('T')[0];
        const newCheckIns = {
          ...activeCheckIns,
          [pv.id]: {
            checkInTime: nowTime,
            date: todayStr,
            siteId: pv.siteId,
            siteName: pv.siteName,
            clientId: pv.clientId,
          },
        };
        setActiveCheckIns(newCheckIns);
        await saveActiveCheckIns(newCheckIns);
        await fetchActiveSession();

        Alert.alert(
          'Checked-In Successfully',
          `Check-In recorded at ${nowTime} for site: ${pv.siteName || 'Site'}.\n\nSite visit session is active in SITE_VISIT_SESSIONS.`
        );
      } else if (res && res.has_active_session) {
        setEnforcerModal({
          visible: true,
          pendingVisit: pv,
          activeSiteName: res.active_session?.site_name,
          activeStartTime: res.active_session?.start_time,
        });
      }
    } catch (err: any) {
      console.error('Check-in error:', err);
      Alert.alert('Check-In Error', err?.response?.data?.message || 'Failed to check in to site visit.');
    }
  };

  const handleForceCheckoutPreviousVisit = async () => {
    const empOid = getEmpOid();
    try {
      const res = await checkOutSiteVisit({
        employee_id: empOid,
        latitude: userLocation?.latitude,
        longitude: userLocation?.longitude,
      });

      if (res && res.success) {
        Alert.alert('Checked Out Previous Visit', res.message || 'Successfully checked out of previous visit.');
        setActiveBackendSession(null);
        const pendingToStart = enforcerModal.pendingVisit;
        setEnforcerModal({ visible: false });

        if (pendingToStart) {
          setTimeout(() => {
            handleCheckIn(pendingToStart);
          }, 400);
        }
      } else {
        Alert.alert('Check-Out Error', res?.message || 'Could not check out of previous visit.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to check out of previous visit.');
    }
  };

  const handleCheckOutAndReport = async (pv: PlannedVisit) => {
    const empOid = getEmpOid();
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const activeData = activeCheckIns[pv.id];
    const cIn = activeData?.checkInTime || (activeBackendSession && activeBackendSession.start_time ? new Date(activeBackendSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '09:00');
    const cOut = nowTime;

    // Call backend Check-Out endpoint for SITE_VISIT_SESSIONS
    try {
      await checkOutSiteVisit({
        employee_id: empOid,
        site_id: Number(pv.siteId),
        latitude: userLocation?.latitude,
        longitude: userLocation?.longitude,
      });
      await fetchActiveSession();
    } catch (e) {
      console.warn('Check-out warning:', e);
    }

    router.push(
      `/visits/select-type?clientId=${pv.clientId || ''}&siteId=${pv.siteId || ''}&plannedId=${pv.id}&checkInTime=${cIn}&checkOutTime=${cOut}`
    );
  };

  // Email Form State (Single Modal)
  const [isEmailFormOpen, setIsEmailFormOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  const isEmailAllowed = (report: CompletedVisit | null) => {
    if (!report) return false;
    const r = report.rawReport || {};
    const access = r.emailAccess !== undefined ? r.emailAccess : (r.email_access !== undefined ? r.email_access : (report.emailAccess !== undefined ? report.emailAccess : 1));
    return access === 1 || access === '1' || access === true;
  };

  const handleOpenEmailForm = (report: CompletedVisit | null) => {
    if (!report) return;
    if (!isEmailAllowed(report)) {
      Alert.alert(
        'Email Access Disabled',
        'Email sending is disabled for this branch in branch settings. Please contact your administrator.'
      );
      return;
    }
    setSelectedReport(report);
    setRecipientEmail('');
    setEmailSubject(`Field Officer Report - ${report.reportNo}`);
    setEmailMessage(
      `Dear Sir/Madam,\n\nPlease find the details for Field Officer ${report.visitType} Report (${report.reportNo}) for ${report.siteName} (${report.clientName}).\n\nThank you.`
    );
    setIsEmailFormOpen(true);
  };

  const handleSendEmail = async () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid recipient email address.');
      return;
    }

    setEmailSending(true);
    try {
      const targetReport = selectedReport;
      const branchIdVal = targetReport?.rawReport?.branchId || targetReport?.rawReport?.branch_id || targetReport?.rawReport?.BRANCH;
      const siteIdVal = targetReport?.rawReport?.site_id || targetReport?.rawReport?.siteId || targetReport?.rawReport?.SITE || targetReport?.siteId;

      const res = await sendReportEmail({
        email: recipientEmail.trim(),
        subject: emailSubject,
        message: emailMessage,
        branchId: branchIdVal,
        siteId: siteIdVal,
      });

      if (res && res.success) {
        Alert.alert('Email Sent', res.message || `Report email sent successfully to ${recipientEmail}!`);
        setIsEmailFormOpen(false);
      } else {
        Alert.alert('Failed to Send', res?.message || 'Failed to send report email.');
      }
    } catch (err: any) {
      console.error('Send email error:', err);
      const detail = err?.response?.data?.detail || err?.message || '';
      const status = err?.response?.status;
      if (status === 403 || detail.toLowerCase().includes('disabled') || detail.toLowerCase().includes('access') || detail.toLowerCase().includes('email_access')) {
        Alert.alert(
          'Access Denied',
          'You do not have access to send email reports for this branch/site. Email sending is disabled in branch settings.'
        );
      } else {
        Alert.alert('Error', detail || 'Failed to send email report. Please check recipient email and network.');
      }
    } finally {
      setEmailSending(false);
    }
  };

  // Sync tab from navigation params each time they change
  useEffect(() => {
    if (params.tab === 'completed') {
      setActiveTab('completed');
    } else {
      setActiveTab('pending');
    }
  }, [params.tab]);

  const fetchVisits = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const empOidVal = user?.id || user?.empOid || user?.employee_id || 7558;

      const planned = await getPlannedVisits(empOidVal);
      setPlannedVisits(planned || []);

      const compiled: CompletedVisit[] = [];
      const seenIds = new Set<string>();

      const dayReps = await getDayVisitReports(empOidVal);
      (dayReps || []).forEach((r: any, idx: number) => {
        const rawOid = String(r.id || r.oid || idx);
        const itemKey = rawOid.startsWith('day_') ? rawOid : `day_${rawOid}`;
        if (!seenIds.has(itemKey)) {
          seenIds.add(itemKey);
          compiled.push({
            id: itemKey,
            reportNo: r.reportNo || r.report_id || `DVR-${rawOid}`,
            clientName: r.client_name || r.clientName || r.company || 'ADIENT INDIA PVT LTD',
            siteName: r.site_name || r.unit || 'ADIENT - PIMPRI',
            visitType: 'Day Visit',
            date: r.visitDate || r.visit_date || r.createdOn || today,
            officer: r.officer || user?.name || 'Amit Kulkarni',
            status: 'Completed',
            emailAccess: r.emailAccess !== undefined ? r.emailAccess : (r.email_access !== undefined ? r.email_access : 1),
            rawReport: r,
          });
        }
      });

      const nightReps = await getNightVisitReports(empOidVal);
      (nightReps || []).forEach((r: any, idx: number) => {
        const rawOid = String(r.id || r.oid || idx);
        const itemKey = rawOid.startsWith('night_') ? rawOid : `night_${rawOid}`;
        if (!seenIds.has(itemKey)) {
          seenIds.add(itemKey);
          compiled.push({
            id: itemKey,
            reportNo: r.reportNo || r.report_id || `NVR-${rawOid}`,
            clientName: r.client_name || r.clientName || r.company || 'ADIENT INDIA PVT LTD',
            siteName: r.site_name || r.unit || 'ADIENT - PIMPRI',
            visitType: 'Night Round',
            date: r.visitDate || r.visit_date || r.createdOn || today,
            officer: r.officer || user?.name || 'Amit Kulkarni',
            status: 'Completed',
            emailAccess: r.emailAccess !== undefined ? r.emailAccess : (r.email_access !== undefined ? r.email_access : 1),
            rawReport: r,
          });
        }
      });

      const genReps = await getGeneralVisits(empOidVal);
      (genReps || []).forEach((r: any, idx: number) => {
        const rawOid = String(r.id || r.oid || idx);
        const itemKey = rawOid.startsWith('gen_') ? rawOid : `gen_${rawOid}`;
        if (!seenIds.has(itemKey)) {
          seenIds.add(itemKey);
          compiled.push({
            id: itemKey,
            reportNo: r.report_id || r.report_no || r.reportNo || `GVR-${rawOid}`,
            clientName: r.client_name || r.clientName || 'ADIENT INDIA PVT LTD',
            siteName: r.site_name || r.siteName || 'ADIENT - PIMPRI',
            visitType: 'General Audit',
            date: r.visit_date || r.visitDate || today,
            officer: r.officer || user?.name || 'Amit Kulkarni',
            status: 'Completed',
            emailAccess: r.emailAccess !== undefined ? r.emailAccess : (r.email_access !== undefined ? r.email_access : 1),
            rawReport: r,
          });
        }
      });

      setCompletedVisits(compiled);
    } catch (e) {
      console.error('Failed to fetch visits', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchVisits();
    }, [])
  );

  const isVisitOverdue = (pv: PlannedVisit) => {
    if (pv.status === 'Completed') return false;
    if (pv.status === 'Overdue') return true;
    const periodStr = pv.plannedPeriod || pv.date || '';
    if (periodStr) {
      const parts = periodStr.split('-');
      const endDateStr = parts[parts.length - 1].trim();
      const endDate = new Date(endDateStr);
      if (!isNaN(endDate.getTime())) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (endDate < today) return true;
      }
    }
    return false;
  };

  const pendingVisits = plannedVisits.filter((pv) => {
    if (pv.status === 'Completed') return false;
    const done = pv.completedVisits || 0;
    const freq = pv.visitFrequency
      ? parseInt(String(pv.visitFrequency), 10)
      : pv.frequency
      ? parseInt(String(pv.frequency), 10)
      : 1;
    return done < freq || freq === 0;
  });

  const getStatusInfo = (pv: PlannedVisit) => {
    const overdue = isVisitOverdue(pv);
    const done = pv.completedVisits || 0;
    const total =
      (pv.visitFrequency
        ? parseInt(String(pv.visitFrequency), 10)
        : pv.frequency
        ? parseInt(String(pv.frequency), 10)
        : 1) || 1;

    if (overdue) return { label: t('overdue'), color: '#EF4444', bg: 'rgba(239,68,68,0.15)', done, total };
    if (done > 0) return { label: t('in_progress'), color: '#3B82F6', bg: 'rgba(59,130,246,0.15)', done, total };
    return { label: t('pending'), color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', done, total };
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0A1128" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color="#FFFFFF" size={22} />
        </TouchableOpacity>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>
            {activeTab === 'pending' ? t('pending_visits') : t('completed_visits')}
          </Text>
          <Text style={styles.headerSub}>
            {activeTab === 'pending'
              ? `${pendingVisits.length} ${t('pending')}`
              : `${completedVisits.length} ${t('completed')}`}
          </Text>
        </View>
        <TouchableOpacity onPress={fetchVisits} style={styles.refreshBtn}>
          <RefreshCw color="#3B82F6" size={20} />
        </TouchableOpacity>
      </View>


      {/* ACTIVE SITE VISIT SESSION BANNER */}
      {activeBackendSession && (
        <View style={styles.activeSessionBanner}>
          <View style={styles.activeSessionTextCol}>
            <View style={styles.activeSessionPulseRow}>
              <View style={styles.pulseDot} />
              <Text style={styles.activeSessionTitle}>ACTIVE SITE VISIT SESSION</Text>
            </View>
            <Text style={styles.activeSessionSiteName}>{activeBackendSession.site_name}</Text>
            <Text style={styles.activeSessionSubText}>
              Started at {new Date(activeBackendSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Duration: {liveDurationMins} mins
            </Text>
          </View>
          <TouchableOpacity
            style={styles.activeSessionCheckoutBtn}
            onPress={handleForceCheckoutPreviousVisit}
          >
            <LogOutIcon color="#FFFFFF" size={15} style={{ marginRight: 5 }} />
            <Text style={styles.activeSessionCheckoutBtnText}>Check-Out</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchVisits} tintColor="#3B82F6" />}
      >
        {/* PENDING TAB */}
        {activeTab === 'pending' && (
          <>
            {pendingVisits.length === 0 ? (
              <View style={styles.emptyBox}>
                <CheckCircle2 color="#10B981" size={48} style={{ marginBottom: 12 }} />
                <Text style={styles.emptyTitle}>{t('all_clear')}</Text>
                <Text style={styles.emptySubtitle}>{t('no_pending_visits_desc')}</Text>
              </View>
            ) : (
              pendingVisits.map((pv) => {
                const status = getStatusInfo(pv);
                
                const hasSiteCoords = pv.latitude !== null && pv.latitude !== undefined && Number(pv.latitude) !== 0 &&
                                       pv.longitude !== null && pv.longitude !== undefined && Number(pv.longitude) !== 0;

                let isOutsideGeofence = false;
                let distanceMeters: number | null = null;

                if (hasSiteCoords && userLocation) {
                  distanceMeters = Math.round(calculateHaversineDistanceMeters(
                    userLocation.latitude,
                    userLocation.longitude,
                    Number(pv.latitude),
                    Number(pv.longitude)
                  ));
                  isOutsideGeofence = distanceMeters > 200;
                } else if (!hasSiteCoords) {
                  isOutsideGeofence = true;
                }

                // Check if this planned visit site matches the active backend session
                const isCurrentActiveSite = activeBackendSession && Number(activeBackendSession.site_id) === Number(pv.siteId);

                return (
                  <View key={pv.id} style={styles.visitCard}>
                    {/* Card Top: Plan Code + Status Badge */}
                    <View style={styles.cardTopRow}>
                      <View style={styles.planCodeBadge}>
                        <Text style={styles.planCodeText}>{pv.planCode || 'PLAN'}</Text>
                      </View>
                      {isCurrentActiveSite ? (
                        <View style={[styles.statusBadge, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                          <ClockIcon color="#10B981" size={12} style={{ marginRight: 4 }} />
                          <Text style={[styles.statusBadgeText, { color: '#10B981', fontWeight: '800' }]}>
                            Active Visit Session
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: status.color }]}>
                            {status.label}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Main Info */}
                    <Text style={styles.siteNameText}>{pv.siteName || 'Unassigned Site'}</Text>
                    
                    <View style={styles.metaRow}>
                      <Building color="#64748B" size={14} style={{ marginRight: 6 }} />
                      <Text style={styles.metaText}>{pv.clientName || 'Client'}</Text>
                    </View>

                    <View style={styles.metaRow}>
                      <CalendarDays color="#64748B" size={14} style={{ marginRight: 6 }} />
                      <Text style={styles.metaText}>{pv.plannedPeriod || pv.date || 'Weekly Visit'}</Text>
                    </View>

                    {/* Card Bottom: Progress Bar + Check-In / Check-Out Button */}
                    <View style={styles.cardBottomRow}>
                      <View style={styles.progressWrap}>
                        <Text style={styles.progressLabel}>
                          {status.done}/{status.total} {t('visits_done')}
                        </Text>
                        <View style={styles.progressBarBg}>
                          <View
                            style={[
                              styles.progressBarFill,
                              {
                                width: `${Math.min((status.done / status.total) * 100, 100)}%`,
                                backgroundColor: status.color,
                              },
                            ]}
                          />
                        </View>
                      </View>

                      {isCurrentActiveSite ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={[styles.startBtn, { backgroundColor: '#F59E0B' }]}
                          onPress={() => handleCheckOutAndReport(pv)}
                        >
                          <LogOut color="#FFFFFF" size={13} style={{ marginRight: 4 }} />
                          <Text style={styles.startBtnText}>Check-Out & Report</Text>
                        </TouchableOpacity>
                      ) : !hasSiteCoords ? (
                        <View style={{ alignItems: 'flex-end' }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: 'rgba(245, 158, 11, 0.15)',
                              borderWidth: 1,
                              borderColor: 'rgba(245, 158, 11, 0.4)',
                              borderRadius: 8,
                              paddingHorizontal: 8,
                              paddingVertical: 5,
                            }}
                          >
                            <AlertCircle color="#F59E0B" size={12} style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#F59E0B' }}>
                              Site Coords Missing
                            </Text>
                          </View>
                        </View>
                      ) : isOutsideGeofence ? (
                        <View style={{ alignItems: 'flex-end' }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: 'rgba(239, 68, 68, 0.15)',
                              borderWidth: 1,
                              borderColor: 'rgba(239, 68, 68, 0.4)',
                              borderRadius: 8,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              marginBottom: 4,
                            }}
                          >
                            <Navigation color="#EF4444" size={12} style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444' }}>
                              {distanceMeters ? `${distanceMeters}m Away` : 'Not at Site'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={fetchCurrentLocation}
                            style={{ flexDirection: 'row', alignItems: 'center' }}
                          >
                            <RefreshCw color="#60A5FA" size={10} style={{ marginRight: 3 }} />
                            <Text style={{ fontSize: 10, fontWeight: '600', color: '#60A5FA' }}>Refresh Location</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={[styles.startBtn, { backgroundColor: '#10B981' }]}
                          onPress={() => handleCheckIn(pv)}
                        >
                          <LogIn color="#FFFFFF" size={13} style={{ marginRight: 4 }} />
                          <Text style={styles.startBtnText}>
                            {distanceMeters ? `Check-In (${distanceMeters}m)` : 'Check-In Now'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* COMPLETED TAB */}
        {activeTab === 'completed' && (
          <>
            {completedVisits.length === 0 ? (
              <View style={styles.emptyBox}>
                <AlertCircle color="#64748B" size={48} style={{ marginBottom: 12 }} />
                <Text style={styles.emptyTitle}>{t('no_reports_yet')}</Text>
                <Text style={styles.emptySubtitle}>{t('no_completed_visits_desc')}</Text>
              </View>
            ) : (
              completedVisits.map((visit, index) => (
                <TouchableOpacity
                  key={`${visit.id}_${index}`}
                  activeOpacity={0.85}
                  onPress={() => setSelectedReport(visit)}
                  style={styles.visitCard}
                >
                  {/* Top row: Visit Type Badge + Completed Status */}
                  <View style={styles.cardTopRow}>
                    <View style={[
                      styles.visitTypeBadge,
                      visit.visitType.includes('Day') && { backgroundColor: 'rgba(245,158,11,0.15)' },
                      visit.visitType.includes('Night') && { backgroundColor: 'rgba(129,140,248,0.15)' },
                      visit.visitType.includes('General') && { backgroundColor: 'rgba(52,211,153,0.15)' },
                    ]}>
                      <Text style={[
                        styles.visitTypeBadgeText,
                        visit.visitType.includes('Day') && { color: '#F59E0B' },
                        visit.visitType.includes('Night') && { color: '#818CF8' },
                        visit.visitType.includes('General') && { color: '#34D399' },
                      ]}>
                        {visit.visitType}
                      </Text>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                      <CheckCircle2 color="#10B981" size={12} style={{ marginRight: 4 }} />
                      <Text style={[styles.statusBadgeText, { color: '#10B981' }]}>{t('completed')}</Text>
                    </View>
                  </View>

                  {/* Report ID */}
                  <Text style={styles.reportNoText} numberOfLines={1} ellipsizeMode="tail">
                    {visit.reportNo}
                  </Text>

                  {/* Site & Client */}
                  <Text style={styles.siteNameText} numberOfLines={1}>
                    {visit.siteName}
                  </Text>
                  <Text style={styles.clientNameText} numberOfLines={1}>{visit.clientName}</Text>

                  <View style={styles.divider} />

                  {/* Date Footer & Email Action */}
                  <View style={styles.cardBottomRow}>
                    <View style={styles.metaItem}>
                      <CalendarDays color="#64748B" size={13} style={{ marginRight: 4 }} />
                      <Text style={styles.metaText}>{visit.date}</Text>
                    </View>

                    <TouchableOpacity
                      activeOpacity={isEmailAllowed(visit) ? 0.85 : 0.6}
                      onPress={() => handleOpenEmailForm(visit)}
                      style={[styles.cardEmailBtn, !isEmailAllowed(visit) && styles.disabledCardEmailBtn]}
                    >
                      <Mail color={isEmailAllowed(visit) ? "#10B981" : "#64748B"} size={14} style={{ marginRight: 4 }} />
                      <Text style={[styles.cardEmailBtnText, !isEmailAllowed(visit) && styles.disabledCardEmailBtnText]}>
                        {isEmailAllowed(visit) ? 'Send Email' : 'Email Disabled'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* COMPLETED REPORT & EMAIL MODAL */}
      <Modal
        visible={!!selectedReport}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setSelectedReport(null);
          setIsEmailFormOpen(false);
        }}
      >
        <View style={styles.detailOverlay}>
          <View style={[styles.detailContainer, isEmailFormOpen ? { padding: 20 } : null]}>
            {isEmailFormOpen ? (
              /* --- EMAIL FORM VIEW --- */
              <View>
                <View style={styles.detailHeader}>
                  <TouchableOpacity
                    onPress={() => setIsEmailFormOpen(false)}
                    style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                  >
                    <ArrowLeft color="#3B82F6" size={20} style={{ marginRight: 8 }} />
                    <View>
                      <Text style={styles.detailTitle}>Send Report via Email</Text>
                      <Text style={styles.detailSubtitle}>{selectedReport?.reportNo}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedReport(null);
                      setIsEmailFormOpen(false);
                    }}
                    style={styles.detailCloseBtn}
                  >
                    <X color="#94A3B8" size={22} />
                  </TouchableOpacity>
                </View>

                <View style={{ marginVertical: 14 }}>
                  <Text style={styles.emailFormLabel}>RECIPIENT EMAIL *</Text>
                  <TextInput
                    style={styles.emailTextInput}
                    placeholder="client.rep@company.com"
                    placeholderTextColor="#64748B"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={recipientEmail}
                    onChangeText={setRecipientEmail}
                  />

                  <Text style={[styles.emailFormLabel, { marginTop: 12 }]}>SUBJECT</Text>
                  <TextInput
                    style={styles.emailTextInput}
                    placeholder="Email Subject..."
                    placeholderTextColor="#64748B"
                    value={emailSubject}
                    onChangeText={setEmailSubject}
                  />

                  <Text style={[styles.emailFormLabel, { marginTop: 12 }]}>MESSAGE</Text>
                  <TextInput
                    style={[styles.emailTextInput, { height: 90, textAlignVertical: 'top' }]}
                    placeholder="Enter custom email message..."
                    placeholderTextColor="#64748B"
                    multiline
                    numberOfLines={4}
                    value={emailMessage}
                    onChangeText={setEmailMessage}
                  />
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={emailSending}
                  onPress={handleSendEmail}
                  style={styles.sendEmailSubmitBtn}
                >
                  {emailSending ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Mail color="#FFFFFF" size={18} style={{ marginRight: 8 }} />
                      <Text style={styles.sendEmailSubmitBtnText}>SEND EMAIL REPORT</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              /* --- REPORT PREVIEW VIEW --- */
              <>
                {/* Header Close Bar */}
                <View style={styles.detailHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailTitle}>{selectedReport?.reportNo}</Text>
                    <Text style={styles.detailSubtitle}>{selectedReport?.visitType}</Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={isEmailAllowed(selectedReport) ? 0.85 : 0.6}
                    onPress={() => handleOpenEmailForm(selectedReport)}
                    style={[styles.headerEmailBtn, !isEmailAllowed(selectedReport) && styles.disabledHeaderEmailBtn]}
                  >
                    <Mail color={isEmailAllowed(selectedReport) ? "#10B981" : "#64748B"} size={16} style={{ marginRight: 5 }} />
                    <Text style={[styles.headerEmailBtnText, !isEmailAllowed(selectedReport) && styles.disabledHeaderEmailBtnText]}>
                      {isEmailAllowed(selectedReport) ? 'Send Email' : 'Email Disabled'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setSelectedReport(null);
                      setIsEmailFormOpen(false);
                    }}
                    style={styles.detailCloseBtn}
                  >
                    <X color="#94A3B8" size={22} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
                  {/* Corporate Banner Header (Exact WEB Match) */}
                  <View style={styles.previewCorporateBanner}>
                    <View style={styles.bannerHeaderTopRow}>
                      <Building2 color="#60A5FA" size={20} />
                      <Text style={styles.companyNameTitle}>Unique Delta Force Security Pvt. Ltd.</Text>
                    </View>

                    <View style={styles.reportTitleBanner}>
                      <Text style={styles.reportMainHeading}>
                        {selectedReport?.visitType === 'Day Visit'
                          ? 'FIELD OFFICER DAY VISIT REPORT'
                          : selectedReport?.visitType === 'Night Round'
                          ? 'FIELD OFFICER NIGHT VISIT REPORT'
                          : 'FIELD OFFICER GENERAL VISIT REPORT'}
                      </Text>
                      <Text style={styles.reportIdTag}>REPORT ID : {selectedReport?.reportNo}</Text>
                    </View>

                    <View style={styles.bannerDateRow}>
                      <ClockIcon color="#94A3B8" size={13} style={{ marginRight: 4 }} />
                      <Text style={styles.bannerDateText}>
                        DATE : {selectedReport?.date} | {selectedReport?.rawReport?.['check-in_time'] || selectedReport?.rawReport?.start_time || selectedReport?.rawReport?.startTime || '09:00'} - {selectedReport?.rawReport?.['check-out_time'] || selectedReport?.rawReport?.end_time || selectedReport?.rawReport?.endTime || '17:00'}
                      </Text>
                    </View>
                  </View>

                  {/* 1. General Information Card (Navy Section Header) */}
                  <View style={styles.detailSectionCard}>
                    <View style={styles.navySectionTitleBox}>
                      <Text style={styles.navySectionTitle}>GENERAL INFORMATION</Text>
                    </View>
                    <View style={styles.gridInfoBox}>
                      <View style={styles.infoRowItem}>
                        <Text style={styles.gridLabel}>Client Name</Text>
                        <Text style={styles.gridValue}>{selectedReport?.clientName || 'ADIENT INDIA PVT LTD'}</Text>
                      </View>
                      <View style={styles.infoRowItem}>
                        <Text style={styles.gridLabel}>Site Name</Text>
                        <Text style={styles.gridValue}>{selectedReport?.siteName || 'ADIENT - PIMPRI'}</Text>
                      </View>
                      <View style={styles.infoRowItem}>
                        <Text style={styles.gridLabel}>Shift</Text>
                        <Text style={styles.gridValue}>{selectedReport?.rawReport?.shift || (selectedReport?.visitType === 'Night Round' ? 'Night Shift' : 'Day Shift')}</Text>
                      </View>
                      <View style={styles.infoRowItem}>
                        <Text style={styles.gridLabel}>Visit Type</Text>
                        <Text style={styles.gridValue}>{selectedReport?.visitType}</Text>
                      </View>
                      <View style={styles.infoRowItem}>
                        <Text style={styles.gridLabel}>Officer Name</Text>
                        <Text style={styles.gridValue}>{selectedReport?.officer || 'Amit Kulkarni'}</Text>
                      </View>
                      <View style={styles.infoRowItem}>
                        <Text style={styles.gridLabel}>Start Time</Text>
                        <Text style={styles.gridValue}>{selectedReport?.rawReport?.['check-in_time'] || selectedReport?.rawReport?.start_time || selectedReport?.rawReport?.startTime || '—'}</Text>
                      </View>
                      <View style={styles.infoRowItem}>
                        <Text style={styles.gridLabel}>End Time</Text>
                        <Text style={styles.gridValue}>{selectedReport?.rawReport?.['check-out_time'] || selectedReport?.rawReport?.end_time || selectedReport?.rawReport?.endTime || '—'}</Text>
                      </View>
                      <View style={styles.infoRowItem}>
                        <Text style={styles.gridLabel}>GPS Location</Text>
                        <Text style={styles.gridValue}>{selectedReport?.rawReport?.gps || 'Location Logged'}</Text>
                      </View>
                    </View>
                  </View>

                  {/* 2. Visit Parameters & Scope (General Visit) */}
                  {selectedReport?.visitType === 'General Audit' && (
                    <View style={styles.detailSectionCard}>
                      <View style={styles.navySectionTitleBox}>
                        <Text style={styles.navySectionTitle}>VISIT PARAMETERS & SCOPE</Text>
                      </View>
                      <View style={styles.gridInfoBox}>
                        <View style={styles.infoRowItemFull}>
                          <Text style={styles.gridLabel}>Person Visited</Text>
                          <Text style={styles.gridValue}>{selectedReport?.rawReport?.person_visited || selectedReport?.rawReport?.personVisited || 'N/A'}</Text>
                        </View>
                        <View style={styles.infoRowItemFull}>
                          <Text style={styles.gridLabel}>Reason of Visit</Text>
                          <Text style={styles.gridValue}>{selectedReport?.rawReport?.reason_of_visit || selectedReport?.rawReport?.reasonOfVisit || 'Routine Security Audit'}</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* 3. Guards Present on Duty */}
                  {selectedReport?.visitType !== 'General Audit' && (() => {
                    let guardsList: any[] = [];
                    const rawG = selectedReport?.rawReport?.guards;
                    if (Array.isArray(rawG)) guardsList = rawG;
                    else if (typeof rawG === 'string' && rawG.trim()) {
                      try { guardsList = JSON.parse(rawG); } catch (e) {}
                    }
                    return (
                      <View style={styles.detailSectionCard}>
                        <View style={styles.navySectionTitleBox}>
                          <Text style={styles.navySectionTitle}>GUARDS PRESENT ON DUTY ({guardsList.length})</Text>
                        </View>
                        {guardsList.length > 0 ? (
                          <View style={styles.tableWrap}>
                            <View style={styles.tableHeaderRow}>
                              <Text style={[styles.thCell, { flex: 0.5 }]}>#</Text>
                              <Text style={[styles.thCell, { flex: 2 }]}>Guard Name</Text>
                              <Text style={[styles.thCell, { flex: 1 }]}>Emp Code</Text>
                              <Text style={[styles.thCell, { flex: 1.5, textAlign: 'right' }]}>Status</Text>
                            </View>
                            {guardsList.map((g: any, idx: number) => (
                              <View key={idx} style={styles.tableBodyRow}>
                                <Text style={[styles.tdCell, { flex: 0.5, color: '#64748B' }]}>{idx + 1}</Text>
                                <Text style={[styles.tdCell, { flex: 2, fontWeight: '700', color: '#F8FAFC' }]}>{g.name || 'Guard'}</Text>
                                <Text style={[styles.tdCell, { flex: 1, color: '#94A3B8' }]}>{g.empCode || g.employeeId || g.emp_code || 'G'}</Text>
                                <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                                  <View style={[styles.statusBadgePill, g.present !== false && g.status !== 'Absent' ? styles.statusBadgeSuccess : styles.statusBadgeDanger]}>
                                    <Text style={styles.statusBadgePillText}>{g.status || (g.present !== false ? 'Present' : 'Absent')}</Text>
                                  </View>
                                </View>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={styles.emptyTableText}>No guards listed for this visit.</Text>
                        )}
                      </View>
                    );
                  })()}

                  {/* 4. Inspection Checklist Items */}
                  {selectedReport?.visitType !== 'General Audit' && (() => {
                    let checklistList: any[] = [];
                    const rawC = selectedReport?.rawReport?.checklist;
                    if (Array.isArray(rawC)) checklistList = rawC;
                    else if (typeof rawC === 'string' && rawC.trim()) {
                      try { checklistList = JSON.parse(rawC); } catch (e) {}
                    }
                    return (
                      <View style={styles.detailSectionCard}>
                        <View style={styles.navySectionTitleBox}>
                          <Text style={styles.navySectionTitle}>INSPECTION CHECKLIST ITEMS ({checklistList.length})</Text>
                        </View>
                        {checklistList.length > 0 ? (
                          <View style={styles.tableWrap}>
                            {checklistList.map((item: any, idx: number) => {
                              const qText = item.question || item.title || String(item);
                              const statusStr = item.status || item.answer || 'Satisfactory';
                              const isNegative = statusStr === 'Unsatisfactory' || statusStr === 'NO' || statusStr === 'NOT OK';
                              return (
                                <View key={idx} style={styles.checklistRow}>
                                  <View style={{ flex: 1, marginRight: 8 }}>
                                    <Text style={styles.questionText}>{idx + 1}. {qText}</Text>
                                    {item.remarks || item.observation ? (
                                      <Text style={styles.questionRemarkText}>Remarks: {item.remarks || item.observation}</Text>
                                    ) : null}
                                  </View>
                                  <View style={[styles.statusBadgePill, !isNegative ? styles.statusBadgeSuccess : styles.statusBadgeDanger]}>
                                    <Text style={styles.statusBadgePillText}>{statusStr}</Text>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        ) : (
                          <Text style={styles.emptyTableText}>No checklist items recorded.</Text>
                        )}
                      </View>
                    );
                  })()}

                  {/* 5. Lecture & Random Checking (Night Visit) */}
                  {selectedReport?.visitType === 'Night Round' && (
                    <View style={styles.detailSectionCard}>
                      <View style={styles.navySectionTitleBox}>
                        <Text style={styles.navySectionTitle}>BRIEFING, LECTURE & RANDOM CHECKING</Text>
                      </View>
                      <View style={styles.gridInfoBox}>
                        <View style={styles.infoRowItemFull}>
                          <Text style={styles.gridLabel}>Short Lecture Details</Text>
                          <Text style={styles.gridValue}>{selectedReport?.rawReport?.lecture_details || selectedReport?.rawReport?.lectureDetails || 'No short lecture details recorded.'}</Text>
                        </View>
                        <View style={styles.infoRowItemFull}>
                          <Text style={styles.gridLabel}>Random Checking Details</Text>
                          <Text style={styles.gridValue}>{selectedReport?.rawReport?.random_checking || selectedReport?.rawReport?.randomChecking || 'No random checking details recorded.'}</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* 6. Remarks & Customer Feedback */}
                  <View style={styles.detailSectionCard}>
                    <View style={styles.navySectionTitleBox}>
                      <Text style={styles.navySectionTitle}>REMARKS & OFFICER SUGGESTIONS</Text>
                    </View>
                    <View style={styles.remarkContentBox}>
                      <Text style={styles.remarkContentText}>
                        {selectedReport?.rawReport?.overall_remarks ||
                         selectedReport?.rawReport?.suggestions ||
                         selectedReport?.rawReport?.remark ||
                         'No additional remarks recorded.'}
                      </Text>
                    </View>
                  </View>

                  {/* 7. Action Button: Send Email Report */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => handleOpenEmailForm(selectedReport)}
                    style={styles.sendEmailModalActionBtn}
                  >
                    <Mail color="#FFFFFF" size={18} style={{ marginRight: 8 }} />
                    <Text style={styles.sendEmailModalActionBtnText}>SEND REPORT VIA EMAIL</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ACTIVE VISIT CHECK-OUT ENFORCER MODAL */}
      <Modal
        visible={enforcerModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEnforcerModal({ visible: false })}
      >
        <View style={styles.enforcerModalOverlay}>
          <View style={styles.enforcerModalCard}>
            <View style={styles.enforcerIconBox}>
              <ShieldAlert size={44} color="#EF4444" />
            </View>

            <Text style={styles.enforcerTitle}>Active Visit Session Detected</Text>

            <Text style={styles.enforcerMessage}>
              You are currently checked into <Text style={{ fontWeight: '800', color: '#F8FAFC' }}>'{enforcerModal.activeSiteName || 'Previous Site'}'</Text> since {enforcerModal.activeStartTime ? new Date(enforcerModal.activeStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'earlier'}.
              {'\n\n'}
              Please check out of your previous visit before starting a new visit.
            </Text>

            <TouchableOpacity
              style={styles.enforcerCheckoutBtn}
              activeOpacity={0.8}
              onPress={handleForceCheckoutPreviousVisit}
            >
              <LogOutIcon size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.enforcerCheckoutBtnText}>Check Out Previous Visit Now</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.enforcerCancelBtn}
              activeOpacity={0.7}
              onPress={() => setEnforcerModal({ visible: false })}
            >
              <Text style={styles.enforcerCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A1128',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(59,130,246,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  tabActiveGreen: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  // Visit Card
  visitCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  planCodeBadge: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  planCodeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
    letterSpacing: 0.5,
  },
  reportNoText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  visitTypeBadge: {
    flexShrink: 0,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  visitTypeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3B82F6',
  },
  siteNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 3,
    lineHeight: 22,
  },
  clientNameText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 12,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: '#64748B',
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressWrap: {
    flex: 1,
    marginRight: 12,
  },
  progressLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 5,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  startBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Empty state
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  // Detail Modal Styles
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  detailContainer: {
    backgroundColor: THEME.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.text,
  },
  detailSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.primary,
    marginTop: 2,
  },
  detailCloseBtn: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
  },
  detailSectionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.textVariant,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  remarkBox: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  remarkText: {
    fontSize: 13,
    color: '#E2E8F0',
    lineHeight: 18,
  },
  // Corporate Banner WEB Style
  previewCorporateBanner: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#1E3A8A',
  },
  bannerHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  companyNameTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 0.2,
  },
  reportTitleBanner: {
    backgroundColor: '#1E3A8A',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 6,
  },
  reportMainHeading: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  reportIdTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#93C5FD',
    textAlign: 'center',
    marginTop: 3,
  },
  bannerDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  bannerDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  navySectionTitleBox: {
    backgroundColor: '#1E3A8A',
    borderLeftWidth: 4,
    borderLeftColor: '#60A5FA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 12,
  },
  navySectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },
  gridInfoBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoRowItem: {
    width: '48%',
    backgroundColor: 'rgba(15,23,42,0.6)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  infoRowItemFull: {
    width: '100%',
    backgroundColor: 'rgba(15,23,42,0.6)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  gridLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  gridValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  tableWrap: {
    backgroundColor: 'rgba(15,23,42,0.4)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  thCell: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F8FAFC',
    textTransform: 'uppercase',
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tdCell: {
    fontSize: 12,
  },
  statusBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeSuccess: {
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  statusBadgeDanger: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  statusBadgePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  emptyTableText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
    padding: 10,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  questionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F1F5F9',
    lineHeight: 16,
  },
  questionRemarkText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    fontStyle: 'italic',
  },
  remarkContentBox: {
    backgroundColor: 'rgba(15,23,42,0.6)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  remarkContentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E2E8F0',
    lineHeight: 18,
  },
  headerEmailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 10,
  },
  headerEmailBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  sendEmailModalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
    marginBottom: 6,
  },
  sendEmailModalActionBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  emailFormLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  emailTextInput: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 13,
  },
  sendEmailSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 10,
  },
  sendEmailSubmitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  cardEmailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  cardEmailBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  disabledCardEmailBtn: {
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
    borderColor: 'rgba(100, 116, 139, 0.25)',
  },
  disabledCardEmailBtnText: {
    color: '#64748B',
  },
  disabledHeaderEmailBtn: {
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
    borderColor: 'rgba(100, 116, 139, 0.25)',
  },
  disabledHeaderEmailBtnText: {
    color: '#64748B',
  },
  // Active Visit Session Banner Styles
  activeSessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderColor: '#3B82F6',
    borderWidth: 1.5,
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    padding: 14,
    elevation: 4,
  },
  activeSessionTextCol: {
    flex: 1,
    marginRight: 10,
  },
  activeSessionPulseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  activeSessionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#60A5FA',
    letterSpacing: 0.8,
  },
  activeSessionSiteName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  activeSessionSubText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  activeSessionCheckoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  activeSessionCheckoutBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  // Active Visit Enforcer Modal Styles
  enforcerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  enforcerModalCard: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    padding: 24,
    alignItems: 'center',
    elevation: 10,
  },
  enforcerIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  enforcerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  enforcerMessage: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  enforcerCheckoutBtn: {
    width: '100%',
    height: 50,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  enforcerCheckoutBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  enforcerCancelBtn: {
    width: '100%',
    height: 44,
    backgroundColor: 'transparent',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  enforcerCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
});
