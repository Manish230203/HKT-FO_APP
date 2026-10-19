import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  QrCode,
  Shield,
  Building2,
  AlertTriangle,
  RefreshCw,
  Camera,
  CheckCircle2,
  ChevronDown,
  X,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { validateSiteQr } from '../../services/visitService';
import { getSites, Site } from '../../services/siteService';
import { useTheme } from '../../context/ThemeContext';
import { StatusBar } from 'react-native';

export default function ScanChecklistScreen() {
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const router = useRouter();
  const params = useLocalSearchParams<{
    siteId?: string;
    siteName?: string;
    clientId?: string;
    clientName?: string;
    plannedId?: string;
    customVisitId?: string;
    customSiteName?: string;
    customClientName?: string;
    isCustom?: string;
  }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [validating, setValidating] = useState(false);
  const initialSiteName = params.siteName ? decodeURIComponent(params.siteName) : (params.customSiteName ? decodeURIComponent(params.customSiteName) : '');
  const initialClientName = params.clientName ? decodeURIComponent(params.clientName) : (params.customClientName ? decodeURIComponent(params.customClientName) : '');
  const [selectedSiteId, setSelectedSiteId] = useState<string>(params.siteId || '');
  const [selectedSiteName, setSelectedSiteName] = useState<string>(initialSiteName);
  const [selectedClientId, setSelectedClientId] = useState<string>(params.clientId || '');
  const [selectedClientName, setSelectedClientName] = useState<string>(initialClientName);

  // Site picker modal for when no site was pre-selected from visit list
  const [sites, setSites] = useState<Site[]>([]);
  const [sitePickerVisible, setSitePickerVisible] = useState(false);
  const [siteSearch, setSiteSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const fetched = await getSites();
        setSites(fetched || []);
        if (params.siteId && !selectedSiteName) {
          const match = fetched.find((s) => String(s.id) === String(params.siteId));
          if (match) {
            setSelectedSiteName(match.name);
            setSelectedClientId(String(match.client_id || ''));
            setSelectedClientName(match.client_name || '');
          }
        }
      } catch (e) {
        console.error('Error fetching sites:', e);
      }
    })();
  }, [params.siteId]);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || validating) return;
    setScanned(true);
    setValidating(true);

    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      const targetSiteId = selectedSiteId || '1';
      const res = await validateSiteQr(targetSiteId, data.trim());

      if (res && res.valid) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        const resolvedSiteName = res.site_name || selectedSiteName || 'Site';
        const qp = `siteId=${encodeURIComponent(targetSiteId)}&siteName=${encodeURIComponent(resolvedSiteName)}&clientId=${encodeURIComponent(selectedClientId || '')}&clientName=${encodeURIComponent(selectedClientName || '')}&plannedId=${encodeURIComponent(params.plannedId || '')}&customVisitId=${encodeURIComponent(params.customVisitId || '')}&isCustom=${encodeURIComponent(params.isCustom || '0')}`;

        Alert.alert(
          'QR Verified ✓',
          `Successfully scanned QR for ${resolvedSiteName}.\nOpening assigned checklist...`,
          [
            {
              text: 'Open Checklist',
              onPress: () => {
                router.replace(`/visits/checklist-form?${qp}`);
              },
            },
          ]
        );
      } else {
        const msg = res?.message || 'Invalid QR code. Please scan the QR code for this site.';
        Alert.alert('Scan Failed', msg, [
          {
            text: 'Try Again',
            onPress: () => {
              setScanned(false);
              setValidating(false);
            },
          },
        ]);
      }
    } catch (e: any) {
      console.error('Validation error:', e);
      // Fallback: If network is offline, check if data matches site name or ID
      if (
        data.includes(selectedSiteId) ||
        (selectedSiteName && data.toLowerCase().includes(selectedSiteName.toLowerCase())) ||
        data.startsWith('SITE:')
      ) {
        const qp = `siteId=${encodeURIComponent(selectedSiteId || '1')}&siteName=${encodeURIComponent(selectedSiteName || 'Site')}&clientId=${encodeURIComponent(selectedClientId || '')}&clientName=${encodeURIComponent(selectedClientName || '')}&plannedId=${encodeURIComponent(params.plannedId || '')}&customVisitId=${encodeURIComponent(params.customVisitId || '')}&isCustom=${encodeURIComponent(params.isCustom || '0')}`;
        router.replace(`/visits/checklist-form?${qp}`);
      } else {
        Alert.alert('Validation Error', 'Could not verify QR code. Please ensure you are scanning the site QR code.', [
          {
            text: 'Scan Again',
            onPress: () => {
              setScanned(false);
              setValidating(false);
            },
          },
        ]);
      }
    } finally {
      setValidating(false);
    }
  };

  const handleBypassForTesting = () => {
    if (!selectedSiteId) {
      Alert.alert('Select Site', 'Please select a site first.');
      return;
    }
    const qp = `siteId=${encodeURIComponent(selectedSiteId)}&siteName=${encodeURIComponent(selectedSiteName || 'Site')}&clientId=${encodeURIComponent(selectedClientId || '')}&clientName=${encodeURIComponent(selectedClientName || '')}&plannedId=${encodeURIComponent(params.plannedId || '')}&customVisitId=${encodeURIComponent(params.customVisitId || '')}&isCustom=${encodeURIComponent(params.isCustom || '0')}`;
    router.replace(`/visits/checklist-form?${qp}`);
  };

  const filteredSites = sites.filter(
    (s) =>
      s.name.toLowerCase().includes(siteSearch.toLowerCase()) ||
      (s.client_name && s.client_name.toLowerCase().includes(siteSearch.toLowerCase()))
  );

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <ArrowLeft color={colors.text} size={22} />
        </TouchableOpacity>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>Scan Site QR Code</Text>
          <Text style={styles.headerSubtitle}>
            Scan QR sticker at site to open its assigned checklist
          </Text>
        </View>
      </View>

      {/* Target Site Card */}
      <View style={styles.targetSiteCard}>
        <View style={styles.targetIconBox}>
          <Shield color="#3B82F6" size={22} />
        </View>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.targetLabel}>TARGET SITE</Text>
          <TouchableOpacity
            style={styles.siteSelectRow}
            onPress={() => setSitePickerVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.targetSiteName} numberOfLines={1}>
              {selectedSiteName || 'Tap to choose site...'}
            </Text>
            <ChevronDown color="#94A3B8" size={18} />
          </TouchableOpacity>
          {selectedClientName ? (
            <Text style={styles.targetClientName} numberOfLines={1}>
              Client: {selectedClientName}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Camera Viewfinder */}
      <View style={styles.cameraWrapper}>
        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <AlertTriangle color="#F59E0B" size={44} style={{ marginBottom: 12 }} />
            <Text style={styles.permissionTitle}>Camera Permission Required</Text>
            <Text style={styles.permissionDesc}>
              Please grant camera access to scan the site QR code.
            </Text>
            <TouchableOpacity
              style={styles.permissionBtn}
              onPress={requestPermission}
              activeOpacity={0.85}
            >
              <Text style={styles.permissionBtnText}>GRANT PERMISSION</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            />

            {/* Viewfinder Reticle Overlay */}
            <View style={styles.overlay}>
              <View style={styles.reticleFrame}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />

                {validating && (
                  <View style={styles.validatingOverlay}>
                    <ActivityIndicator size="large" color="#3B82F6" />
                    <Text style={styles.validatingText}>Verifying Site QR...</Text>
                  </View>
                )}
              </View>
              <Text style={styles.hintText}>Align QR code within frame</Text>
            </View>
          </View>
        )}
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomBar}>
        {scanned && !validating ? (
          <TouchableOpacity
            style={styles.rescanBtn}
            onPress={() => setScanned(false)}
            activeOpacity={0.85}
          >
            <RefreshCw color="#FFFFFF" size={18} style={{ marginRight: 8 }} />
            <Text style={styles.rescanBtnText}>Scan Again</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.bypassBtn}
          onPress={handleBypassForTesting}
          activeOpacity={0.8}
        >
          <Text style={styles.bypassBtnText}>
            Manual Check-In / Bypass QR (Testing / Damaged QR)
          </Text>
        </TouchableOpacity>
      </View>

      {/* SITE PICKER MODAL */}
      <Modal
        visible={sitePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSitePickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Target Site</Text>
              <TouchableOpacity onPress={() => setSitePickerVisible(false)}>
                <X color="#94A3B8" size={24} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="Search site or client..."
              placeholderTextColor="#64748B"
              value={siteSearch}
              onChangeText={setSiteSearch}
            />

            <FlatList
              data={filteredSites}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.siteItem}
                  onPress={() => {
                    setSelectedSiteId(String(item.id));
                    setSelectedSiteName(item.name);
                    setSelectedClientId(String(item.client_id || ''));
                    setSelectedClientName(item.client_name || '');
                    setSitePickerVisible(false);
                  }}
                >
                  <Building2 color="#3B82F6" size={20} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.siteItemName}>{item.name}</Text>
                    {item.client_name ? (
                      <Text style={styles.siteItemClient}>{item.client_name}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  targetSiteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  targetIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  targetLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.8,
  },
  siteSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  targetSiteName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  targetClientName: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cameraWrapper: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#000000',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleFrame: {
    width: 250,
    height: 250,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#3B82F6',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  validatingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 17, 40, 0.85)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  validatingText: {
    marginTop: 12,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  hintText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  permissionBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  permissionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 16 : 24,
    alignItems: 'center',
    gap: 8,
  },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    paddingVertical: 14,
    width: '100%',
  },
  rescanBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  bypassBtn: {
    paddingVertical: 10,
  },
  bypassBtnText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.modalOverlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  searchInput: {
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    marginBottom: 14,
  },
  siteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  siteItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  siteItemClient: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
