import React, { useState, useEffect } from 'react';
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
import { useRouter, Stack } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
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
import { SwipeableBackWrapper } from '../components/SwipeableBackWrapper';
import { CustomAlertModal } from '../components/ui/CustomAlertModal';
import { getPunchRecords, savePunchRecord, updatePunchRecordsList, getActiveCheckIns } from '../services/db';
import { getActiveSiteVisitSession } from '../services/siteService';

export default function MarkAttendanceScreen() {
  const { user, profileImage } = useAuth();
  const { markAttendance, validateSelfie, todayRecord, refreshStatus, profileData } = useAttendance();
  const { colors, isDark } = useTheme();
  const router = useRouter();

  // Check if officer has a registered profile photo
  const hasProfilePhoto = Boolean(
    profileImage ||
    (profileData && profileData.profile_photo) ||
    (user && (user as any).profile_photo)
  );

  const [localTime, setLocalTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
  const [isVerifyingPhoto, setIsVerifyingPhoto] = useState(false);

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
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  // Determine current active status strictly from server record and local active session
  const isServerActive = !!(todayRecord && todayRecord.check_in && !todayRecord.check_out);
  const isOfficerActive = isServerActive || !!activePunchRecord;

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

  // Check active punch session & 10-minute buffer without capturing any photo
  useEffect(() => {
    (async () => {
      try {
        const empId = user?.employee_id || (user?.id ? String(user.id) : '') || user?.username || '';
        const records = await getPunchRecords(empId);
        const nowMs = Date.now();
        const active = records.find((r) => {
          const isPunchedIn = r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--';
          const punchMs = r.timestamp || 0;
          const isWithin16Hours = (nowMs - punchMs) < 16 * 3600 * 1000;
          return isPunchedIn && isWithin16Hours;
        });

        if (active) {
          setActivePunchRecord(active);
          const punchInTimeMs = active.timestamp || Date.now() - 3 * 60 * 1000;
          const diffMins = Math.floor((Date.now() - punchInTimeMs) / 60000);
          if (diffMins < 10) {
            const remaining = 10 - diffMins;
            setBufferError(
              `10-Minute Buffer Required: Activated at ${active.punchInTime || 'recently'} (${diffMins} mins ago). Please wait ${remaining} more mins to deactivate.`
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
    })();
  }, [user]);

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

  // MANUAL image capture triggered ONLY upon explicit tap on avatar/photo container
  const handleManualImageTap = async () => {
    if (isSubmitting) return;

    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Camera Permission Required',
          'Camera access is required to capture your verification photo for activation.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        cameraType: ImagePicker.CameraType.front,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const photoUri = result.assets[0].uri;
        setCapturedPhotoUri(photoUri);

        // Optional server-side face validation feedback
        setIsVerifyingPhoto(true);
        try {
          const vRes = await validateSelfie(photoUri);
          if (vRes && !vRes.success) {
            Alert.alert(
              'Face Verification Notice',
              vRes.message || 'Face unclear in photo. Please ensure good lighting and clear positioning.'
            );
          }
        } catch (valErr) {
          console.warn('Selfie validation error:', valErr);
        } finally {
          setIsVerifyingPhoto(false);
        }
      }
    } catch (err) {
      console.error('Manual camera capture error:', err);
      Alert.alert('Capture Error', 'Could not open camera. Please try again.');
    }
  };

  // Explicit Activation or Deactivation handler
  const handleToggleDutyStatus = async () => {
    if (isSubmitting) return;

    // Check location
    const lat = location?.latitude || 18.605555;
    const long = location?.longitude || 73.827115;
    const empId = user?.employee_id || (user?.id ? String(user.id) : '') || user?.username || '';
    const todayDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isOfficerActive) {
      // --- DEACTIVATION WORKFLOW ---
      // Check buffer
      if (bufferError) {
        setAlertInfo({
          visible: true,
          title: 'Buffer Required',
          message: bufferError,
          type: 'error',
        });
        return;
      }

      // Check active site visit session
      const empOid = user?.id || (user as any)?.oid || user?.employee_id || 7558;
      let activeSiteSession = await getActiveSiteVisitSession(empOid);
      if (!activeSiteSession) {
        const localCheckIns = await getActiveCheckIns();
        const activeKeys = Object.keys(localCheckIns);
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
        }
      }

      if (activeSiteSession) {
        setAlertInfo({
          visible: true,
          title: 'Site Check-Out Required',
          message: `You are currently checked into "${activeSiteSession.site_name || 'Site Visit'}". Please complete and check out from your active site visit before deactivating.`,
          type: 'error',
        });
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await markAttendance(lat, long);
        if (res && res.success) {
          // Update local DB cache
          const allRecords = await getPunchRecords();
          const updated = allRecords.map((r) => {
            if (activePunchRecord && r.id === activePunchRecord.id) {
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
            title: 'Duty Deactivated',
            message: `Officer status is now INACTIVE. Duty session completed at ${nowTime}.`,
            type: 'success',
          });
          await refreshStatus();
        } else {
          setAlertInfo({
            visible: true,
            title: 'Deactivation Failed',
            message: res?.message || 'Could not deactivate duty on server. Please try again.',
            type: 'error',
          });
        }
      } catch (err) {
        console.error('Deactivation error:', err);
        setAlertInfo({
          visible: true,
          title: 'Error',
          message: 'Network or system error occurred while deactivating duty.',
          type: 'error',
        });
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // --- ACTIVATION WORKFLOW ---
      // 1. Mandatory Profile Photo Check: Officer MUST have an uploaded profile photo in the system!
      if (!hasProfilePhoto) {
        setAlertInfo({
          visible: true,
          title: 'Profile Photo Required',
          message: 'You have not uploaded a profile photo yet. Please upload your profile photo first in Settings before activating duty.',
          type: 'error',
        });
        return;
      }

      // 2. Mandatory Verification Photo: Must capture selfie to activate duty
      if (!capturedPhotoUri) {
        setAlertInfo({
          visible: true,
          title: 'Verification Photo Required',
          message: 'Please tap the camera box above to take your verification photo before activating duty.',
          type: 'error',
        });
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await markAttendance(lat, long);
        if (res && res.success) {
          // Save active record locally
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
            title: 'Duty Activated',
            message: `Officer status is now ACTIVE. Duty session started at ${nowTime}.`,
            type: 'success',
          });
          await refreshStatus();
        } else {
          setAlertInfo({
            visible: true,
            title: 'Activation Failed',
            message: res?.message || 'Could not activate duty on server. Please check connection and retry.',
            type: 'error',
          });
        }
      } catch (err) {
        console.error('Activation error:', err);
        setAlertInfo({
          visible: true,
          title: 'Error',
          message: 'Network or system error occurred while activating duty.',
          type: 'error',
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const displayImageUri = capturedPhotoUri || profileImage;

  return (
    <SwipeableBackWrapper>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <ScrollView contentContainerStyle={styles.content}>
          {/* Header Bar */}
          <View style={styles.headerBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
              <ArrowLeft color={colors.text} size={22} />
            </TouchableOpacity>

            <View style={styles.headerTitleCol}>
              <Text style={[styles.mainTitleText, { color: colors.text }]}>Officer Duty Status</Text>
              <Text style={styles.userSubText}>
                Officer: <Text style={styles.userNameHighlight}>{user?.name || 'PAPPU KUMAR'}</Text>
              </Text>
              <Text style={styles.sessionIdText}>
                ID: {user?.employee_id || 'EMP002'}
              </Text>
            </View>

            <View style={styles.timeCol}>
              <Text style={styles.localTimeLabel}>LOCAL TIME</Text>
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
                {isOfficerActive ? 'STATUS: ACTIVE' : 'STATUS: INACTIVE'}
              </Text>
            </View>
            <Text style={[styles.statusSubText, { color: colors.textVariant }]}>
              {isOfficerActive
                ? 'Your duty session is active. Background location tracking and visit logging are enabled.'
                : 'Your duty session is currently inactive. Tap your photo below to verify, then tap Activate to start duty.'}
            </Text>
          </View>

          {/* Manual Photo Capture Box */}
          <View style={[styles.photoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.photoCardHeader}>
              <View style={[styles.headerDot, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.photoCardTitle, { color: colors.text }]}>
                VERIFY FACE IDENTITY ({isOfficerActive ? 'DEACTIVATE DUTY' : 'ACTIVATE DUTY'})
              </Text>
            </View>

            {/* Square Viewfinder Container with Orange Corner Brackets */}
            <TouchableOpacity
              activeOpacity={0.9}
              style={[
                styles.viewfinderContainer,
                { backgroundColor: isDark ? '#0A1128' : '#F1F5F9' },
              ]}
              onPress={handleManualImageTap}
              disabled={isSubmitting || isVerifyingPhoto}
            >
              {displayImageUri ? (
                <Image source={{ uri: displayImageUri }} style={styles.viewfinderImage} resizeMode="cover" />
              ) : (
                <View style={styles.placeholderBox}>
                  <User color="#64748B" size={72} />
                  <Text style={[styles.placeholderPrompt, { color: colors.textVariant }]}>
                    POSITION FACE INSIDE FRAME
                  </Text>
                </View>
              )}

              {/* 4 Viewfinder Orange Corner Brackets */}
              <View style={[styles.cornerBracket, styles.cornerTL]} />
              <View style={[styles.cornerBracket, styles.cornerTR]} />
              <View style={[styles.cornerBracket, styles.cornerBL]} />
              <View style={[styles.cornerBracket, styles.cornerBR]} />
            </TouchableOpacity>

            {/* Blue Capture Photo Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.capturePhotoButton}
              onPress={handleManualImageTap}
              disabled={isSubmitting || isVerifyingPhoto}
            >
              <Camera color="#FFFFFF" size={20} style={{ marginRight: 8 }} />
              <Text style={styles.capturePhotoBtnText}>
                {capturedPhotoUri ? 'Retake Photo' : 'Capture Photo'}
              </Text>
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
                <Text style={styles.readyHelperTitle}>Ready to Capture: </Text>
                Position your face clearly within the frame and tap "Capture Photo" to {isOfficerActive ? 'deactivate duty' : 'activate duty'}.
              </Text>
            </View>

            {isVerifyingPhoto ? (
              <View style={styles.verifyingRow}>
                <ActivityIndicator size="small" color="#3B82F6" style={{ marginRight: 8 }} />
                <Text style={styles.verifyingText}>Verifying face quality...</Text>
              </View>
            ) : capturedPhotoUri ? (
              <Text style={styles.photoCapturedSuccessText}>
                ✓ Verification photo ready. Tap button below to proceed.
              </Text>
            ) : null}
          </View>

          {/* Main Action Button */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.actionButton,
              {
                backgroundColor: isOfficerActive ? '#DC2626' : '#10B981',
                opacity: isSubmitting ? 0.7 : 1,
              },
            ]}
            onPress={handleToggleDutyStatus}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <View style={styles.btnLoadingRow}>
                <ActivityIndicator color="#FFFFFF" size="small" style={{ marginRight: 10 }} />
                <Text style={styles.actionBtnText}>
                  {isOfficerActive ? 'DEACTIVATING...' : 'ACTIVATING...'}
                </Text>
              </View>
            ) : (
              <View style={styles.btnRow}>
                <Power color="#FFFFFF" size={20} style={{ marginRight: 10 }} />
                <Text style={styles.actionBtnText}>
                  {isOfficerActive ? 'DEACTIVATE DUTY' : 'ACTIVATE DUTY'}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.copyrightText}>© 2026 HUMANKIND TECHNOLOGY</Text>
        </ScrollView>

        <CustomAlertModal
          visible={alertInfo.visible}
          title={alertInfo.title}
          message={alertInfo.message}
          type={alertInfo.type}
          onClose={() => {
            const isSuccess = alertInfo.type === 'success';
            setAlertInfo({ ...alertInfo, visible: false });
            if (isSuccess) {
              router.replace('/(tabs)/dashboard');
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
  copyrightText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 24,
  },
});
