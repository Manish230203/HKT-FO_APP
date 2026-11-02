import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
  Modal,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  QrCode,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  Camera,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  Star,
  Send,
  Flashlight,
  FlashlightOff,
  Keyboard,
  Info,
} from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../context/LanguageContext';
import {
  getQuickLocation,
  getHighAccuracyLocation,
  haversineDistanceMeters,
  TourDraft,
  TourCheckpoint,
  TourQuestion,
  LocalPhoto,
  QuestionResponse,
  getTourDraft,
  saveTourDraft,
  startTourVisit,
  verifyCheckpointOnServer,
  submitCheckpointResponses,
  uploadTourEvidence,
  generateUUID,
} from '../../../services/siteTourService';

export default function TourExecuteScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();

  const params = useLocalSearchParams<{
    executionUuid: string;
    tourOid: string;
    siteId?: string;
    siteName?: string;
    customVisitId?: string;
    clientName?: string;
    sessionId?: string;
    plannedId?: string;
  }>();

  const executionUuid = params.executionUuid || '';
  const siteId = params.siteId ? parseInt(params.siteId, 10) : undefined;
  const siteName = params.siteName ? decodeURIComponent(params.siteName) : 'Site';
  const customVisitId = params.customVisitId ? parseInt(params.customVisitId, 10) : undefined;
  const clientName = params.clientName ? decodeURIComponent(params.clientName) : '';
  const sessionId = params.sessionId ? parseInt(params.sessionId, 10) : undefined;
  const plannedId = params.plannedId || '';

  const [draft, setDraft] = useState<TourDraft | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);

  // Active expanded checkpoint for viewing checklist
  const [expandedCpOid, setExpandedCpOid] = useState<number | null>(null);

  // QR Scanner Modal State
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [qrModalVisible, setQrModalVisible] = useState<boolean>(false);
  const [activeScanningCp, setActiveScanningCp] = useState<TourCheckpoint | null>(null);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [manualCodeModal, setManualCodeModal] = useState<boolean>(false);
  const [manualCodeInput, setManualCodeInput] = useState<string>('');

  // Load draft on screen mount
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const d = await getTourDraft(executionUuid);
        if (d) {
          setDraft(d);
          // Set first active or incomplete checkpoint as expanded
          const activeCp = d.blueprint.checkpoints.find(
            (cp) => d.checkpoints[cp.oid]?.status === 'active'
          );
          if (activeCp) {
            setExpandedCpOid(activeCp.oid);
          } else {
            setExpandedCpOid(d.blueprint.checkpoints[0]?.oid || null);
          }
        } else {
          Alert.alert('Draft Not Found', 'Could not locate active tour draft.', [
            { text: 'Go Back', onPress: () => router.back() },
          ]);
        }
      } catch (e) {
        console.error('Error loading draft in execute:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [executionUuid]);

  // Persist updated draft
  const persistDraftUpdate = async (updated: TourDraft) => {
    setDraft(updated);
    await saveTourDraft(updated);
  };

  const getEffectiveTourVisitOid = async (): Promise<number> => {
    if (draft?.tour_visit_oid) return draft.tour_visit_oid;
    if (draft) {
      try {
        const startRes = await startTourVisit({
          tour_oid: draft.tour_oid,
          site_oid: draft.site_id,
          custom_visit_oid: draft.custom_visit_id,
          session_id: draft.session_id,
          execution_uuid: draft.execution_uuid,
        });
        if (startRes && startRes.tour_visit_oid) {
          draft.tour_visit_oid = startRes.tour_visit_oid;
          await persistDraftUpdate(draft);
          return startRes.tour_visit_oid;
        }
      } catch (err) {
        console.warn('Could not lazily initialize tour visit record on backend:', err);
      }
    }
    return draft?.tour_oid || 101;
  };

  // Checkpoint Verification Handler
  const handleOpenVerification = (cp: TourCheckpoint) => {
    if (cp.verification_mode === 'GPS_ONLY') {
      executeGpsVerification(cp);
    } else {
      setActiveScanningCp(cp);
      setQrModalVisible(true);
    }
  };

  const executeGpsVerification = async (cp: TourCheckpoint) => {
    try {
      setVerifying(true);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // 1. High-accuracy live GPS query
      let lat = 0;
      let lng = 0;
      let accuracy = 10;
      const clientTimestamp = new Date().toISOString();

      try {
        const loc = await getHighAccuracyLocation();
        lat = loc.latitude;
        lng = loc.longitude;
        accuracy = loc.accuracy || 10;
      } catch (locErr) {
        console.warn('GPS location error:', locErr);
      }

      // 2. Local Pre-Check
      const targetLat = cp.latitude;
      const targetLng = cp.longitude;
      const allowedRadius = cp.geofence_radius || 30;

      if (lat !== 0 && lng !== 0 && targetLat != null && targetLng != null) {
        const localDistance = haversineDistanceMeters(lat, lng, targetLat, targetLng);
        if (localDistance > allowedRadius) {
          Alert.alert(
            'Location Out of Range',
            `You are ${Math.round(localDistance)} meters away from this checkpoint. You must be within ${Math.round(allowedRadius)} meters to verify.`
          );
          setVerifying(false);
          return;
        }
      }

      // 3. Authoritative Backend Verification
      const targetVisitOid = await getEffectiveTourVisitOid();
      const res = await verifyCheckpointOnServer(targetVisitOid, {
        checkpoint_oid: cp.oid,
        latitude: lat,
        longitude: lng,
        accuracy_meters: accuracy,
        client_timestamp: clientTimestamp,
      });

      const isVerified = Boolean(
        res && (res.verification_status === 'VERIFIED' || res.verified === true)
      );

      if (isVerified && draft) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        const calculatedDist = res.calculated_distance_meters != null
          ? res.calculated_distance_meters
          : (res.distance_meters != null ? res.distance_meters : 0);

        const updatedCp = {
          ...draft.checkpoints[cp.oid],
          verification_status: 'server_verified' as const,
          verified_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          verified_latitude: lat,
          verified_longitude: lng,
          accuracy_meters: accuracy,
          calculated_distance_meters: calculatedDist,
          client_timestamp: clientTimestamp,
        };

        const updatedDraft: TourDraft = {
          ...draft,
          checkpoints: {
            ...draft.checkpoints,
            [cp.oid]: updatedCp,
          },
          last_saved_at: new Date().toISOString(),
        };

        await persistDraftUpdate(updatedDraft);
        setExpandedCpOid(cp.oid);

        Alert.alert(
          t('verification_success_title') || 'Verification Successful',
          `Checkpoint '${cp.name}' verified successfully via GPS! Please complete the inspection questions.`
        );
      } else {
        const failReason = res?.failure_reason || res?.message || 'Verification rejected by server.';
        Alert.alert(t('scan_failed_title') || 'Verification Failed', failReason);
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      let msg = 'GPS verification failed';
      if (typeof detail === 'string') {
        msg = detail;
      } else if (detail && typeof detail === 'object') {
        msg = detail.message || detail.failure_reason || JSON.stringify(detail);
      } else if (e?.message) {
        msg = e.message;
      }
      Alert.alert(t('scan_failed_title') || 'Verification Failed', msg);
    } finally {
      setVerifying(false);
    }
  };

  const handleBarcodeScanned = async (scannedCode: string) => {
    if (!activeScanningCp || verifying) return;
    setVerifying(true);
    setQrModalVisible(false);

    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // 1. Acquire live device GPS on QR scan with high accuracy
      let lat = 0;
      let lng = 0;
      let accuracy = 10;
      const clientTimestamp = new Date().toISOString();

      try {
        const loc = await getHighAccuracyLocation();
        lat = loc.latitude;
        lng = loc.longitude;
        accuracy = loc.accuracy || 10;
      } catch (locErr) {
        console.warn('GPS location error during QR scan:', locErr);
      }

      // 2. Local Pre-Check (Instant UX Feedback)
      const targetLat = activeScanningCp.latitude;
      const targetLng = activeScanningCp.longitude;
      const allowedRadius = activeScanningCp.geofence_radius || 30;
      const verifMode = activeScanningCp.verification_mode || 'GPS_AND_QR';

      if (
        (verifMode === 'GPS_AND_QR' || (targetLat != null && targetLng != null)) &&
        lat !== 0 && lng !== 0 && targetLat != null && targetLng != null
      ) {
        const localDistance = haversineDistanceMeters(lat, lng, targetLat, targetLng);
        if (localDistance > allowedRadius) {
          Alert.alert(
            'Location Out of Range',
            `You are ${Math.round(localDistance)} meters away from this checkpoint. You must be within ${Math.round(allowedRadius)} meters to verify.`
          );
          setVerifying(false);
          setActiveScanningCp(null);
          return;
        }
      }

      // 3. Backend API Request
      const targetVisitOid = await getEffectiveTourVisitOid();
      const res = await verifyCheckpointOnServer(targetVisitOid, {
        checkpoint_oid: activeScanningCp.oid,
        qr_code_scanned: scannedCode.trim(),
        qr_code: scannedCode.trim(),
        latitude: lat,
        longitude: lng,
        accuracy_meters: accuracy,
        client_timestamp: clientTimestamp,
      });

      // 4. Handling Backend Response
      const isVerified = Boolean(
        res && (res.verification_status === 'VERIFIED' || res.verified === true)
      );

      if (isVerified && draft) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        const calculatedDist = res.calculated_distance_meters != null
          ? res.calculated_distance_meters
          : (res.distance_meters != null ? res.distance_meters : 0);

        const updatedCp = {
          ...draft.checkpoints[activeScanningCp.oid],
          verification_status: 'server_verified' as const,
          verified_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          verified_latitude: lat,
          verified_longitude: lng,
          accuracy_meters: accuracy,
          calculated_distance_meters: calculatedDist,
          client_timestamp: clientTimestamp,
          scanned_qr: scannedCode.trim(),
        };

        const updatedDraft: TourDraft = {
          ...draft,
          checkpoints: {
            ...draft.checkpoints,
            [activeScanningCp.oid]: updatedCp,
          },
          last_saved_at: new Date().toISOString(),
        };

        await persistDraftUpdate(updatedDraft);
        setExpandedCpOid(activeScanningCp.oid);

        Alert.alert(
          t('verification_success_title') || 'Verification Successful',
          `Checkpoint '${activeScanningCp.name}' scanned & verified successfully! You may now fill in the checklist.`
        );
      } else {
        const failReason = res?.failure_reason || res?.message || 'Verification rejected by server.';
        Alert.alert(t('scan_failed_title') || 'Verification Failed', failReason);
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      let msg = 'QR verification failed';
      if (typeof detail === 'string') {
        msg = detail;
      } else if (detail && typeof detail === 'object') {
        msg = detail.message || detail.failure_reason || JSON.stringify(detail);
      } else if (e?.message) {
        msg = e.message;
      }
      Alert.alert(t('scan_failed_title') || 'Verification Failed', msg);
    } finally {
      setVerifying(false);
      setActiveScanningCp(null);
    }
  };

  // Question Answer Value Change
  const handleAnswerChange = async (cpOid: number, q: TourQuestion, val: string) => {
    if (!draft) return;
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }

    const currentCp = draft.checkpoints[cpOid] || { checkpoint_oid: cpOid, responses: {} };
    const currentResp = currentCp.responses[q.oid] || {
      question_oid: q.oid,
      response_value: '',
      comment: '',
      is_critical_violation: false,
      is_failure: false,
      photos: [],
      answered_at: new Date().toISOString(),
    };

    const isFailure = Boolean(q.failure_values && q.failure_values.includes(val));
    const isCriticalViolation = Boolean(isFailure && q.is_critical);

    const updatedResp: QuestionResponse = {
      ...currentResp,
      response_value: val,
      is_failure: isFailure,
      is_critical_violation: isCriticalViolation,
      answered_at: new Date().toISOString(),
    };

    const updatedDraft: TourDraft = {
      ...draft,
      checkpoints: {
        ...draft.checkpoints,
        [cpOid]: {
          ...currentCp,
          responses: {
            ...currentCp.responses,
            [q.oid]: updatedResp,
          },
        },
      },
      last_saved_at: new Date().toISOString(),
    };

    await persistDraftUpdate(updatedDraft);
  };

  // Comment Change
  const handleCommentChange = async (cpOid: number, qOid: number, text: string) => {
    if (!draft) return;
    const currentCp = draft.checkpoints[cpOid];
    if (!currentCp) return;
    const currentResp = currentCp.responses[qOid];
    if (!currentResp) return;

    const updatedResp: QuestionResponse = {
      ...currentResp,
      comment: text,
    };

    const updatedDraft: TourDraft = {
      ...draft,
      checkpoints: {
        ...draft.checkpoints,
        [cpOid]: {
          ...currentCp,
          responses: {
            ...currentCp.responses,
            [qOid]: updatedResp,
          },
        },
      },
      last_saved_at: new Date().toISOString(),
    };

    await persistDraftUpdate(updatedDraft);
  };

  // Photo Capture
  const handleCapturePhoto = async (cpOid: number, q: TourQuestion) => {
    if (!draft) return;
    const currentCp = draft.checkpoints[cpOid];
    const currentResp = currentCp?.responses[q.oid];
    const currentPhotos = currentResp?.photos || [];

    if (currentPhotos.length >= q.max_photos) {
      Alert.alert(t('required') || 'Maximum Photos Reached', `This question allows up to ${q.max_photos} photos.`);
      return;
    }

    Alert.alert(
      t('attach_photo_title') || 'Attach Question Photo',
      t('choose_camera_gallery') || 'Take a picture of the inspected checkpoint item:',
      [
        {
          text: t('camera_option') || 'Camera',
          onPress: async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              Alert.alert(t('perm_required_title') || 'Permission Denied', t('camera_perm_checkpoint_msg') || 'Camera access is required to attach inspection evidence.');
              return;
            }
            const res = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.6,
            });
            if (!res.canceled && res.assets && res.assets[0]) {
              await addPhotoToQuestion(cpOid, q.oid, res.assets[0].uri);
            }
          },
        },
        {
          text: t('gallery_option') || 'Gallery',
          onPress: async () => {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
              Alert.alert(t('perm_required_title') || 'Permission Denied', t('gallery_perm_checkpoint_msg') || 'Gallery access is required.');
              return;
            }
            const res = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.6,
            });
            if (!res.canceled && res.assets && res.assets[0]) {
              await addPhotoToQuestion(cpOid, q.oid, res.assets[0].uri);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const addPhotoToQuestion = async (cpOid: number, qOid: number, localUri: string) => {
    if (!draft) return;
    const currentCp = draft.checkpoints[cpOid] || { checkpoint_oid: cpOid, responses: {} };
    const currentResp = currentCp.responses[qOid] || {
      question_oid: qOid,
      response_value: '',
      comment: '',
      is_critical_violation: false,
      is_failure: false,
      photos: [],
      answered_at: new Date().toISOString(),
    };

    const newPhoto: LocalPhoto = {
      id: generateUUID(),
      local_uri: localUri,
      upload_status: 'pending',
      captured_at: new Date().toISOString(),
    };

    const updatedPhotos = [...(currentResp.photos || []), newPhoto];
    const updatedResp: QuestionResponse = {
      ...currentResp,
      photos: updatedPhotos,
    };

    const updatedDraft: TourDraft = {
      ...draft,
      checkpoints: {
        ...draft.checkpoints,
        [cpOid]: {
          ...currentCp,
          responses: {
            ...currentCp.responses,
            [qOid]: updatedResp,
          },
        },
      },
      last_saved_at: new Date().toISOString(),
    };

    await persistDraftUpdate(updatedDraft);

    // Background upload attempt (non-blocking)
    try {
      const serverUrl = await uploadTourEvidence(localUri, {
        checkpoint_oid: cpOid,
        question_oid: qOid,
        execution_uuid: draft.execution_uuid,
      });
      newPhoto.uploaded_url = serverUrl;
      newPhoto.upload_status = 'uploaded';
      await persistDraftUpdate(updatedDraft);
    } catch (e) {
      console.warn('Local photo retained, background upload failed:', e);
    }
  };

  const handleRemovePhoto = async (cpOid: number, qOid: number, photoId: string) => {
    if (!draft) return;
    const currentCp = draft.checkpoints[cpOid];
    if (!currentCp) return;
    const currentResp = currentCp.responses[qOid];
    if (!currentResp) return;

    const filtered = (currentResp.photos || []).filter((p) => p.id !== photoId);
    const updatedResp: QuestionResponse = {
      ...currentResp,
      photos: filtered,
    };

    const updatedDraft: TourDraft = {
      ...draft,
      checkpoints: {
        ...draft.checkpoints,
        [cpOid]: {
          ...currentCp,
          responses: {
            ...currentCp.responses,
            [qOid]: updatedResp,
          },
        },
      },
      last_saved_at: new Date().toISOString(),
    };

    await persistDraftUpdate(updatedDraft);
  };

  // Submit Checkpoint Checklist
  const handlePressSubmitCheckpoint = (cp: TourCheckpoint) => {
    const cpExec = draft?.checkpoints[cp.oid];
    if (!cpExec || cpExec.verification_status !== 'server_verified') {
      Alert.alert(t('required') || 'Verification Required', t('verification_required_msg') || 'You must verify this checkpoint before submitting responses.');
      return;
    }

    // Validate mandatory questions, required comments on failure, min photos
    for (const q of cp.questions) {
      const resp = cpExec.responses[q.oid];
      if (q.is_mandatory && (!resp || !resp.response_value)) {
        Alert.alert(t('required') || 'Question Required', `${t('mandatory_question_prompt') || 'Please answer the mandatory question:'}\n"${q.text}"`);
        return;
      }
      if (resp && resp.is_failure && q.requires_comment_on_failure && (!resp.comment || !resp.comment.trim())) {
        Alert.alert(
          t('required') || 'Remark Required on Failure',
          `${t('remark_required_failed_q') || 'A written remark is required for the failed question:'}\n"${q.text}"`
        );
        return;
      }
      if (q.min_photos > 0) {
        const photoCount = resp?.photos?.length || 0;
        if (photoCount < q.min_photos) {
          const needed = q.min_photos - photoCount;
          Alert.alert(
            t('attach_photo_required') || 'Attach Photo (Required)',
            `Please attach at least ${q.min_photos} photo(s) (${needed} more required) for:\n\n"${q.text}"`
          );
          return;
        }
      }
    }

    // Confirmation dialog as requested
    Alert.alert(
      t('confirm_submission') || 'Confirm Submission',
      t('confirm_checklist_checkpoint_msg', { checkpoint: cp.name }) || `Are you sure you want to submit the checklist answers for checkpoint '${cp.name}'?`,
      [
        { text: t('cancel') || 'CANCEL', style: 'cancel' },
        {
          text: t('submit') || 'SUBMIT',
          onPress: () => executeSubmitCheckpoint(cp),
        },
      ]
    );
  };

  const executeSubmitCheckpoint = async (cp: TourCheckpoint) => {
    if (!draft) return;
    try {
      setSubmitting(true);
      const cpExec = draft.checkpoints[cp.oid];

      // Format responses payload
      const responseItems = cp.questions.map((q) => {
        const r = cpExec.responses[q.oid] || {
          response_value: '',
          comment: '',
          is_critical_violation: false,
          is_failure: false,
          photos: [],
        };
        const photoUrls = (r.photos || [])
          .map((p) => p.uploaded_url)
          .filter((u): u is string => Boolean(u));

        return {
          question_oid: q.oid,
          response_value: r.response_value,
          comment: r.comment,
          is_critical_violation: r.is_critical_violation,
          is_failure: r.is_failure,
          photo_urls: photoUrls,
        };
      });

      // Submit to backend
      try {
        const targetVisitOid = await getEffectiveTourVisitOid();
        await submitCheckpointResponses(targetVisitOid, {
          checkpoint_oid: cp.oid,
          responses: responseItems,
          latitude: cpExec.verified_latitude,
          longitude: cpExec.verified_longitude,
        });
      } catch (subErr) {
        console.warn('Backend checkpoint response submission pending offline:', subErr);
      }

      // Mark this checkpoint COMPLETED, unlock next checkpoint
      const currentIndex = draft.blueprint.checkpoints.findIndex((c) => c.oid === cp.oid);
      const nextCp = draft.blueprint.checkpoints[currentIndex + 1];

      const updatedCheckpoints = { ...draft.checkpoints };
      updatedCheckpoints[cp.oid] = {
        ...cpExec,
        status: 'completed' as const,
      };

      if (nextCp) {
        updatedCheckpoints[nextCp.oid] = {
          ...(updatedCheckpoints[nextCp.oid] || { checkpoint_oid: nextCp.oid, responses: {} }),
          status: 'active' as const,
        };
        setExpandedCpOid(nextCp.oid);
      } else {
        setExpandedCpOid(null);
      }

      const updatedDraft: TourDraft = {
        ...draft,
        checkpoints: updatedCheckpoints,
        last_saved_at: new Date().toISOString(),
      };

      await persistDraftUpdate(updatedDraft);

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      if (!nextCp) {
        Alert.alert(
          t('all_checkpoints_verified') || 'Tour Completed! All checkpoints verified.',
          t('tour_completed_all_success') || 'You have successfully completed and verified all checkpoints in this tour.',
          [{ text: t('continue') || 'Proceed to Summary', onPress: handleProceedToSummary }]
        );
      } else {
        Alert.alert(
          t('checklist_submitted_title') || 'Checkpoint Completed',
          t('checkpoint_submitted_msg', { checkpoint: cp.name }) || `Checkpoint '${cp.name}' completed! Checkpoint #${nextCp.order} '${nextCp.name}' is now unlocked.`
        );
      }
    } catch (e: any) {
      Alert.alert(t('error') || 'Submission Error', e?.message || 'Failed to submit checkpoint responses');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProceedToSummary = () => {
    router.replace({
      pathname: '/visits/tours/tour-summary',
      params: {
        executionUuid: executionUuid,
        tourOid: String(draft?.tour_oid || params.tourOid),
        tourVisitOid: String(draft?.tour_visit_oid || ''),
        siteId: siteId ? String(siteId) : '',
        siteName: encodeURIComponent(siteName),
        customVisitId: customVisitId ? String(customVisitId) : '',
        clientName: encodeURIComponent(clientName),
        sessionId: sessionId ? String(sessionId) : '',
        plannedId: plannedId,
      },
    });
  };

  if (loading || !draft) {
    return (
      <View style={[styles.centerBox, { backgroundColor: isDark ? '#0A1128' : '#F4F7FA' }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={[styles.loadingText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
          Loading tour checkpoints...
        </Text>
      </View>
    );
  }

  const checkpointsList = draft.blueprint.checkpoints || [];
  const completedCount = checkpointsList.filter(
    (cp) => draft.checkpoints[cp.oid]?.status === 'completed'
  ).length;
  const totalCount = checkpointsList.length;
  const allCompleted = totalCount > 0 && completedCount === totalCount;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const darkNavyBg = isDark ? '#0A1128' : '#F4F7FA';
  const cardBg = isDark ? '#131C33' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subTextColor = isDark ? '#94A3B8' : '#64748B';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: darkNavyBg }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header Bar */}
      <View style={[styles.header, { borderBottomColor: cardBorder }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}
          activeOpacity={0.8}
        >
          <ArrowLeft color={textColor} size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
            {draft.tour_title}
          </Text>
          <Text style={[styles.headerSubtitle, { color: subTextColor }]} numberOfLines={1}>
            {siteName}
          </Text>
        </View>
        {allCompleted && (
          <TouchableOpacity
            style={styles.headerFinishBtn}
            onPress={handleProceedToSummary}
            activeOpacity={0.8}
          >
            <Text style={styles.headerFinishText}>Finish</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Tour Progress Card */}
        <View style={[styles.progressCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.progressHeaderRow}>
            <Text style={[styles.progressHeading, { color: textColor }]}>Tour Progress</Text>
            <Text style={[styles.progressRatio, { color: allCompleted ? '#22C55E' : '#3B82F6' }]}>
              {completedCount} of {totalCount} Checkpoints Done
            </Text>
          </View>
          <View style={[styles.progressBarTrack, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${progressPercent}%`,
                  backgroundColor: allCompleted ? '#22C55E' : '#3B82F6',
                },
              ]}
            />
          </View>
        </View>

        {/* Checkpoint Timeline */}
        <View style={styles.timelineContainer}>
          {checkpointsList.map((cp, index) => {
            const isLast = index === checkpointsList.length - 1;
            const cpExec = draft.checkpoints[cp.oid] || {
              checkpoint_oid: cp.oid,
              status: index === 0 ? 'active' : 'locked',
              verification_status: 'unverified',
              responses: {},
            };

            const isCompleted = cpExec.status === 'completed';
            const isActive = cpExec.status === 'active';
            const isLocked = cpExec.status === 'locked';
            const isVerified = cpExec.verification_status === 'server_verified';
            const isExpanded = expandedCpOid === cp.oid;

            // Dot & Border styling
            let dotBg = '#334155';
            let dotBorder = '#475569';
            let cardBorderColor = cardBorder;

            if (isCompleted) {
              dotBg = '#22C55E';
              dotBorder = '#16A34A';
              cardBorderColor = 'rgba(34, 197, 94, 0.4)';
            } else if (isActive) {
              dotBg = '#3B82F6';
              dotBorder = '#60A5FA';
              cardBorderColor = '#3B82F6';
            }

            return (
              <View key={`cp_${cp.oid}`} style={styles.timelineRow}>
                {/* Left Timeline Marker */}
                <View style={styles.timelineLeftCol}>
                  <View style={[styles.markerCircle, { backgroundColor: dotBg, borderColor: dotBorder }]}>
                    {isCompleted ? (
                      <CheckCircle2 color="#FFFFFF" size={16} />
                    ) : isLocked ? (
                      <Lock color="#94A3B8" size={13} />
                    ) : (
                      <Text style={styles.markerOrderText}>{cp.order}</Text>
                    )}
                  </View>
                  {!isLast && (
                    <View
                      style={[
                        styles.timelineLine,
                        {
                          backgroundColor: isCompleted ? '#22C55E' : isDark ? '#1E293B' : '#E2E8F0',
                        },
                      ]}
                    />
                  )}
                </View>

                {/* Right Card */}
                <View
                  style={[
                    styles.checkpointCard,
                    {
                      backgroundColor: cardBg,
                      borderColor: cardBorderColor,
                      borderWidth: isActive ? 1.8 : 1,
                      opacity: isLocked ? 0.6 : 1,
                    },
                  ]}
                >
                  {/* Card Header */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={isLocked}
                    onPress={() => setExpandedCpOid(isExpanded ? null : cp.oid)}
                    style={styles.cpCardHeader}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cpNameText, { color: textColor }]}>
                        {cp.order}. {cp.name}
                      </Text>
                      <Text style={[styles.cpCoordText, { color: subTextColor }]}>
                        <MapPin size={11} color="#94A3B8" />{' '}
                        {cp.latitude && cp.longitude
                          ? `Lat: ${Number(cp.latitude).toFixed(4)}, Lng: ${Number(cp.longitude).toFixed(4)}`
                          : 'GPS Geofenced • 100m range'}
                      </Text>
                    </View>

                    {/* Status Pill */}
                    {isCompleted ? (
                      <View style={styles.statePillCompleted}>
                        <Text style={styles.statePillCompletedText}>COMPLETED</Text>
                      </View>
                    ) : isActive ? (
                      <View style={styles.statePillActive}>
                        <Text style={styles.statePillActiveText}>ACTIVE</Text>
                      </View>
                    ) : (
                      <View style={styles.statePillLocked}>
                        <Text style={styles.statePillLockedText}>LOCKED</Text>
                      </View>
                    )}

                    {!isLocked && (
                      <View style={{ marginLeft: 6 }}>
                        {isExpanded ? (
                          <ChevronUp color={subTextColor} size={18} />
                        ) : (
                          <ChevronDown color={subTextColor} size={18} />
                        )}
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Completed info display */}
                  {isCompleted && (
                    <View style={styles.completedInfoBox}>
                      <View style={styles.verifiedRow}>
                        <ShieldCheck color="#22C55E" size={15} />
                        <Text style={styles.verifiedText}>GPS VERIFIED (WITHIN RANGE)</Text>
                      </View>
                      {cpExec.verified_at && (
                        <Text style={[styles.verifiedTimeText, { color: subTextColor }]}>
                          Completed at {cpExec.verified_at}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Locked status text */}
                  {isLocked && (
                    <View style={styles.lockedInfoBox}>
                      <Lock color="#94A3B8" size={13} />
                      <Text style={[styles.lockedInfoText, { color: subTextColor }]}>
                        Locked until previous checkpoint completed
                      </Text>
                    </View>
                  )}

                  {/* Active Card Body: Verification + Questions */}
                  {isActive && (
                    <View style={styles.activeCardBody}>
                      {/* Step 1: Verification */}
                      {!isVerified ? (
                        <View style={[styles.verificationBox, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                          <Text style={[styles.verifyBoxTitle, { color: textColor }]}>
                            Checkpoint Verification Required
                          </Text>
                          <Text style={[styles.verifyBoxSubtitle, { color: subTextColor }]}>
                            {cp.verification_mode === 'GPS_ONLY'
                              ? 'Acquire GPS coordinates at this location to verify checkpoint.'
                              : cp.verification_mode === 'QR_ONLY'
                              ? 'Scan the checkpoint QR code placed at this location.'
                              : 'Scan the checkpoint QR code and verify GPS proximity.'}
                          </Text>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={verifying}
                            onPress={() => handleOpenVerification(cp)}
                            style={styles.verifyActionBtn}
                          >
                            {verifying ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : cp.verification_mode === 'GPS_ONLY' ? (
                              <>
                                <MapPin color="#FFFFFF" size={16} />
                                <Text style={styles.verifyActionBtnText}>Verify GPS Location</Text>
                              </>
                            ) : (
                              <>
                                <QrCode color="#FFFFFF" size={16} />
                                <Text style={styles.verifyActionBtnText}>Scan Checkpoint QR</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.verifiedSuccessBanner}>
                          <ShieldCheck color="#22C55E" size={16} />
                          <Text style={styles.verifiedSuccessText}>
                            GPS & Checkpoint Verified ({cpExec.verified_at || 'Ready'})
                          </Text>
                        </View>
                      )}

                      {/* Step 2: Nested Questions Checklist (Visible when expanded or verified) */}
                      {isExpanded && isVerified && (
                        <View style={styles.checklistContainer}>
                          <Text style={[styles.checklistHeading, { color: textColor }]}>
                            Inspection Checklist ({cp.questions.length})
                          </Text>

                          {cp.questions.map((q, qIndex) => {
                            const resp = cpExec.responses[q.oid] || {
                              question_oid: q.oid,
                              response_value: '',
                              comment: '',
                              is_critical_violation: false,
                              is_failure: false,
                              photos: [],
                            };

                            const isValFailed = Boolean(
                              resp.response_value &&
                                q.failure_values &&
                                q.failure_values.includes(resp.response_value)
                            );

                            return (
                              <View
                                key={`q_${q.oid}`}
                                style={[
                                  styles.questionCard,
                                  {
                                    backgroundColor: isDark ? '#1A2338' : '#F8FAFC',
                                    borderColor: isValFailed ? '#EF4444' : cardBorder,
                                  },
                                ]}
                              >
                                {/* Question Title and Badges */}
                                <View style={styles.qHeaderRow}>
                                  <Text style={[styles.qText, { color: textColor }]}>
                                    {qIndex + 1}. {q.text}
                                  </Text>
                                </View>

                                <View style={styles.badgeRow}>
                                  {q.is_mandatory && (
                                    <View style={styles.mandBadge}>
                                      <Text style={styles.mandBadgeText}>MANDATORY</Text>
                                    </View>
                                  )}
                                  {q.is_critical && (
                                    <View style={styles.critBadge}>
                                      <Text style={styles.critBadgeText}>CRITICAL</Text>
                                    </View>
                                  )}
                                  {isValFailed && (
                                    <View style={styles.failBadge}>
                                      <AlertTriangle color="#EF4444" size={11} />
                                      <Text style={styles.failBadgeText}>FAILED CHECK</Text>
                                    </View>
                                  )}
                                </View>

                                {/* Response Controls By Type */}
                                <View style={styles.responseControlBox}>
                                  {/* 1. YES / NO */}
                                  {q.response_type === 'YES_NO' && (
                                    <View style={styles.toggleRow}>
                                      {(['Yes', 'No'] as const).map((opt) => {
                                        const isSelected = resp.response_value === opt;
                                        return (
                                          <TouchableOpacity
                                            key={opt}
                                            activeOpacity={0.8}
                                            onPress={() => handleAnswerChange(cp.oid, q, opt)}
                                            style={[
                                              styles.toggleBtn,
                                              {
                                                backgroundColor: isSelected
                                                  ? opt === 'Yes'
                                                    ? '#22C55E'
                                                    : '#EF4444'
                                                  : isDark
                                                  ? '#1E293B'
                                                  : '#E2E8F0',
                                              },
                                            ]}
                                          >
                                            <Text
                                              style={[
                                                styles.toggleBtnText,
                                                { color: isSelected ? '#FFFFFF' : textColor },
                                              ]}
                                            >
                                              {opt}
                                            </Text>
                                          </TouchableOpacity>
                                        );
                                      })}
                                    </View>
                                  )}

                                  {/* 2. SATISFACTORY / UNSATISFACTORY */}
                                  {q.response_type === 'SATISFACTORY_UNSATISFACTORY' && (
                                    <View style={styles.toggleRow}>
                                      {(['Satisfactory', 'Unsatisfactory'] as const).map((opt) => {
                                        const isSelected = resp.response_value === opt;
                                        return (
                                          <TouchableOpacity
                                            key={opt}
                                            activeOpacity={0.8}
                                            onPress={() => handleAnswerChange(cp.oid, q, opt)}
                                            style={[
                                              styles.toggleBtn,
                                              {
                                                backgroundColor: isSelected
                                                  ? opt === 'Satisfactory'
                                                    ? '#22C55E'
                                                    : '#EF4444'
                                                  : isDark
                                                  ? '#1E293B'
                                                  : '#E2E8F0',
                                              },
                                            ]}
                                          >
                                            <Text
                                              style={[
                                                styles.toggleBtnText,
                                                { color: isSelected ? '#FFFFFF' : textColor },
                                              ]}
                                            >
                                              {opt}
                                            </Text>
                                          </TouchableOpacity>
                                        );
                                      })}
                                    </View>
                                  )}

                                  {/* 3. RATING (1-5) */}
                                  {q.response_type === 'RATING' && (
                                    <View style={styles.ratingRow}>
                                      {[1, 2, 3, 4, 5].map((starVal) => {
                                        const isSelected = resp.response_value === String(starVal);
                                        return (
                                          <TouchableOpacity
                                            key={starVal}
                                            activeOpacity={0.8}
                                            onPress={() => handleAnswerChange(cp.oid, q, String(starVal))}
                                            style={[
                                              styles.starBtn,
                                              {
                                                backgroundColor: isSelected
                                                  ? '#F59E0B'
                                                  : isDark
                                                  ? '#1E293B'
                                                  : '#E2E8F0',
                                              },
                                            ]}
                                          >
                                            <Star
                                              size={18}
                                              color={isSelected ? '#FFFFFF' : '#94A3B8'}
                                              fill={isSelected ? '#FFFFFF' : 'none'}
                                            />
                                            <Text
                                              style={[
                                                styles.starBtnText,
                                                { color: isSelected ? '#FFFFFF' : textColor },
                                              ]}
                                            >
                                              {starVal}
                                            </Text>
                                          </TouchableOpacity>
                                        );
                                      })}
                                    </View>
                                  )}

                                  {/* 4. TEXT */}
                                  {q.response_type === 'TEXT' && (
                                    <TextInput
                                      style={[
                                        styles.textInput,
                                        {
                                          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                                          color: textColor,
                                          borderColor: cardBorder,
                                        },
                                      ]}
                                      placeholder="Type your response here..."
                                      placeholderTextColor="#94A3B8"
                                      value={resp.response_value}
                                      onChangeText={(txt) => handleAnswerChange(cp.oid, q, txt)}
                                    />
                                  )}

                                  {/* 5. MULTIPLE CHOICE */}
                                  {q.response_type === 'MULTIPLE_CHOICE' && q.options && (
                                    <View style={styles.optionsWrap}>
                                      {q.options.map((opt) => {
                                        const isSelected = resp.response_value === opt;
                                        return (
                                          <TouchableOpacity
                                            key={opt}
                                            activeOpacity={0.8}
                                            onPress={() => handleAnswerChange(cp.oid, q, opt)}
                                            style={[
                                              styles.choiceChip,
                                              {
                                                backgroundColor: isSelected
                                                  ? '#3B82F6'
                                                  : isDark
                                                  ? '#1E293B'
                                                  : '#E2E8F0',
                                              },
                                            ]}
                                          >
                                            <Text
                                              style={[
                                                styles.choiceChipText,
                                                { color: isSelected ? '#FFFFFF' : textColor },
                                              ]}
                                            >
                                              {opt}
                                            </Text>
                                          </TouchableOpacity>
                                        );
                                      })}
                                    </View>
                                  )}
                                </View>

                                {/* Written Remarks / Comments for Question */}
                                <View style={styles.commentContainer}>
                                  <Text style={[styles.commentLabel, { color: subTextColor }]}>
                                    {resp.is_failure
                                      ? 'Failure Explanation / Corrective Action (Required):'
                                      : 'Inspection Remarks & Observations (Optional):'}
                                  </Text>
                                  <TextInput
                                    style={[
                                      styles.commentInput,
                                      {
                                        backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                                        color: textColor,
                                        borderColor: resp.is_failure ? '#EF4444' : cardBorder,
                                      },
                                    ]}
                                    placeholder={resp.is_failure ? "Add mandatory remark on failure..." : "Add observation remark (optional)..."}
                                    placeholderTextColor="#94A3B8"
                                    multiline
                                    numberOfLines={2}
                                    value={resp.comment || ''}
                                    onChangeText={(txt) => handleCommentChange(cp.oid, q.oid, txt)}
                                  />
                                </View>

                                {/* Photo Evidence Section */}
                                <View style={styles.photoSection}>
                                  <View style={styles.photoHeaderRow}>
                                    <View style={styles.photoLabelGroup}>
                                      <Text style={[styles.photoSectionLabel, { color: textColor }]}>
                                        Attached Photos ({resp.photos?.length || 0}/{q.max_photos})
                                      </Text>
                                      {q.min_photos > 0 && (
                                        <Text
                                          style={[
                                            styles.photoMinBadge,
                                            {
                                              color:
                                                (resp.photos?.length || 0) < q.min_photos
                                                  ? '#EF4444'
                                                  : '#22C55E',
                                            },
                                          ]}
                                        >
                                          {(resp.photos?.length || 0) < q.min_photos
                                            ? `• Min ${q.min_photos} required (Need ${q.min_photos - (resp.photos?.length || 0)} more)`
                                            : '• Requirement Met ✓'}
                                        </Text>
                                      )}
                                    </View>
                                    {(resp.photos?.length || 0) < q.max_photos && (
                                      <TouchableOpacity
                                        activeOpacity={0.8}
                                        onPress={() => handleCapturePhoto(cp.oid, q)}
                                        style={styles.addPhotoBtn}
                                      >
                                        <Camera color="#FFFFFF" size={14} />
                                        <Text style={styles.addPhotoBtnText}>Snap Photo</Text>
                                      </TouchableOpacity>
                                    )}
                                  </View>

                                  {/* Photo Thumbnails */}
                                  {resp.photos && resp.photos.length > 0 && (
                                    <ScrollView
                                      horizontal
                                      showsHorizontalScrollIndicator={false}
                                      style={styles.thumbnailRow}
                                    >
                                      {resp.photos.map((p) => (
                                        <View key={p.id} style={styles.thumbWrapper}>
                                          <Image source={{ uri: p.local_uri }} style={styles.thumbImg} />
                                          <TouchableOpacity
                                            activeOpacity={0.8}
                                            onPress={() => handleRemovePhoto(cp.oid, q.oid, p.id)}
                                            style={styles.thumbRemoveBtn}
                                          >
                                            <X color="#FFFFFF" size={12} />
                                          </TouchableOpacity>
                                        </View>
                                      ))}
                                    </ScrollView>
                                  )}
                                </View>
                              </View>
                            );
                          })}

                          {/* Submit Checkpoint Answers Button */}
                          <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={submitting}
                            onPress={() => handlePressSubmitCheckpoint(cp)}
                            style={styles.submitCpBtn}
                          >
                            {submitting ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <>
                                <Send color="#FFFFFF" size={16} />
                                <Text style={styles.submitCpBtnText}>Submit Checkpoint Answers</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Bottom Finish Tour Button */}
        {allCompleted && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleProceedToSummary}
            style={styles.finishTourBtn}
          >
            <CheckCircle2 color="#FFFFFF" size={20} />
            <Text style={styles.finishTourBtnText}>Review & Finish Tour</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* QR Scanner Modal */}
      <Modal visible={qrModalVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.scannerSafeArea}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity onPress={() => setQrModalVisible(false)} style={styles.scannerCloseBtn}>
              <X color="#FFFFFF" size={24} />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Scan Checkpoint QR</Text>
            <TouchableOpacity onPress={() => setTorchOn(!torchOn)} style={styles.scannerTorchBtn}>
              {torchOn ? <FlashlightOff color="#FFFFFF" size={22} /> : <Flashlight color="#FFFFFF" size={22} />}
            </TouchableOpacity>
          </View>

          <View style={styles.scannerBody}>
            <CameraView
              style={StyleSheet.absoluteFill}
              enableTorch={torchOn}
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'code128', 'ean13'],
              }}
              onBarcodeScanned={({ data }) => handleBarcodeScanned(data)}
            />
            {/* Visual Frame */}
            <View style={styles.scannerFrame} />
            <Text style={styles.scannerHelpText}>
              Align the checkpoint QR code within the frame to verify
            </Text>
          </View>

          <View style={styles.scannerFooter}>
            <TouchableOpacity
              onPress={() => {
                setQrModalVisible(false);
                setManualCodeModal(true);
              }}
              style={styles.manualEntryBtn}
            >
              <Keyboard color="#FFFFFF" size={18} />
              <Text style={styles.manualEntryText}>Enter Code Manually</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Manual Code Input Modal */}
      <Modal visible={manualCodeModal} transparent animationType="fade">
        <View style={styles.manualModalOverlay}>
          <View style={[styles.manualModalCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.manualModalTitle, { color: textColor }]}>Enter Checkpoint Code</Text>
            <TextInput
              style={[
                styles.manualInput,
                { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', color: textColor },
              ]}
              placeholder="e.g. CP-101 or ENTRY-GATE-01"
              placeholderTextColor="#94A3B8"
              value={manualCodeInput}
              onChangeText={setManualCodeInput}
            />
            <View style={styles.manualModalActions}>
              <TouchableOpacity
                onPress={() => setManualCodeModal(false)}
                style={[styles.manualCancelBtn, { borderColor: cardBorder }]}
              >
                <Text style={{ color: subTextColor, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setManualCodeModal(false);
                  handleBarcodeScanned(manualCodeInput);
                  setManualCodeInput('');
                }}
                style={styles.manualSubmitBtn}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Verify</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerFinishBtn: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerFinishText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  progressCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressHeading: {
    fontSize: 15,
    fontWeight: '700',
  },
  progressRatio: {
    fontSize: 13,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  timelineContainer: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timelineLeftCol: {
    width: 36,
    alignItems: 'center',
  },
  markerCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    zIndex: 2,
  },
  markerOrderText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 40,
    marginVertical: 4,
  },
  checkpointCard: {
    flex: 1,
    marginLeft: 10,
    marginBottom: 14,
    borderRadius: 14,
    padding: 14,
  },
  cpCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cpNameText: {
    fontSize: 15,
    fontWeight: '700',
  },
  cpCoordText: {
    fontSize: 11,
    marginTop: 3,
  },
  statePillCompleted: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statePillCompletedText: {
    color: '#22C55E',
    fontSize: 10,
    fontWeight: '800',
  },
  statePillActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statePillActiveText: {
    color: '#3B82F6',
    fontSize: 10,
    fontWeight: '800',
  },
  statePillLocked: {
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statePillLockedText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
  },
  completedInfoBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verifiedText: {
    color: '#22C55E',
    fontSize: 12,
    fontWeight: '700',
  },
  verifiedTimeText: {
    fontSize: 11,
    marginTop: 2,
    marginLeft: 21,
  },
  lockedInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  lockedInfoText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  activeCardBody: {
    marginTop: 12,
  },
  verificationBox: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    gap: 6,
  },
  verifyBoxTitle: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  verifyBoxSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  verifyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
    width: '100%',
  },
  verifyActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  verifiedSuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  verifiedSuccessText: {
    color: '#22C55E',
    fontSize: 12,
    fontWeight: '700',
  },
  checklistContainer: {
    marginTop: 8,
    gap: 12,
  },
  checklistHeading: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  questionCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  qHeaderRow: {
    flexDirection: 'row',
  },
  qText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  mandBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mandBadgeText: {
    color: '#EF4444',
    fontSize: 9,
    fontWeight: '800',
  },
  critBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  critBadgeText: {
    color: '#F59E0B',
    fontSize: 9,
    fontWeight: '800',
  },
  failBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  failBadgeText: {
    color: '#EF4444',
    fontSize: 9,
    fontWeight: '800',
  },
  responseControlBox: {
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  starBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  starBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  choiceChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  commentContainer: {
    marginTop: 4,
    gap: 4,
  },
  commentLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    fontSize: 12,
  },
  photoSection: {
    marginTop: 4,
    gap: 6,
  },
  photoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  photoLabelGroup: {
    flex: 1,
    minWidth: 160,
    paddingRight: 6,
  },
  photoSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  photoMinBadge: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
    flexShrink: 0,
  },
  addPhotoBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  thumbnailRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  thumbWrapper: {
    position: 'relative',
    marginRight: 8,
  },
  thumbImg: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  thumbRemoveBtn: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#EF4444',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitCpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 6,
    gap: 8,
  },
  submitCpBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  finishTourBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 10,
  },
  finishTourBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  scannerSafeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  scannerCloseBtn: {
    padding: 6,
  },
  scannerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  scannerTorchBtn: {
    padding: 6,
  },
  scannerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderRadius: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
  },
  scannerHelpText: {
    color: '#FFFFFF',
    fontSize: 13,
    marginTop: 20,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  scannerFooter: {
    padding: 20,
    alignItems: 'center',
  },
  manualEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  manualEntryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  manualModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  manualModalCard: {
    width: '100%',
    padding: 20,
    borderRadius: 14,
    gap: 14,
  },
  manualModalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  manualInput: {
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  manualModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  manualCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualSubmitBtn: {
    flex: 1,
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
