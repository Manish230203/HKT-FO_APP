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
  Image,
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
  isVisitDateRangeExpired,
} from '../../services/siteService';
import { getDayVisitReports, getNightVisitReports, getGeneralVisits, sendReportEmail } from '../../services/visitService';
import { getActiveCheckIns, saveActiveCheckIns, clearActiveCheckIn, ActiveCheckInInfo } from '../../services/db';
import { THEME } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import * as Location from 'expo-location';

import { Modal } from 'react-native';
import { X, User, MapPin, Building, FileText, Mail, Clock as ClockIcon, ShieldAlert, LogOut as LogOutIcon, Navigation, FileDown } from 'lucide-react-native';
import { generateAndShareVisitPdf } from '../../services/pdfService';

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
  companyName?: string;
  companyShortName?: string;
  companyId?: number;
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
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { user, profileImage } = useAuth();
  const { todayRecord, profileData } = useAttendance();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();

  const hasProfilePhoto = Boolean(
    profileImage ||
    (profileData && profileData.profile_photo) ||
    (user && (user as any).profile_photo)
  );

  const isOfficerActive = Boolean(todayRecord && todayRecord.check_in && !todayRecord.check_out);

  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [loading, setLoading] = useState(false);
  const [plannedVisits, setPlannedVisits] = useState<PlannedVisit[]>([]);
  const [completedVisits, setCompletedVisits] = useState<CompletedVisit[]>([]);
  const [selectedReport, setSelectedReport] = useState<CompletedVisit | null>(null);

  const getReportCompany = (rep: CompletedVisit | null) => {
    if (!rep) {
      return {
        name: 'Unique Delta Force Security Pvt. Ltd.',
        logo: require('../../assets/images/udf_logo.png'),
        isEagle: false,
      };
    }
    const r = rep.rawReport || {};
    const compName = String(rep.companyName || r.companyName || r.company_name || r.employee_company_name || user?.company_name || '').toLowerCase();
    const compId = Number(rep.companyId || r.companyId || r.company_id || r.COMPANY || user?.company_id || 1);
    const officerName = String(rep.officer || r.officer || user?.name || '').toLowerCase();

    const isEagle = compId === 4 || compName.includes('eagle') || compName.includes('eispl') || officerName.includes('anil bhosale') || officerName.includes('bhosale');

    if (isEagle) {
      return {
        name: 'Eagle Industrial Services Pvt. Ltd.',
        logo: require('../../assets/images/eagle_logo.png'),
        isEagle: true,
      };
    }
    return {
      name: 'Unique Delta Force Security Pvt. Ltd.',
      logo: require('../../assets/images/udf_logo.png'),
      isEagle: false,
    };
  };

  // Active Checked-In Site Visits State (persisted in AsyncStorage / db.ts)
  const [activeCheckIns, setActiveCheckIns] = useState<Record<string, ActiveCheckInInfo>>({});
  
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
      let locationSubscription: Location.LocationSubscription | null = null;
      let isSubscribed = true;

      loadStoredCheckIns();
      fetchActiveSession();
      fetchCurrentLocation();

      // Start real-time foreground location watching so distance updates dynamically
      (async () => {
        try {
          // 1. Instant cached location pickup (0ms)
          const lastKnown = await Location.getLastKnownPositionAsync();
          if (lastKnown && lastKnown.coords && isSubscribed) {
            setUserLocation(lastKnown.coords);
          }

          // 2. Active foreground GPS watcher
          locationSubscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 3000,
              distanceInterval: 2,
            },
            (loc) => {
              if (isSubscribed && loc && loc.coords) {
                setUserLocation(loc.coords);
              }
            }
          );
        } catch (err) {
          console.warn('Visits real-time location watcher warning:', err);
        }
      })();

      return () => {
        isSubscribed = false;
        if (locationSubscription) {
          locationSubscription.remove();
        }
      };
    }, [])
  );

  const fetchCurrentLocation = async () => {
    try {
      // 1. Instant check from last known cache
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown && lastKnown.coords) {
        setUserLocation(lastKnown.coords);
      }
      // 2. Fresh balanced location fix
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
    // 0. Enforce profile photo check
    if (!hasProfilePhoto) {
      Alert.alert(
        'Profile Photo Required',
        'Please upload your profile photo first in Settings before starting a site visit.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upload Photo', onPress: () => router.push('/settings') }
        ]
      );
      return;
    }

    // 1. Enforce active requirement
    if (!isOfficerActive) {
      Alert.alert(
        'First Activate Yourself',
        'You are currently INACTIVE. You must first activate yourself before checking in to this site.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Activate Now', onPress: () => router.push('/mark-attendance') }
        ]
      );
      return;
    }

    const empOid = getEmpOid();
    const isCustomVisit = !!(pv.isCustomVisit || pv.is_custom || pv.customVisitId || pv.custom_visit_id || pv.clientId === 'OTHER' || pv.siteId === 0 || pv.siteId === '0' || !pv.siteId);
    const customVisitId = pv.customVisitId || pv.custom_visit_id || (isCustomVisit ? pv.id : null);

    // 1. Check if officer has an active IN_PROGRESS session at a different site
    if (activeBackendSession) {
      const isSameCustom = customVisitId && activeBackendSession.custom_visit_id && Number(activeBackendSession.custom_visit_id) === Number(customVisitId);
      const isSameSite = !customVisitId && pv.siteId && activeBackendSession.site_id && Number(activeBackendSession.site_id) === Number(pv.siteId);
      if (!isSameCustom && !isSameSite) {
        setEnforcerModal({
          visible: true,
          pendingVisit: pv,
          activeSiteName: activeBackendSession.site_name,
          activeStartTime: activeBackendSession.start_time,
        });
        return;
      }
    }

    // 2. Fetch fresh user location
    let currentCoords = userLocation;
    if (!currentCoords) {
      try {
        const freshLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (freshLoc && freshLoc.coords) {
          currentCoords = freshLoc.coords;
          setUserLocation(freshLoc.coords);
        }
      } catch (locErr) {
        console.warn('Check-in location fix error:', locErr);
      }
    }

    if (!currentCoords) {
      Alert.alert(
        'Location Required',
        'Could not determine your GPS location. Please ensure location permissions and GPS are enabled.',
        [
          { text: 'Retry', onPress: fetchCurrentLocation },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }

    // 3. Geofence or Missing Coordinates Handling
    const hasSiteCoords = pv.latitude !== null && pv.latitude !== undefined && Number(pv.latitude) !== 0 &&
                          pv.longitude !== null && pv.longitude !== undefined && Number(pv.longitude) !== 0;

    const performActualCheckIn = async (visitObj: PlannedVisit, coords: Location.LocationObjectCoords | null) => {
      try {
        const checkInPayload: any = {
          employee_id: empOid,
          site_name: visitObj.siteName || visitObj.customSiteName,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
        };
        if (customVisitId) {
          checkInPayload.custom_visit_id = Number(customVisitId);
          checkInPayload.site_id = null;
        } else {
          checkInPayload.site_id = Number(visitObj.siteId || 1);
          checkInPayload.custom_visit_id = null;
        }

        const res = await checkInSiteVisit(checkInPayload);

        if (res && res.success) {
          const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
          const todayStr = new Date().toISOString().split('T')[0];
          const newCheckIns = {
            ...activeCheckIns,
            [visitObj.id]: {
              checkInTime: nowTime,
              date: todayStr,
              siteId: visitObj.siteId,
              customVisitId: customVisitId,
              siteName: visitObj.siteName || visitObj.customSiteName,
              clientId: visitObj.clientId,
            },
          };
          setActiveCheckIns(newCheckIns);
          await saveActiveCheckIns(newCheckIns);
          await fetchActiveSession();

          Alert.alert(
            t('checked_in_success_title') || 'Checked-In Successfully',
            `Check-In recorded at ${nowTime} for:\n${visitObj.siteName || visitObj.customSiteName || 'Site'}.\n\nYour site visit session is now active. Please submit the visit report to proceed to check-out.`
          );
        } else if (res && res.has_active_session) {
          setEnforcerModal({
            visible: true,
            pendingVisit: visitObj,
            activeSiteName: res.active_session?.site_name,
            activeStartTime: res.active_session?.start_time,
          });
        }
      } catch (err: any) {
        console.error('Check-in error:', err);
        Alert.alert('Check-In Error', err?.response?.data?.message || 'Failed to check in to site visit.');
      }
    };

    if (hasSiteCoords) {
      const dist = calculateHaversineDistanceMeters(
        currentCoords.latitude,
        currentCoords.longitude,
        Number(pv.latitude),
        Number(pv.longitude)
      );

      const allowedRadius = pv.radius !== null && pv.radius !== undefined ? Number(pv.radius) : 100;

      if (dist > allowedRadius) {
        const distStr = dist >= 1000 ? `${parseFloat((dist / 1000).toFixed(1))}km` : `${Math.round(dist)} meters`;
        const radiusStr = allowedRadius >= 1000 ? `${parseFloat((allowedRadius / 1000).toFixed(1))}km` : `${allowedRadius} meters`;
        Alert.alert(
          'Geofence Warning: Outside Site Radius',
          `You are currently ${distStr} away from ${pv.siteName || pv.customSiteName || 'Site'}.\n\nPlease move within ${radiusStr} of the site to check in.`,
          [
            { text: 'Refresh Location', onPress: fetchCurrentLocation },
            { text: 'OK', style: 'cancel' }
          ]
        );
        return;
      }

      await performActualCheckIn(pv, currentCoords);
    } else {
      // Missing Coordinates
      if (isCustomVisit) {
        // Policy A: Explicit officer confirmation, capture GPS, flag for AM manual review
        Alert.alert(
          'Location Coordinates Not Set',
          `This custom planned visit for "${pv.siteName || pv.customSiteName || 'Custom Location'}" does not have registered GPS coordinates.\n\nYour current device GPS coordinates will be captured and submitted for Area Manager review.\n\nDo you want to proceed with check-in?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Confirm & Check In',
              onPress: () => performActualCheckIn(pv, currentCoords),
            },
          ]
        );
      } else {
        Alert.alert(
          'Site Coordinates Missing',
          `Registered coordinates for ${pv.siteName || 'this site'} are not configured. Please contact the administrator.`,
          [{ text: 'OK', style: 'cancel' }]
        );
      }
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

  const handleSubmitReportNav = (pv: PlannedVisit) => {
    const isCustom = !!(pv.isCustomVisit || pv.is_custom || pv.customVisitId || pv.custom_visit_id || pv.clientId === 'OTHER' || pv.siteId === 0 || pv.siteId === '0' || !pv.siteId);
    const customVisitId = pv.customVisitId || pv.custom_visit_id || (isCustom ? pv.id : '');
    const activeData = activeCheckIns[pv.id];
    const cIn = activeData?.checkInTime || (activeBackendSession && activeBackendSession.start_time ? new Date(activeBackendSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '09:00');
    const sName = pv.siteName || pv.site_name || pv.customSiteName || '';
    const cName = pv.clientName || pv.client_name || pv.customClientName || '';
    router.push(
      `/visits/scan-checklist?clientId=${pv.clientId || pv.client_id || ''}&clientName=${encodeURIComponent(cName)}&siteId=${pv.siteId || pv.site_id || ''}&siteName=${encodeURIComponent(sName)}&plannedId=${pv.id}&checkInTime=${cIn}&customVisitId=${customVisitId || ''}&isCustom=${isCustom ? '1' : '0'}&customClientName=${encodeURIComponent(cName)}&customSiteName=${encodeURIComponent(sName)}`
    );
  };

  const handleCheckOutVisit = async (pv: PlannedVisit) => {
    const isCustom = !!(pv.isCustomVisit || pv.is_custom || pv.customVisitId || pv.custom_visit_id || !pv.siteId);
    const customVisitId = pv.customVisitId || pv.custom_visit_id || (isCustom ? pv.id : null);

    Alert.alert(
      t('confirm_checkout_title') || 'Confirm Check-Out',
      `Are you sure you want to check out from ${pv.siteName || pv.customSiteName || 'this site'}?\n\nThis will complete and end your visit session.`,
      [
        {
          text: t('cancel') || 'Cancel',
          style: 'cancel',
        },
        {
          text: t('checkout') || 'Check-Out',
          style: 'destructive',
          onPress: async () => {
            const empOid = getEmpOid();
            try {
              const checkOutPayload: any = {
                employee_id: empOid,
                latitude: userLocation?.latitude,
                longitude: userLocation?.longitude,
              };
              if (customVisitId) {
                checkOutPayload.custom_visit_id = Number(customVisitId);
                checkOutPayload.site_id = null;
              } else {
                checkOutPayload.site_id = Number(pv.siteId);
                checkOutPayload.custom_visit_id = null;
              }

              await checkOutSiteVisit(checkOutPayload);
              await clearActiveCheckIn(pv.id);
              const updatedCheckIns = { ...activeCheckIns };
              delete updatedCheckIns[pv.id];
              setActiveCheckIns(updatedCheckIns);
              await fetchActiveSession();
              await fetchVisits();
              setActiveTab('completed');
              Alert.alert(t('visit_completed_title') || 'Visit Completed', t('visit_completed_desc') || 'You have checked out successfully! Visit record is complete.');
            } catch (e: any) {
              console.error('Check-out error:', e);
              Alert.alert('Check-Out Error', e?.response?.data?.message || 'Failed to complete check out.');
            }
          },
        },
      ]
    );
  };

  const isReportSubmittedForSite = (siteId?: number | string | null, siteName?: string, customVisitId?: number | string | null) => {
    if (!siteId && !siteName && !customVisitId) return false;
    // 1. Check local activeCheckIns state
    const matchingPv = customVisitId
      ? plannedVisits.find((pv) => Number(pv.customVisitId || pv.custom_visit_id || pv.id) === Number(customVisitId))
      : (siteId ? plannedVisits.find((pv) => Number(pv.siteId) === Number(siteId)) : undefined);
    const activeData = matchingPv ? activeCheckIns[String(matchingPv.id)] : Object.values(activeCheckIns).find((a: any) => (customVisitId && Number(a?.customVisitId) === Number(customVisitId)) || (siteId && Number(a?.siteId) === Number(siteId)));
    if (activeData?.reportSubmitted) return true;

    // 2. Check if a report exists in completedVisits for this site/custom THAT WAS CREATED DURING/AFTER THE CURRENT ACTIVE SESSION START
    if (!activeBackendSession || !activeBackendSession.start_time) return false;

    const sessionStartMs = new Date(activeBackendSession.start_time).getTime() - 2 * 60 * 1000;
    const sNameNorm = (siteName || '').toLowerCase().trim();

    const hasCompletedForThisSession = completedVisits.some((cv) => {
      const cvCustomVisitId = cv.rawReport?.custom_visit_id || cv.rawReport?.customVisitId;
      const cvSiteId = cv.siteId || cv.rawReport?.site_id || cv.rawReport?.siteId;
      const cvSiteName = (cv.siteName || cv.rawReport?.site_name || '').toLowerCase().trim();

      const isCustomMatch = customVisitId && cvCustomVisitId && Number(cvCustomVisitId) === Number(customVisitId);
      const isSiteMatch = siteId && cvSiteId && Number(cvSiteId) === Number(siteId);
      const isNameMatch = sNameNorm && cvSiteName && (cvSiteName === sNameNorm || cvSiteName.includes(sNameNorm) || sNameNorm.includes(cvSiteName));

      if (!isCustomMatch && !isSiteMatch && !isNameMatch) return false;

      const createdTimeStr = cv.rawReport?.created_on || cv.rawReport?.createdOn || cv.date;
      if (!createdTimeStr) return false;

      const reportCreatedMs = new Date(createdTimeStr).getTime();
      return !isNaN(reportCreatedMs) && reportCreatedMs >= sessionStartMs;
    });

    return hasCompletedForThisSession;
  };

  const handleTopCheckOut = async () => {
    if (!activeBackendSession) return;

    // Search for a matching planned visit for this site or custom visit
    const matchingPv = plannedVisits.find((pv) => {
      if (activeBackendSession.custom_visit_id) {
        return Number(pv.customVisitId || pv.custom_visit_id || pv.id) === Number(activeBackendSession.custom_visit_id);
      }
      return Number(pv.siteId) === Number(activeBackendSession.site_id);
    });

    const isSubmitted = isReportSubmittedForSite(activeBackendSession.site_id, activeBackendSession.site_name, activeBackendSession.custom_visit_id);

    if (isSubmitted) {
      if (matchingPv) {
        await handleCheckOutVisit(matchingPv);
      } else {
        Alert.alert(
          t('confirm_checkout_title') || 'Confirm Check-Out',
          `Are you sure you want to check out from ${activeBackendSession.site_name || 'this site'}?\n\nThis will complete and end your visit session.`,
          [
            {
              text: t('cancel') || 'Cancel',
              style: 'cancel',
            },
            {
              text: t('checkout') || 'Check-Out',
              style: 'destructive',
              onPress: async () => {
                try {
                  const empOid = getEmpOid();
                  const checkOutPayload: any = {
                    employee_id: empOid,
                    latitude: userLocation?.latitude,
                    longitude: userLocation?.longitude,
                  };
                  if (activeBackendSession.custom_visit_id) {
                    checkOutPayload.custom_visit_id = Number(activeBackendSession.custom_visit_id);
                    checkOutPayload.site_id = null;
                  } else {
                    checkOutPayload.site_id = Number(activeBackendSession.site_id);
                    checkOutPayload.custom_visit_id = null;
                  }
                  await checkOutSiteVisit(checkOutPayload);
                  if (activeBackendSession.custom_visit_id) {
                    await clearActiveCheckIn(activeBackendSession.custom_visit_id);
                  } else if (activeBackendSession.site_id) {
                    await clearActiveCheckIn(activeBackendSession.site_id);
                  }
                  await fetchActiveSession();
                  await fetchVisits();
                  setActiveTab('completed');
                  Alert.alert(t('visit_completed_title') || 'Visit Completed', t('visit_completed_desc') || 'You have checked out successfully! Visit record is complete.');
                } catch (e: any) {
                  console.error('Check-out error:', e);
                  Alert.alert('Check-Out Error', e?.response?.data?.message || 'Failed to complete check out.');
                }
              },
            },
          ]
        );
      }
    } else {
      const cIn = activeBackendSession.start_time ? new Date(activeBackendSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '09:00';
      const isCustom = !!(activeBackendSession.custom_visit_id || matchingPv?.isCustomVisit || matchingPv?.is_custom);
      const sName = activeBackendSession.site_name || matchingPv?.siteName || matchingPv?.site_name || matchingPv?.customSiteName || '';
      const cName = matchingPv?.clientName || matchingPv?.client_name || matchingPv?.customClientName || '';
      router.push(
        `/visits/scan-checklist?clientId=${matchingPv?.clientId || matchingPv?.client_id || ''}&clientName=${encodeURIComponent(cName)}&siteId=${activeBackendSession.site_id || ''}&siteName=${encodeURIComponent(sName)}&plannedId=${matchingPv?.id || ''}&checkInTime=${cIn}&customVisitId=${activeBackendSession.custom_visit_id || ''}&isCustom=${isCustom ? '1' : '0'}&customClientName=${encodeURIComponent(cName)}&customSiteName=${encodeURIComponent(sName)}`
      );
    }
  };

  // PDF Generation State
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

  const handleDownloadPdf = async (report: CompletedVisit | null) => {
    if (!report) return;
    if (generatingPdfId) return; // Prevent duplicate concurrent generations
    setGeneratingPdfId(report.id);
    try {
      await generateAndShareVisitPdf({
        id: report.id,
        reportNo: report.reportNo,
        visitType: report.visitType,
        date: report.date,
        clientName: report.clientName,
        siteName: report.siteName,
        officer: user?.name || (user as any)?.full_name || 'Field Officer',
        status: report.status || 'COMPLETED',
        rawReport: report.rawReport,
      });
    } catch (err: any) {
      console.error('Download PDF error:', err);
      Alert.alert('PDF Report', err?.message || t('pdf_generate_failed'));
    } finally {
      setGeneratingPdfId(null);
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
            companyName: r.companyName || r.company_name || user?.company_name || 'Unique Delta Force Security Pvt. Ltd.',
            companyShortName: r.companyShortName || r.company_short_name || 'UDF',
            companyId: r.companyId || r.company_id || user?.company_id || 1,
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
            companyName: r.companyName || r.company_name || user?.company_name || 'Unique Delta Force Security Pvt. Ltd.',
            companyShortName: r.companyShortName || r.company_short_name || 'UDF',
            companyId: r.companyId || r.company_id || user?.company_id || 1,
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
            companyName: r.companyName || r.company_name || user?.company_name || 'Unique Delta Force Security Pvt. Ltd.',
            companyShortName: r.companyShortName || r.company_short_name || 'UDF',
            rawReport: r,
          });
        }
      });

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
    // 1. If completed, hide from pending
    if (pv.status === 'Completed') return false;

    // 2. If all required frequencies done, hide from pending
    const done = pv.completedVisits || 0;
    const freq = pv.visitFrequency
      ? parseInt(String(pv.visitFrequency), 10)
      : pv.frequency
      ? parseInt(String(pv.frequency), 10)
      : 1;
    if (done >= freq && freq > 0) return false;

    // 3. If date range is gone, visit disappears from pending visits
    if (isVisitDateRangeExpired(pv)) {
      return false;
    }

    return true;
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
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color={colors.text} size={22} />
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
      {activeBackendSession && (() => {
        const isTopReportSubmitted = isReportSubmittedForSite(activeBackendSession.site_id, activeBackendSession.site_name, activeBackendSession.custom_visit_id);

        return (
          <View style={[styles.activeSessionBanner, isTopReportSubmitted ? { borderColor: '#A855F7' } : {}]}>
            <View style={styles.activeSessionTextCol}>
              <View style={styles.activeSessionPulseRow}>
                <View style={[styles.pulseDot, { backgroundColor: isTopReportSubmitted ? '#A855F7' : '#10B981' }]} />
                <Text style={[styles.activeSessionTitle, { color: isTopReportSubmitted ? '#C084FC' : '#60A5FA' }]}>
                  {isTopReportSubmitted ? 'REPORT SUBMITTED' : 'ACTIVE SITE VISIT SESSION'}
                </Text>
              </View>
              <Text style={styles.activeSessionSiteName}>{activeBackendSession.site_name}</Text>
              <Text style={styles.activeSessionSubText}>
                Started at {new Date(activeBackendSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {isTopReportSubmitted ? 'Ready for Check-Out' : 'Report Pending'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.activeSessionCheckoutBtn, { backgroundColor: isTopReportSubmitted ? '#EF4444' : '#3B82F6' }]}
              onPress={handleTopCheckOut}
            >
              {isTopReportSubmitted ? (
                <>
                  <LogOutIcon color="#FFFFFF" size={15} style={{ marginRight: 5 }} />
                  <Text style={styles.activeSessionCheckoutBtnText}>Check-Out</Text>
                </>
              ) : (
                <>
                  <FileText color="#FFFFFF" size={15} style={{ marginRight: 5 }} />
                  <Text style={styles.activeSessionCheckoutBtnText}>Submit Report</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        );
      })()}

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchVisits} tintColor="#3B82F6" />}
      >
        {/* PENDING TAB */}
        {activeTab === 'pending' && (
          <>
            {!isOfficerActive && (
              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.inactiveWarningCard}
                onPress={() => router.push('/mark-attendance')}
              >
                <View style={styles.inactiveWarningIconBox}>
                  <ShieldAlert color="#EF4444" size={24} />
                </View>
                <View style={styles.inactiveWarningTextBox}>
                  <Text style={styles.inactiveWarningTitle}>First Activate Yourself</Text>
                  <Text style={styles.inactiveWarningDesc}>
                    You are currently inactive. Site check-in is disabled until you activate your session.
                  </Text>
                </View>
                <View style={styles.inactiveWarningActionBtn}>
                  <Text style={styles.inactiveWarningActionText}>Activate</Text>
                </View>
              </TouchableOpacity>
            )}

            {pendingVisits.length === 0 ? (
              <View style={styles.emptyBox}>
                <CheckCircle2 color="#10B981" size={48} style={{ marginBottom: 12 }} />
                <Text style={styles.emptyTitle}>{t('all_clear')}</Text>
                <Text style={styles.emptySubtitle}>{t('no_pending_visits_desc')}</Text>
              </View>
            ) : (
              pendingVisits.map((pv) => {
                const status = getStatusInfo(pv);
                
                const isCustomVisit = !!(pv.isCustomVisit || pv.is_custom || pv.customVisitId || pv.custom_visit_id || pv.clientId === 'OTHER' || pv.siteId === 0 || pv.siteId === '0' || !pv.siteId);
                const customVisitId = pv.customVisitId || pv.custom_visit_id || (isCustomVisit ? pv.id : null);
                
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
                  const allowedRadius = pv.radius !== null && pv.radius !== undefined ? Number(pv.radius) : 100;
                  isOutsideGeofence = distanceMeters > allowedRadius;
                } else if (!hasSiteCoords && !isCustomVisit) {
                  isOutsideGeofence = true;
                }

                // Check if this planned visit site matches the active backend session or local checkin
                const isReportSubmitted = isReportSubmittedForSite(pv.siteId, pv.siteName || pv.customSiteName, customVisitId);
                const isSessionMatching = activeBackendSession && (
                  (customVisitId && activeBackendSession.custom_visit_id && Number(activeBackendSession.custom_visit_id) === Number(customVisitId)) ||
                  (!customVisitId && pv.siteId && activeBackendSession.site_id && Number(activeBackendSession.site_id) === Number(pv.siteId))
                );

                const activeData = activeCheckIns[String(pv.id)] || (isSessionMatching ? { checkInTime: activeBackendSession.start_time ? new Date(activeBackendSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '09:00', date: '', siteId: pv.siteId, customVisitId: customVisitId, reportSubmitted: isReportSubmitted } : null);
                const isCheckedIn = !!activeData || isSessionMatching;

                return (
                  <View key={pv.id} style={styles.visitCard}>
                    {/* Card Top: Plan Code + Status Badge */}
                    <View style={styles.cardTopRow}>
                      <View style={styles.planCodeBadge}>
                        <Text style={styles.planCodeText}>{pv.planCode || 'PLAN'}</Text>
                      </View>
                      {isCheckedIn ? (
                        <View style={[styles.statusBadge, { backgroundColor: isReportSubmitted ? 'rgba(168, 85, 247, 0.2)' : 'rgba(16, 185, 129, 0.2)' }]}>
                          <ClockIcon color={isReportSubmitted ? '#A855F7' : '#10B981'} size={12} style={{ marginRight: 4 }} />
                          <Text style={[styles.statusBadgeText, { color: isReportSubmitted ? '#C084FC' : '#10B981', fontWeight: '800' }]}>
                            {isReportSubmitted ? 'Report Submitted' : `Checked In (${activeData?.checkInTime || 'Active'})`}
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
                    <Text style={styles.siteNameText}>{pv.siteName || pv.site_name || pv.customSiteName || 'Unassigned Site'}</Text>
                    
                    <View style={styles.metaRow}>
                      <Building color="#64748B" size={14} style={{ marginRight: 6 }} />
                      <Text style={styles.metaText}>{pv.clientName || pv.client_name || pv.customClientName || 'Client'}</Text>
                    </View>

                    <View style={styles.metaRow}>
                      <CalendarDays color="#64748B" size={14} style={{ marginRight: 6 }} />
                      <Text style={styles.metaText}>{pv.plannedPeriod || pv.date || 'Weekly Visit'}</Text>
                    </View>

                    {/* Card Bottom: Progress Bar + Action Button */}
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

                      {isCheckedIn ? (
                        isReportSubmitted ? (
                          <TouchableOpacity
                            activeOpacity={0.85}
                            style={[styles.startBtn, { backgroundColor: '#EF4444' }]}
                            onPress={() => handleCheckOutVisit(pv)}
                          >
                            <LogOut color="#FFFFFF" size={13} style={{ marginRight: 4 }} />
                            <Text style={styles.startBtnText}>Check-Out</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.85}
                            style={[styles.startBtn, { backgroundColor: '#3B82F6' }]}
                            onPress={() => handleSubmitReportNav(pv)}
                          >
                            <FileText color="#FFFFFF" size={13} style={{ marginRight: 4 }} />
                            <Text style={styles.startBtnText}>Submit Report</Text>
                          </TouchableOpacity>
                        )
                      ) : !hasSiteCoords && !isCustomVisit ? (
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
                      ) : !userLocation && !isCustomVisit ? (
                        <View style={{ alignItems: 'flex-end' }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: 'rgba(59, 130, 246, 0.15)',
                              borderWidth: 1,
                              borderColor: 'rgba(59, 130, 246, 0.4)',
                              borderRadius: 8,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                            }}
                          >
                            <ActivityIndicator size={12} color="#60A5FA" style={{ marginRight: 5 }} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#60A5FA' }}>
                              Acquiring GPS...
                            </Text>
                          </View>
                        </View>
                      ) : isOutsideGeofence && !isCustomVisit ? (
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
                              {distanceMeters !== null
                                ? distanceMeters >= 1000
                                  ? `${parseFloat((distanceMeters / 1000).toFixed(1))}km Away`
                                  : `${distanceMeters}m Away`
                                : 'Not at Site'}
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
                      ) : !isOfficerActive ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={[
                            styles.startBtn,
                            {
                              backgroundColor: 'rgba(239, 68, 68, 0.15)',
                              borderWidth: 1,
                              borderColor: 'rgba(239, 68, 68, 0.45)',
                            },
                          ]}
                          onPress={() => {
                            Alert.alert(
                              'First Activate Yourself',
                              'You are currently INACTIVE. You must first activate yourself before checking in to this site.',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Activate Now', onPress: () => router.push('/mark-attendance') },
                              ]
                            );
                          }}
                        >
                          <AlertCircle color="#EF4444" size={13} style={{ marginRight: 4 }} />
                          <Text style={[styles.startBtnText, { color: '#EF4444', fontWeight: '800' }]}>
                            Activate First
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={[styles.startBtn, { backgroundColor: '#10B981' }]}
                          onPress={() => handleCheckIn(pv)}
                        >
                          <LogIn color="#FFFFFF" size={13} style={{ marginRight: 4 }} />
                          <Text style={styles.startBtnText}>
                            {t('check_in_now') || 'Check-In'}
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
                      activeOpacity={0.85}
                      disabled={generatingPdfId === visit.id}
                      onPress={() => handleDownloadPdf(visit)}
                      style={styles.cardPdfBtn}
                    >
                      {generatingPdfId === visit.id ? (
                        <ActivityIndicator color="#3B82F6" size="small" style={{ marginRight: 4 }} />
                      ) : (
                        <FileDown color="#3B82F6" size={14} style={{ marginRight: 4 }} />
                      )}
                      <Text style={styles.cardPdfBtnText}>
                        {t('download_pdf_report')}
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

      {/* COMPLETED REPORT PREVIEW & DOWNLOAD MODAL */}
      <Modal
        visible={!!selectedReport}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setSelectedReport(null);
        }}
      >
        <View style={styles.detailOverlay}>
          <View style={styles.detailContainer}>
            {/* Header Close Bar */}
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailTitle}>{selectedReport?.reportNo}</Text>
                <Text style={styles.detailSubtitle}>{selectedReport?.visitType}</Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={generatingPdfId === selectedReport?.id}
                onPress={() => handleDownloadPdf(selectedReport)}
                style={styles.headerPdfBtn}
              >
                {generatingPdfId === selectedReport?.id ? (
                  <ActivityIndicator color="#3B82F6" size="small" style={{ marginRight: 5 }} />
                ) : (
                  <FileDown color="#3B82F6" size={16} style={{ marginRight: 5 }} />
                )}
                <Text style={styles.headerPdfBtnText}>
                  {t('download_pdf')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setSelectedReport(null);
                }}
                style={styles.detailCloseBtn}
              >
                <X color={colors.textSecondary} size={22} />
              </TouchableOpacity>
            </View>

                <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
                  {/* Corporate Banner Header (Exact WEB Match) */}
                  <View style={styles.previewCorporateBanner}>
                    <View style={styles.bannerHeaderTopRow}>
                      <Image
                        source={getReportCompany(selectedReport).logo}
                        style={{ width: 28, height: 28, resizeMode: 'contain', marginRight: 8 }}
                      />
                      <Text style={styles.companyNameTitle}>{getReportCompany(selectedReport).name}</Text>
                    </View>

                    <View style={styles.reportTitleBanner}>
                      <Text style={styles.reportMainHeading}>
                        {selectedReport?.visitType === 'Day Visit'
                          ? 'OFFICER DAY VISIT REPORT'
                          : selectedReport?.visitType === 'Night Round'
                          ? 'OFFICER NIGHT VISIT REPORT'
                          : 'OFFICER GENERAL VISIT REPORT'}
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

                  {/* 3. Guards Present on Site */}
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
                          <Text style={styles.navySectionTitle}>GUARDS PRESENT ON SITE ({guardsList.length})</Text>
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

                  {/* 6. Photo Evidence */}
                  {(() => {
                    const rawPhotos = selectedReport?.rawReport?.photos || selectedReport?.rawReport?.photo_evidence || [];
                    const baseList = Array.isArray(rawPhotos) ? rawPhotos : (typeof rawPhotos === 'string' ? (JSON.parse(rawPhotos || '[]') || []) : []);
                    const rawChecklist = selectedReport?.rawReport?.checklist;
                    const parsedChecklist = Array.isArray(rawChecklist) ? rawChecklist : (typeof rawChecklist === 'string' ? (JSON.parse(rawChecklist || '[]') || []) : []);
                    const checklistPhotos = (parsedChecklist || []).map((c: any) => c.photo || (Array.isArray(c.photos) ? c.photos[0] : null)).filter(Boolean);
                    const allPhotos = Array.from(new Set([...baseList, ...checklistPhotos])).filter(Boolean);

                    const resolveMobilePhotoUrl = (url: string) => {
                      if (!url || typeof url !== 'string') return '';
                      if (url.startsWith('data:image/') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://')) {
                        return url;
                      }
                      if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
                        const clean = url.startsWith('/') ? url : `/${url}`;
                        const rawApi = process.env.EXPO_PUBLIC_API_URL || 'https://tarot-carrot-celery.ngrok-free.dev';
                        const serverHost = rawApi.replace(/\/api\/?$/, '');
                        return `${serverHost}${clean}`;
                      }
                      return url;
                    };

                    if (allPhotos.length === 0) return null;

                    return (
                      <View style={styles.detailSectionCard}>
                        <View style={styles.navySectionTitleBox}>
                          <Text style={styles.navySectionTitle}>PHOTO EVIDENCE ({allPhotos.length})</Text>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, backgroundColor: '#1E293B', borderRadius: 8 }}>
                          {allPhotos.map((p: any, idx: number) => {
                            const fullUrl = resolveMobilePhotoUrl(String(p));
                            return (
                              <View key={idx} style={{ width: 80, height: 80, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#334155', backgroundColor: '#0F172A' }}>
                                <Image
                                  source={{ uri: fullUrl }}
                                  style={{ width: '100%', height: '100%' }}
                                  resizeMode="cover"
                                />
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })()}

                  {/* 7. Remarks & Customer Feedback */}
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

                  {/* 8. Action Button: Download PDF Report */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={generatingPdfId === selectedReport?.id}
                    onPress={() => handleDownloadPdf(selectedReport)}
                    style={styles.downloadPdfModalActionBtn}
                  >
                    {generatingPdfId === selectedReport?.id ? (
                      <ActivityIndicator color="#FFFFFF" size="small" style={{ marginRight: 8 }} />
                    ) : (
                      <FileDown color="#FFFFFF" size={18} style={{ marginRight: 8 }} />
                    )}
                    <Text style={styles.downloadPdfModalActionBtnText}>
                      {t('download_pdf_report').toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
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

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceSecondary,
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
    color: colors.text,
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 12,
    color: colors.textSecondary,
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
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.textSecondary,
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
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.textSecondary,
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
    color: colors.text,
    marginBottom: 3,
    lineHeight: 22,
  },
  clientNameText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
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
    color: colors.textSecondary,
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
    color: colors.textSecondary,
    marginBottom: 5,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
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
    color: colors.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Detail Modal Styles
  detailOverlay: {
    flex: 1,
    backgroundColor: colors.modalOverlay,
    justifyContent: 'flex-end',
  },
  detailContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 16,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  detailSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 2,
  },
  detailCloseBtn: {
    padding: 6,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
  },
  detailSectionCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  remarkBox: {
    backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : '#F1F5F9',
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  remarkText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  // Corporate Banner WEB Style
  previewCorporateBanner: {
    backgroundColor: isDark ? '#0F172A' : '#EFF6FF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: isDark ? '#1E3A8A' : '#BFDBFE',
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
    color: colors.text,
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
    color: colors.textSecondary,
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
    backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRowItemFull: {
    width: '100%',
    backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  gridValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  tableWrap: {
    backgroundColor: isDark ? 'rgba(15,23,42,0.4)' : '#F8FAFC',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: isDark ? '#334155' : '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  thCell: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.text,
    textTransform: 'uppercase',
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    color: colors.text,
  },
  emptyTableText: {
    fontSize: 12,
    color: colors.textMuted,
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
    borderBottomColor: colors.border,
  },
  questionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 16,
  },
  questionRemarkText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontStyle: 'italic',
  },
  remarkContentBox: {
    backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  remarkContentText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 18,
  },
  headerPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 10,
  },
  headerPdfBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
  },
  downloadPdfModalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
    marginBottom: 6,
  },
  downloadPdfModalActionBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  cardPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  cardPdfBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
  },
  // Active Visit Session Banner Styles
  activeSessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
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
    color: colors.text,
    marginBottom: 2,
  },
  activeSessionSubText: {
    fontSize: 11,
    color: colors.textSecondary,
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
    backgroundColor: colors.modalOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  enforcerModalCard: {
    width: '100%',
    backgroundColor: colors.card,
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
    color: colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  enforcerMessage: {
    fontSize: 14,
    color: colors.textSecondary,
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
    borderColor: colors.border,
  },
  enforcerCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  // Inactive Warning Card Styles
  inactiveWarningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  inactiveWarningIconBox: {
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inactiveWarningTextBox: {
    flex: 1,
  },
  inactiveWarningTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#EF4444',
    marginBottom: 2,
  },
  inactiveWarningDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  inactiveWarningActionBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 8,
  },
  inactiveWarningActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
