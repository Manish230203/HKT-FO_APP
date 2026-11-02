import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ArrowLeft,
  User,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Camera,
  CheckCircle2,
  AlertCircle,
  Power,
  RefreshCw,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useAttendance } from '../context/AttendanceContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { SwipeableBackWrapper } from '../components/SwipeableBackWrapper';
import { CustomAlertModal } from '../components/ui/CustomAlertModal';
import { getPunchRecords, savePunchRecord, updatePunchRecordsList, getActiveCheckIns, clearAllActiveCheckIns } from '../services/db';
import { getActiveSiteVisitSession, checkOutSiteVisit } from '../services/siteService';

export default function MarkAttendanceScreen() {
  const { user, profileImage } = useAuth();
  const { markAttendance, validateSelfie, todayRecord, refreshStatus, profileData } = useAttendance();
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  // Check if officer has a registered profile photo
  const hasProfilePhoto = Boolean(
    (profileImage && profileImage.trim().length > 0) ||
    (profileData && profileData.profile_photo && String(profileData.profile_photo).trim().length > 0 && String(profileData.profile_photo) !== 'null')
  );

  const [localTime, setLocalTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
  const [isVerifyingPhoto, setIsVerifyingPhoto] = useState(false);
  const [cameraKey, setCameraKey] = useState<number>(0);

  const reloadLiveCamera = () => {
    setCapturedPhotoUri(null);
    setCameraKey((prev) => prev + 1);
  };

  // Live Camera Hooks & Refs
  const [permission, requestPermission] = useCameraPermissions();
  const [isFocused, setIsFocused] = useState(true);
  const cameraRef = useRef<any>(null);

  // Active Punch & Buffer states
  const [activePunchRecord, setActivePunchRecord] = useState<any | null>(null);
  const [bufferError, setBufferError] = useState<string | null>(null);

  // GPS Location
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Alert Modal State
  const [alertInfo, setAlertInfo] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
    onConfirm?: () => void;
    confirmText?: string;
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  // Determine current active status strictly from server record and local active session
  const isServerActive = !!(todayRecord && todayRecord.check_in && !todayRecord.check_out);
  const hasServerExplicitInactive = !!(
    (todayRecord && (todayRecord as any).no_active_session) ||
    (todayRecord && todayRecord.check_out)
  );
  const isOfficerActive = isServerActive || (!hasServerExplicitInactive && !!activePunchRecord);

  const checkActivePunchSession = React.useCallback(async () => {
    try {
      const isServerActiveNow = !!(todayRecord && todayRecord.check_in && !todayRecord.check_out);
      const hasServerExplicitInactiveNow = !!(
        (todayRecord && (todayRecord as any).no_active_session) ||
        (todayRecord && todayRecord.check_out)
      );

      if (hasServerExplicitInactiveNow) {
        setActivePunchRecord(null);
        setBufferError(null);
        return;
      }

      const empId = user?.employee_id || (user?.id ? String(user.id) : '') || user?.username || '';
      const records = await getPunchRecords(empId);
      const nowMs = Date.now();
      const todayStr = new Date().toISOString().split('T')[0];
      const currentEmpId = String(user?.employee_id || user?.id || '').toLowerCase();
      const active = records.find((r) => {
        const isPunchedIn = r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--';
        const punchMs = r.timestamp || 0;
        const isWithin16Hours = (nowMs - punchMs) < 16 * 3600 * 1000;
        const isToday = !r.date || r.date === todayStr;
        const recordEmpId = String(r.employee_id || r.employeeId || '').toLowerCase();
        const matchesEmp = !currentEmpId || recordEmpId === currentEmpId;
        return isPunchedIn && isWithin16Hours && isToday && matchesEmp;
      });

      if (active || isServerActiveNow) {
        setActivePunchRecord(active || { timestamp: todayRecord?.check_in ? new Date(todayRecord.check_in).getTime() : Date.now() });
        const punchInTimeMs = active?.timestamp || (todayRecord?.check_in ? new Date(todayRecord.check_in).getTime() : Date.now());
        const diffMins = Math.floor((Date.now() - punchInTimeMs) / 60000);
        if (diffMins < 10) {
          const remaining = 10 - diffMins;
          setBufferError(
            `10-Minute Buffer Required: Activated (${diffMins} mins ago). Please wait ${remaining} more mins to deactivate.`
          );
        } else {
          setBufferError(null);
        }
      } else {
        setActivePunchRecord(null);
        setBufferError(null);
      }
    } catch (e) {
      console.error('Check active punch error', e);
    }
  }, [user, todayRecord]);

  useFocusEffect(
    React.useCallback(() => {
      setIsFocused(true);
      refreshStatus();
      checkActivePunchSession();

      // Guard: If officer is inactive and has no profile photo uploaded, warn and redirect
      if (!isOfficerActive && !hasProfilePhoto) {
        setAlertInfo({
          visible: true,
          title: t('profile_photo_required_title') || 'Profile Photo Required',
          message: t('profile_photo_required_desc') || 'Profile photo is not uploaded. You must upload your profile photo first in Settings before activating your duty session.',
          type: 'error',
          confirmText: t('upload_photo') || 'Upload Photo',
          onConfirm: () => {
            setAlertInfo((prev) => ({ ...prev, visible: false }));
            router.replace({ pathname: '/settings', params: { autoUpload: 'true' } });
          },
        });
      }

      return () => {
        setIsFocused(false);
      };
    }, [refreshStatus, checkActivePunchSession, isOfficerActive, hasProfilePhoto])
  );

  // Auto-request camera permissions and pre-fetch GPS on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const lastLoc = await Location.getLastKnownPositionAsync();
          if (lastLoc) {
            setLocation({ latitude: lastLoc.coords.latitude, longitude: lastLoc.coords.longitude });
          }
          const freshLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (freshLoc) {
            setLocation({ latitude: freshLoc.coords.latitude, longitude: freshLoc.coords.longitude });
          }
        }
      } catch (locErr) {
        console.warn('GPS pre-fetch non-fatal error:', locErr);
      }
    })();
  }, []);

  // Digital Live Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const secs = String(now.getSeconds()).padStart(2, '0');
      setLocalTime(`${hrs}:${mins}:${secs}`);
    };
    updateTime();
    const clockTimer = setInterval(updateTime, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Check active punch session on mount and when todayRecord updates
  useEffect(() => {
    checkActivePunchSession();
  }, [checkActivePunchSession]);


  // Fetch Location gracefully
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          let loc: Location.LocationObject | null = null;
          try {
            loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          } catch {
            loc = await Location.getLastKnownPositionAsync();
          }

          if (loc && loc.coords) {
            setLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            });
          }
        }
      } catch (e) {
        console.warn('Location fetch error (non-blocking):', e);
      }
    })();
  }, []);

  // Unified One-Step: Capture Photo -> Face Verification -> Immediately Activate / Deactivate
  const handleCaptureAndToggleSession = async () => {
    if (isSubmitting || isVerifyingPhoto) return;

    // 1. Mandatory Profile Photo Check (when activating)
    if (!isOfficerActive && !hasProfilePhoto) {
      setAlertInfo({
        visible: true,
        title: t('profile_photo_required_title') || 'Profile Photo Required',
        message: t('profile_photo_required_desc') || 'Profile photo is not uploaded. You must upload your profile photo first in Settings before activating.',
        type: 'error',
        confirmText: t('upload_photo') || 'Upload Photo',
        onConfirm: () => {
          setAlertInfo((prev) => ({ ...prev, visible: false }));
          router.replace({ pathname: '/settings', params: { autoUpload: 'true' } });
        },
      });
      return;
    }

    // 2. Buffer & Active Visit checks (when deactivating)
    if (isOfficerActive) {
      if (bufferError) {
        setAlertInfo({
          visible: true,
          title: 'Buffer Required',
          message: bufferError,
          type: 'error',
        });
        return;
      }

      const empOid = user?.id || (user as any)?.oid || user?.employee_id || 7558;
      let activeSiteSession = await getActiveSiteVisitSession(empOid);
      if (!activeSiteSession) {
        const localCheckIns = await getActiveCheckIns();
        // Filter out visits that were already submitted or checked out
        const activeKeys = Object.keys(localCheckIns).filter((k) => {
          const item = localCheckIns[k];
          return item && !item.reportSubmitted && !item.checkOutTime;
        });
        if (activeKeys.length > 0) {
          const firstActive = localCheckIns[activeKeys[0]];
          activeSiteSession = {
            id: 1,
            employee_id: Number(empOid) || 7558,
            site_id: Number(firstActive.siteId) || 1,
            site_name: firstActive.siteName || 'Site Visit',
            start_time: firstActive.checkInTime || 'Active',
            status: 'IN_PROGRESS',
            duration_minutes: 0,
          };
        } else {
          // Clear any stale completed check-ins in local storage
          await clearAllActiveCheckIns();
        }
      }

      if (activeSiteSession && activeSiteSession.status === 'IN_PROGRESS') {
        setAlertInfo({
          visible: true,
          title: t('site_checkout_required_title') || 'Site Check-Out Required',
          message: `${t('site_checkout_required_msg', { site: activeSiteSession.site_name || 'Site Visit' })}\n\nDo you want to automatically check out from this site visit and deactivate duty now?`,
          type: 'error',
          confirmText: 'Check-Out & Deactivate',
          onConfirm: async () => {
            setAlertInfo((prev) => ({ ...prev, visible: false }));
            try {
              await checkOutSiteVisit({
                employee_id: empOid,
                site_id: activeSiteSession.site_id,
                custom_visit_id: activeSiteSession.custom_visit_id,
                latitude: location?.latitude,
                longitude: location?.longitude,
              });
            } catch (coErr) {
              console.warn('Auto checkout before deactivate warning:', coErr);
            }
            await clearAllActiveCheckIns();
            proceedToCaptureAndPunch();
          },
        });
        return;
      }
    }

    await proceedToCaptureAndPunch();
  };

  const proceedToCaptureAndPunch = async () => {
    // 3. Capture Photo from Live Camera (or fallback to ImagePicker)
    let photoUri: string | null = null;
    try {
      if (cameraRef.current && permission?.granted) {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.5,
          skipProcessing: true,
        });
        if (photo && photo.uri) {
          photoUri = photo.uri;
        }
      }
    } catch (camErr) {
      console.warn('CameraView takePicture error, falling back to ImagePicker:', camErr);
    }

    if (!photoUri) {
      try {
        const permRes = await ImagePicker.requestCameraPermissionsAsync();
        if (!permRes.granted) {
          Alert.alert(t('camera_perm_required'), t('camera_perm_msg'));
          return;
        }
        const pickerRes = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.5,
          cameraType: ImagePicker.CameraType.front,
        });
        if (!pickerRes.canceled && pickerRes.assets && pickerRes.assets.length > 0) {
          photoUri = pickerRes.assets[0].uri;
        }
      } catch (pickerErr) {
        console.error('ImagePicker fallback error:', pickerErr);
      }
    }

    if (!photoUri) {
      return; // User cancelled
    }

    setCapturedPhotoUri(photoUri);
    setIsSubmitting(true);
    setIsVerifyingPhoto(true);

    try {
      // 4. Face Verification (mandatory when activating)
      if (!isOfficerActive) {
        try {
          const vRes = await validateSelfie(photoUri);
          if (!vRes || !vRes.success) {
            setIsSubmitting(false);
            setIsVerifyingPhoto(false);
            reloadLiveCamera();
            const msg = vRes?.message || 'Face verification failed.';
            const isMasterNotReg = msg.includes('MASTER PHOTO NOT REGISTERED') || msg.toLowerCase().includes('profile photo');

            if (isMasterNotReg) {
              setAlertInfo({
                visible: true,
                title: t('profile_photo_required_title') || 'Profile Photo Required',
                message: 'Master profile photo is not registered. Please upload your profile photo first in Settings before activating.',
                type: 'error',
                confirmText: t('upload_photo') || 'Upload Photo',
                onConfirm: () => {
                  setAlertInfo((prev) => ({ ...prev, visible: false }));
                  router.replace({ pathname: '/settings', params: { autoUpload: 'true' } });
                },
              });
            } else {
              setAlertInfo({
                visible: true,
                title: t('selfie_verif_failed') || 'Face Verification Notice',
                message: msg,
                type: 'error',
              });
            }
            return; // DO NOT PROCEED TO PUNCH
          }
        } catch (valErr) {
          console.warn('validateSelfie error:', valErr);
        }
      }

      // 5. GPS Location
      let lat = location?.latitude;
      let long = location?.longitude;
      if (!lat || !long) {
        try {
          const freshLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = freshLoc.coords.latitude;
          long = freshLoc.coords.longitude;
        } catch {
          lat = 18.605555;
          long = 73.827115;
        }
      }

      const empId = user?.employee_id || (user?.id ? String(user.id) : '') || user?.username || '';
      const todayDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // 6. Submit Attendance to Server
      const res = await markAttendance(lat, long);
      if (res && res.success) {
        if (isOfficerActive) {
          // Deactivation
          const allRecords = await getPunchRecords();
          const updated = allRecords.map((r) => {
            if ((activePunchRecord && r.id === activePunchRecord.id) || r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--') {
              return {
                ...r,
                punchOutTime: nowTime,
                check_out_lat: lat,
                check_out_long: long,
                status: 'COMPLETED',
              };
            }
            return r;
          });
          await updatePunchRecordsList(updated);
          setActivePunchRecord(null);


          setAlertInfo({
            visible: true,
            title: t('session_deactivated_success'),
            message: t('session_deactivated_msg', { duration: nowTime }),
            type: 'success',
          });
        } else {
          // Activation
          await savePunchRecord(
            {
              id: `punch_${Date.now()}`,
              employee_id: empId,
              timestamp: Date.now(),
              date: todayDate,
              dayTitle: `${new Date().toLocaleDateString('en-US', { weekday: 'long' })}, ${new Date().getDate()} ${new Date().toLocaleDateString('en-US', { month: 'short' })}`,
              punchInTime: nowTime,
              punchOutTime: '--:--',
              check_in_lat: lat,
              check_in_long: long,
              siteName: 'AMA Facility',
              clientName: 'Client',
              status: 'PUNCHED-IN',
              officerName: user?.name || 'Officer',
            },
            empId
          );

          setAlertInfo({
            visible: true,
            title: t('session_activated_success'),
            message: t('session_activated_msg'),
            type: 'success',
          });
        }
        await refreshStatus();
      } else {
        reloadLiveCamera();
        setAlertInfo({
          visible: true,
          title: t('duty_status') || 'Duty Status Notice',
          message: res?.message || t('network_error'),
          type: 'error',
        });
      }
    } catch (err: any) {
      console.error('Status update error:', err);
      reloadLiveCamera();
      setAlertInfo({
        visible: true,
        title: 'Error',
        message: err?.message || 'Network or system error occurred while updating status.',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
      setIsVerifyingPhoto(false);
    }
  };

  const handleRetakePhoto = () => {
    reloadLiveCamera();
  };

  const displayImageUri = capturedPhotoUri || profileImage;

  return (
    <SwipeableBackWrapper>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScrollView contentContainerStyle={styles.content}>
          {/* Header Bar */}
          <View style={styles.headerBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
              <ArrowLeft color={colors.text} size={22} />
            </TouchableOpacity>

            <View style={styles.headerTitleCol}>
              <Text style={[styles.mainTitleText, { color: colors.text }]}>{t('duty_status')}</Text>
              <Text style={styles.userSubText}>
                {t('field_officer')}: <Text style={styles.userNameHighlight}>{user?.name || 'OFFICER'}</Text>
              </Text>
            </View>

            <View style={styles.timeCol}>
              <Text style={styles.localTimeLabel}>{t('local_time')}</Text>
              <Text style={[styles.localTimeDigits, { color: colors.text }]}>{localTime || '12:00:00'}</Text>
            </View>
          </View>

          {/* Buffer Warning Card */}
          {bufferError && (
            <View style={styles.bufferWarningCard}>
              <AlertTriangle color="#F59E0B" size={20} style={{ marginRight: 10 }} />
              <Text style={styles.bufferWarningText}>{bufferError}</Text>
            </View>
          )}

          {/* Status Badge Card */}
          <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.statusHeaderRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isOfficerActive ? '#10B981' : '#EF4444' },
                ]}
              />
              <Text
                style={[
                  styles.statusTitle,
                  { color: isOfficerActive ? '#10B981' : '#EF4444' },
                ]}
              >
                {isOfficerActive ? t('officer_active_duty') : t('officer_inactive_duty')}
              </Text>
            </View>
            <Text style={[styles.statusSubText, { color: colors.textVariant }]}>
              {isOfficerActive ? t('officer_active_helper') : t('officer_inactive_helper')}
            </Text>
          </View>

          {/* Live Camera Viewfinder & One-Step Capture Box */}
          <View style={[styles.photoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.photoCardHeader}>
              <View style={[styles.headerDot, { backgroundColor: isOfficerActive ? '#EF4444' : '#10B981' }]} />
              <Text style={[styles.photoCardTitle, { color: colors.text }]}>
                {t('live_photo_verification')} ({isOfficerActive ? t('inactive') : t('active')})
              </Text>
            </View>

            {/* Live Camera Viewfinder Container with Orange Corner Brackets */}
            <View
              style={[
                styles.viewfinderContainer,
                { backgroundColor: isDark ? '#000000' : '#0F172A' },
              ]}
            >
              {capturedPhotoUri ? (
                <Image source={{ uri: capturedPhotoUri }} style={styles.viewfinderImage} resizeMode="cover" />
              ) : isFocused && permission?.granted ? (
                <CameraView
                  key={`camera_feed_${cameraKey}`}
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing="front"
                  mirror={true}
                />
              ) : (
                <View style={styles.placeholderBox}>
                  <Camera color="#64748B" size={52} />
                  <Text style={[styles.placeholderPrompt, { color: colors.textVariant }]}>
                    {permission?.granted === false
                      ? 'CAMERA PERMISSION NEEDED'
                      : 'STARTING CAMERA PREVIEW...'}
                  </Text>
                  {!permission?.granted && (
                    <TouchableOpacity
                      style={styles.enableCamBtn}
                      onPress={requestPermission}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.enableCamBtnText}>Grant Camera Permission</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* 4 Viewfinder Orange Corner Brackets */}
              <View style={[styles.cornerBracket, styles.cornerTL]} pointerEvents="none" />
              <View style={[styles.cornerBracket, styles.cornerTR]} pointerEvents="none" />
              <View style={[styles.cornerBracket, styles.cornerBL]} pointerEvents="none" />
              <View style={[styles.cornerBracket, styles.cornerBR]} pointerEvents="none" />

              {/* Live camera indicator badge */}
              {!capturedPhotoUri && permission?.granted && (
                <View style={styles.liveBadge} pointerEvents="none">
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>LIVE CAMERA</Text>
                </View>
              )}

              {/* Center Face Reticle Overlay */}
              {!capturedPhotoUri && (
                <View style={styles.faceOvalReticle} pointerEvents="none" />
              )}

              {/* Loading overlay while verifying & activating */}
              {(isSubmitting || isVerifyingPhoto) && (
                <View style={styles.verifyingOverlay}>
                  <ActivityIndicator size="large" color="#FFFFFF" />
                  <Text style={styles.verifyingOverlayText}>
                    {isVerifyingPhoto ? 'Verifying Face Identity...' : isOfficerActive ? 'Deactivating...' : 'Activating...'}
                  </Text>
                </View>
              )}
            </View>

            {/* Retake Button (when photo is captured) */}
            {capturedPhotoUri && !isSubmitting && (
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.retakeButton}
                onPress={handleRetakePhoto}
              >
                <RefreshCw color="#3B82F6" size={16} style={{ marginRight: 6 }} />
                <Text style={styles.retakeBtnText}>Back to Live Camera</Text>
              </TouchableOpacity>
            )}

            {/* Single-Step Primary Action Button: Takes Photo + Verifies + Activates */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.capturePhotoButton,
                {
                  backgroundColor: isOfficerActive ? '#DC2626' : '#10B981',
                  opacity: isSubmitting || isVerifyingPhoto ? 0.75 : 1,
                },
              ]}
              onPress={handleCaptureAndToggleSession}
              disabled={isSubmitting || isVerifyingPhoto}
            >
              {isSubmitting || isVerifyingPhoto ? (
                <View style={styles.btnLoadingRow}>
                  <ActivityIndicator color="#FFFFFF" size="small" style={{ marginRight: 10 }} />
                  <Text style={styles.capturePhotoBtnText}>
                    {t('verifying_recording')}
                  </Text>
                </View>
              ) : (
                <View style={styles.btnRow}>
                  <Camera color="#FFFFFF" size={20} style={{ marginRight: 8 }} />
                  <Text style={styles.capturePhotoBtnText}>
                    {isOfficerActive ? t('capture_photo_deactivate') : t('capture_photo_activate')}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Helper Description Box */}
            <View
              style={[
                styles.readyHelperBox,
                {
                  backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : '#F8FAFC',
                  borderColor: isDark ? '#1E293B' : '#E2E8F0',
                },
              ]}
            >
              <Text style={[styles.readyHelperText, { color: colors.textVariant }]}>
                <Text style={styles.readyHelperTitle}>{t('face_verif_helper_title')}</Text>
                {t('face_verif_helper_desc')}
              </Text>
            </View>
          </View>

          <Text style={styles.copyrightText}>© 2026 HUMANKIND TECHNOLOGY</Text>
        </ScrollView>

        <CustomAlertModal
          visible={alertInfo.visible}
          title={alertInfo.title}
          message={alertInfo.message}
          type={alertInfo.type}
          onConfirm={alertInfo.onConfirm}
          confirmText={alertInfo.confirmText}
          onClose={() => {
            const isSuccess = alertInfo.type === 'success';
            const requiresPhoto = !isOfficerActive && !hasProfilePhoto;
            setAlertInfo((prev) => ({ ...prev, visible: false }));
            if (isSuccess || requiresPhoto) {
              router.replace('/(tabs)/dashboard');
            } else {
              reloadLiveCamera();
            }
          }}
        />
      </SafeAreaView>
    </SwipeableBackWrapper>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: Platform.OS === 'android' ? 10 : 0,
  },
  backBtn: {
    padding: 6,
    marginRight: 6,
  },
  headerTitleCol: {
    flex: 1,
  },
  mainTitleText: {
    fontSize: 20,
    fontWeight: '800',
  },
  userSubText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
  },
  userNameHighlight: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  sessionIdText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '600',
  },
  timeCol: {
    alignItems: 'flex-end',
  },
  localTimeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  localTimeDigits: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },

  bufferWarningCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  bufferWarningText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    lineHeight: 18,
  },

  statusCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  statusSubText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },

  photoCard: {
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
  },
  photoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  photoCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  viewfinderContainer: {
    width: '100%',
    height: 330,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderImage: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  placeholderBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  placeholderPrompt: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 12,
  },
  cornerBracket: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderColor: '#FF5722',
  },
  cornerTL: {
    top: 18,
    left: 18,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 14,
  },
  cornerTR: {
    top: 18,
    right: 18,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 14,
  },
  cornerBL: {
    bottom: 18,
    left: 18,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 14,
  },
  cornerBR: {
    bottom: 18,
    right: 18,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 14,
  },
  capturePhotoButton: {
    width: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  capturePhotoBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  readyHelperBox: {
    width: '100%',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
  },
  readyHelperText: {
    fontSize: 13,
    lineHeight: 19,
  },
  readyHelperTitle: {
    color: '#3B82F6',
    fontWeight: '800',
  },
  photoCapturedSuccessText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
    textAlign: 'center',
    marginTop: 14,
  },
  verifyingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  verifyingText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '600',
  },

  actionButton: {
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  liveBadge: {
    position: 'absolute',
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 6,
  },
  liveBadgeText: {
    color: '#22C55E',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  faceOvalReticle: {
    width: 170,
    height: 220,
    borderRadius: 85,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  enableCamBtn: {
    marginTop: 12,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  enableCamBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  verifyingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  verifyingOverlayText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 14,
    textAlign: 'center',
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  retakeBtnText: {
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: '700',
  },
  copyrightText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 24,
  },
});
