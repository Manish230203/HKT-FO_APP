import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  TextInput,
  Modal,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  QrCode,
  Shield,
  Flashlight,
  FlashlightOff,
  Keyboard,
  X,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  RefreshCw,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { verifyCheckpointQr } from '../../services/patrolService';

export default function PatrolScanScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isDark, colors } = useTheme();
  const params = useLocalSearchParams<{
    checkpointId: string;
    checkpointName: string;
    tourName: string;
    siteId?: string;
    expectedQr?: string;
    latitude?: string;
    longitude?: string;
    radius?: string;
  }>();

  const checkpointId = parseInt(params.checkpointId || '0', 10);
  const checkpointName = params.checkpointName ? decodeURIComponent(params.checkpointName) : 'Checkpoint';
  const tourName = params.tourName ? decodeURIComponent(params.tourName) : 'Tour';
  const siteId = params.siteId ? parseInt(params.siteId, 10) : 1;
  const expectedQr = params.expectedQr || '';
  const empOid = user?.id || 113;

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<boolean>(false);
  const [validating, setValidating] = useState<boolean>(false);
  const [torch, setTorch] = useState<boolean>(false);
  const [manualModalVisible, setManualModalVisible] = useState<boolean>(false);
  const [manualCode, setManualCode] = useState<string>('');

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Permission', 'GPS location is required for checkpoint verification.');
      }
    })();
  }, []);

  const handleVerifyPayload = async (qrPayload: string) => {
    if (scanned || validating) return;
    setScanned(true);
    setValidating(true);

    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // 1. Get current GPS coordinates
      let currentLat = 0;
      let currentLng = 0;
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        currentLat = loc.coords.latitude;
        currentLng = loc.coords.longitude;
      } catch (locErr) {
        console.warn('Could not acquire high accuracy GPS:', locErr);
      }

      // 2. Submit verification to backend
      const res = await verifyCheckpointQr({
        qrCode: qrPayload.trim(),
        checkpointId,
        tourName,
        latitude: currentLat,
        longitude: currentLng,
        siteId,
        empOid,
      });

      if (res && res.verified) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        // Verification success dialog
        Alert.alert(
          'Verification Success ✓',
          `Checkpoint '${checkpointName}' scanned & verified successfully!`,
          [
            {
              text: 'Open Checklist',
              onPress: () => {
                router.replace({
                  pathname: '/patrol/checklist',
                  params: {
                    checkpointId: String(checkpointId),
                    checkpointName: checkpointName,
                    tourName: tourName,
                    siteId: String(siteId),
                    checklistId: res.checklist_id ? String(res.checklist_id) : '',
                    latitude: String(currentLat),
                    longitude: String(currentLng),
                  },
                });
              },
            },
          ]
        );
      } else {
        throw new Error(res?.message || 'Verification failed');
      }
    } catch (e: any) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      const msg = e?.response?.data?.detail || e?.message || 'Invalid QR code. Please scan the designated checkpoint code.';
      Alert.alert('Scan Failed', msg, [
        {
          text: 'Try Again',
          onPress: () => {
            setScanned(false);
            setValidating(false);
          },
        },
      ]);
    } finally {
      setValidating(false);
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    handleVerifyPayload(data);
  };

  const handleManualSubmit = () => {
    if (!manualCode.trim()) {
      Alert.alert('Input Required', 'Please enter a QR code or checkpoint ID.');
      return;
    }
    setManualModalVisible(false);
    handleVerifyPayload(manualCode.trim());
  };

  if (!permission) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <AlertTriangle color="#F59E0B" size={48} />
        <Text style={[styles.permTitle, { color: colors.text }]}>Camera Access Required</Text>
        <Text style={[styles.permSubtitle, { color: colors.textSecondary }]}>
          We need camera access to scan physical checkpoint QR codes along the tour.
        </Text>
        <TouchableOpacity style={styles.permButton} activeOpacity={0.8} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Grant Camera Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 16 }} onPress={() => router.back()}>
          <Text style={{ color: colors.textSecondary }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera View */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"

        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'code128', 'code39'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Top Header Overlay */}
      <SafeAreaView style={styles.topOverlay} edges={['top']}>
        <View style={styles.topNavRow}>
          <TouchableOpacity
            style={styles.iconCircleButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft color="#FFFFFF" size={20} />
          </TouchableOpacity>

          <View style={styles.topInfoTextContainer}>
            <Text style={styles.checkpointNameTitle} numberOfLines={1}>
              {checkpointName}
            </Text>
            <Text style={styles.tourNameSubtitle} numberOfLines={1}>
              {tourName}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.iconCircleButton}
            onPress={() => setTorch(!torch)}
            activeOpacity={0.7}
          >
            {torch ? <FlashlightOff color="#FBBF24" size={20} /> : <Flashlight color="#FFFFFF" size={20} />}
          </TouchableOpacity>
        </View>

        {/* Expected Tag Banner */}
        <View style={styles.tagBanner}>
          <Shield color="#60A5FA" size={14} />
          <Text style={styles.tagBannerText} numberOfLines={1}>
            Align camera with checkpoint QR code
          </Text>
        </View>
      </SafeAreaView>

      {/* Scanning Target Reticle */}
      <View style={styles.reticleContainer}>
        <View style={styles.reticleBox}>
          {/* Corner Borders */}
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />

          {validating && (
            <View style={styles.validatingOverlay}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.validatingText}>Verifying Checkpoint & GPS...</Text>
            </View>
          )}
        </View>
      </View>

      {/* Bottom Controls */}
      <SafeAreaView style={styles.bottomOverlay} edges={['bottom']}>
        <View style={styles.bottomButtonsRow}>
          {/* Manual Input Button */}
          <TouchableOpacity
            style={styles.manualEntryButton}
            activeOpacity={0.8}
            onPress={() => {
              setManualCode(expectedQr || '');
              setManualModalVisible(true);
            }}
          >
            <Keyboard color="#FFFFFF" size={18} />
            <Text style={styles.manualEntryText}>Manual Code Entry</Text>
          </TouchableOpacity>

          {/* Quick Test Fill (If configured) */}
          {expectedQr ? (
            <TouchableOpacity
              style={styles.quickTestButton}
              activeOpacity={0.8}
              onPress={() => handleVerifyPayload(expectedQr)}
            >
              <CheckCircle2 color="#34D399" size={16} />
              <Text style={styles.quickTestText}>Verify ({expectedQr})</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </SafeAreaView>

      {/* Manual Input Modal */}
      <Modal
        visible={manualModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setManualModalVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalTop}>
              <Text style={[styles.modalCardTitle, { color: colors.text }]}>Manual Checkpoint Code</Text>
              <TouchableOpacity onPress={() => setManualModalVisible(false)}>
                <X color={colors.textSecondary} size={20} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalCardDesc, { color: colors.textSecondary }]}>
              If the physical QR code is damaged, enter the printed code identifier:
            </Text>

            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="e.g. CP-192-1791964335632"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setManualModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleManualSubmit}
              >
                <Text style={styles.modalSubmitText}>Verify & Proceed</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0A1128',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
    textAlign: 'center',
  },
  permSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    marginBottom: 20,
  },
  permButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10, 17, 40, 0.75)',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  iconCircleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topInfoTextContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 10,
  },
  checkpointNameTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tourNameSubtitle: {
    fontSize: 12,
    color: '#93C5FD',
    marginTop: 1,
  },
  tagBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 58, 138, 0.6)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    alignSelf: 'center',
    marginTop: 6,
    gap: 6,
  },
  tagBannerText: {
    color: '#E0E7FF',
    fontSize: 12,
    fontWeight: '600',
  },
  reticleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleBox: {
    width: 260,
    height: 260,
    borderRadius: 20,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: '#3B82F6',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  validatingOverlay: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    padding: 20,
    borderRadius: 14,
    alignItems: 'center',
    gap: 10,
  },
  validatingText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10, 17, 40, 0.85)',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
  },
  bottomButtonsRow: {
    gap: 10,
  },
  manualEntryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    height: 44,
    borderRadius: 10,
    gap: 8,
  },
  manualEntryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  quickTestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    height: 40,
    borderRadius: 10,
    gap: 6,
  },
  quickTestText: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#131C33',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalCardDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalCancelText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
