import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  ArrowLeft,
  QrCode,
  ShieldCheck,
  MapPin,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Users,
  ChevronRight,
  Send,
  X,
  Search,
  Sparkles,
  Trophy,
} from 'lucide-react-native';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  getTourCheckpoints,
  getSiteGuards,
  passPatrolBaton,
  CheckpointItem,
  SiteGuard,
} from '../../services/patrolService';

export default function PatrolTourProgressScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{
    tourName: string;
    siteId?: string;
    siteName?: string;
  }>();

  const tourName = params.tourName ? decodeURIComponent(params.tourName) : 'Checklist Tour';
  const siteId = params.siteId ? parseInt(params.siteId, 10) : 1;
  const siteName = params.siteName ? decodeURIComponent(params.siteName) : 'Site';
  const empOid = user?.id || 113;

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [checkpoints, setCheckpoints] = useState<CheckpointItem[]>([]);
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [allCompleted, setAllCompleted] = useState<boolean>(false);

  // Handover / Pass Baton state
  const [handoverModalVisible, setHandoverModalVisible] = useState<boolean>(false);
  const [targetCheckpoint, setTargetCheckpoint] = useState<CheckpointItem | null>(null);
  const [guards, setGuards] = useState<SiteGuard[]>([]);
  const [selectedGuard, setSelectedGuard] = useState<SiteGuard | null>(null);
  const [handoverReason, setHandoverReason] = useState<string>('');
  const [guardSearch, setGuardSearch] = useState<string>('');
  const [submittingHandover, setSubmittingHandover] = useState<boolean>(false);

  const loadCheckpoints = useCallback(async () => {
    try {
      const res = await getTourCheckpoints(tourName, empOid, siteId);
      if (res && res.success) {
        setCheckpoints(res.checkpoints || []);
        setCompletedCount(res.completed_checkpoints || 0);
        setTotalCount(res.total_checkpoints || 0);
        setAllCompleted(res.all_completed || false);
      }
    } catch (e: any) {
      console.error('Error loading tour checkpoints:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tourName, empOid, siteId]);

  useFocusEffect(
    useCallback(() => {
      loadCheckpoints();
    }, [loadCheckpoints])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadCheckpoints();
  };

  const handleOpenScan = (cp: CheckpointItem) => {
    router.push({
      pathname: '/patrol/scan',
      params: {
        checkpointId: String(cp.checkpoint_id),
        checkpointName: cp.name,
        tourName: tourName,
        siteId: String(siteId),
        expectedQr: cp.qr_code || '',
        latitude: cp.latitude != null ? String(cp.latitude) : '',
        longitude: cp.longitude != null ? String(cp.longitude) : '',
        radius: cp.radius != null ? String(cp.radius) : '100',
      },
    });
  };

  const handleOpenHandover = async (cp: CheckpointItem) => {
    setTargetCheckpoint(cp);
    setSelectedGuard(null);
    setHandoverReason('');
    setGuardSearch('');
    setHandoverModalVisible(true);
    try {
      const gList = await getSiteGuards(siteId, empOid);
      setGuards(gList || []);
    } catch (e) {
      console.error('Error fetching site guards:', e);
    }
  };

  const handleSubmitHandover = async () => {
    if (!targetCheckpoint) return;
    if (!selectedGuard) {
      Alert.alert('Guard Required', 'Please select a guard to pass the baton to.');
      return;
    }
    if (!handoverReason.trim()) {
      Alert.alert('Reason Required', 'Please provide a reason for the handover.');
      return;
    }

    try {
      setSubmittingHandover(true);
      let lat = 0;
      let lng = 0;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      } catch (err) {
        // Fallback
      }

      const res = await passPatrolBaton(targetCheckpoint.checkpoint_id, {
        empOid,
        tourName,
        forwardedTo: selectedGuard.id,
        reason: handoverReason.trim(),
        latitude: lat,
        longitude: lng,
        siteId,
      });

      if (res && res.success) {
        setHandoverModalVisible(false);
        Alert.alert(
          'Baton Handover Complete',
          `Tour baton for '${targetCheckpoint.name}' has been passed to ${selectedGuard.name}.`,
          [
            {
              text: 'OK',
              onPress: () => router.replace('/patrol'),
            },
          ]
        );
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Failed to pass baton.';
      Alert.alert('Handover Error', msg);
    } finally {
      setSubmittingHandover(false);
    }
  };

  const darkNavyBg = isDark ? '#0A1128' : '#F4F7FA';
  const cardBg = isDark ? '#131C33' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subTextColor = isDark ? '#94A3B8' : '#64748B';

  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const filteredGuards = guards.filter(
    (g) =>
      g.name.toLowerCase().includes(guardSearch.toLowerCase()) ||
      g.emp_code.toLowerCase().includes(guardSearch.toLowerCase()) ||
      g.role.toLowerCase().includes(guardSearch.toLowerCase())
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkNavyBg }]} edges={['top']}>
      {/* Top Navigation */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
        >
          <ArrowLeft color={isDark ? '#FFFFFF' : '#0F172A'} size={22} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
            {tourName}
          </Text>
          <Text style={[styles.headerSubtitle, { color: subTextColor }]} numberOfLines={1}>
            {siteName}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Tour Progress Card */}
        <View style={[styles.progressCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.progressHeaderRow}>
            <Text style={[styles.progressHeading, { color: textColor }]}>Tour Progress</Text>
            <Text style={[styles.progressRatio, { color: allCompleted ? '#22C55E' : '#3B82F6' }]}>
              {completedCount} of {totalCount} Checkpoints Done
            </Text>
          </View>

          {/* Progress Bar */}
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

          {allCompleted && (
            <View style={styles.completionBanner}>
              <Trophy color="#FBBF24" size={20} />
              <Text style={styles.completionBannerText}>Tour Completed! All checkpoints verified.</Text>
            </View>
          )}
        </View>

        {/* Section Heading */}
        <View style={styles.checkpointsHeader}>
          <Text style={[styles.checkpointsHeadingText, { color: textColor }]}>Sequential Checkpoints</Text>
          <Text style={[styles.checkpointsSubtitleText, { color: subTextColor }]}>
            Verify each checkpoint in sequence to unlock the next
          </Text>
        </View>

        {/* Checkpoint Timeline */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={[styles.loadingText, { color: subTextColor }]}>Loading checkpoint sequence...</Text>
          </View>
        ) : checkpoints.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <AlertTriangle color="#F59E0B" size={36} />
            <Text style={[styles.emptyBoxTitle, { color: textColor }]}>No Checkpoints Found</Text>
            <Text style={[styles.emptyBoxSubtitle, { color: subTextColor }]}>
              There are no checkpoints assigned to '{tourName}'.
            </Text>
          </View>
        ) : (
          <View style={styles.timelineContainer}>
            {checkpoints.map((cp, index) => {
              const isLast = index === checkpoints.length - 1;
              const isCompleted = cp.is_completed;
              const isActive = cp.is_active;
              const isLocked = cp.is_locked;

              // Timeline dot colors
              let dotBg = '#334155';
              let dotBorder = '#475569';
              if (isCompleted) {
                dotBg = '#22C55E';
                dotBorder = '#16A34A';
              } else if (isActive) {
                dotBg = '#3B82F6';
                dotBorder = '#60A5FA';
              }

              // Card styling
              let cardBorderColor = cardBorder;
              if (isCompleted) cardBorderColor = 'rgba(34, 197, 94, 0.4)';
              else if (isActive) cardBorderColor = '#3B82F6';

              return (
                <View key={`checkpoint_${cp.checkpoint_id}_${index}`} style={styles.timelineRow}>
                  {/* Left Column: Marker & Vertical Line */}
                  <View style={styles.timelineLeftCol}>
                    <View style={[styles.markerCircle, { backgroundColor: dotBg, borderColor: dotBorder }]}>
                      {isCompleted ? (
                        <CheckCircle2 color="#FFFFFF" size={16} />
                      ) : isLocked ? (
                        <Lock color="#94A3B8" size={14} />
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

                  {/* Right Column: Checkpoint Card */}
                  <View
                    style={[
                      styles.checkpointCard,
                      {
                        backgroundColor: cardBg,
                        borderColor: cardBorderColor,
                        borderWidth: isActive ? 1.8 : 1,
                        opacity: isLocked ? 0.65 : 1,
                      },
                    ]}
                  >
                    {/* Header Row */}
                    <View style={styles.cpCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cpNameText, { color: textColor }]}>
                          {cp.order}. {cp.name}
                        </Text>
                        {/* Configured GPS info */}
                        <Text style={[styles.cpGpsCoordText, { color: subTextColor }]}>
                          <MapPin size={12} color="#94A3B8" />{' '}
                          {cp.latitude != null && cp.longitude != null
                            ? `Lat: ${Number(cp.latitude).toFixed(4)}, Lng: ${Number(cp.longitude).toFixed(4)}`
                            : 'GPS Geofenced • 100m range'}
                        </Text>
                      </View>

                      {/* State Pill */}
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
                    </View>

                    {/* Completed State Display */}
                    {isCompleted && (
                      <View style={styles.completedInfoBox}>
                        <View style={styles.verifiedRow}>
                          <ShieldCheck color="#22C55E" size={16} />
                          <Text style={styles.verifiedText}>GPS VERIFIED (WITHIN RANGE)</Text>
                        </View>
                        {cp.completion_time ? (
                          <Text style={[styles.completionTimeText, { color: subTextColor }]}>
                            Verified at {cp.completion_time}
                          </Text>
                        ) : null}
                      </View>
                    )}

                    {/* Active State Actions */}
                    {isActive && (
                      <View style={styles.activeActionsContainer}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => handleOpenScan(cp)}
                          style={styles.scanButton}
                        >
                          <QrCode color="#FFFFFF" size={18} />
                          <Text style={styles.scanButtonText}>Scan Checkpoint</Text>
                        </TouchableOpacity>

                        {/* Baton Handover button */}
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => handleOpenHandover(cp)}
                          style={[styles.passBatonButton, { borderColor: cardBorder }]}
                        >
                          <Users color="#3B82F6" size={16} />
                          <Text style={styles.passBatonButtonText}>Pass Baton / Handover</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Locked State Display */}
                    {isLocked && (
                      <View style={styles.lockedInfoBox}>
                        <Lock color="#94A3B8" size={14} />
                        <Text style={[styles.lockedInfoText, { color: subTextColor }]}>
                          Locked until previous checkpoint completed
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Pass Baton / Guard Handover Modal */}
      <Modal
        visible={handoverModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setHandoverModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: textColor }]}>Pass Tour Baton</Text>
                <Text style={[styles.modalSubtitle, { color: subTextColor }]}>
                  {targetCheckpoint?.name} • {tourName}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setHandoverModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <X color={subTextColor} size={20} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {/* Pass Baton Label */}
              <Text style={[styles.inputLabel, { color: textColor }]}>
                Pass baton to another guard:
              </Text>

              {/* Guard Search Input */}
              <View style={[styles.searchBox, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                <Search color="#94A3B8" size={16} />
                <TextInput
                  style={[styles.searchInput, { color: textColor }]}
                  placeholder="Search by guard name or code..."
                  placeholderTextColor="#94A3B8"
                  value={guardSearch}
                  onChangeText={setGuardSearch}
                />
              </View>

              {/* Guard Selection List */}
              <View style={styles.guardList}>
                {filteredGuards.map((g) => {
                  const isSelected = selectedGuard?.id === g.id;
                  return (
                    <TouchableOpacity
                      key={`guard_${g.id}`}
                      activeOpacity={0.75}
                      onPress={() => setSelectedGuard(g)}
                      style={[
                        styles.guardItem,
                        {
                          backgroundColor: isSelected
                            ? isDark
                              ? 'rgba(59, 130, 246, 0.2)'
                              : '#EFF6FF'
                            : isDark
                            ? '#1A2338'
                            : '#F8FAFC',
                          borderColor: isSelected ? '#3B82F6' : cardBorder,
                        },
                      ]}
                    >
                      <View style={styles.guardItemInfo}>
                        <Text style={[styles.guardName, { color: textColor }]}>{g.name}</Text>
                        <Text style={[styles.guardMeta, { color: subTextColor }]}>
                          {g.role}
                        </Text>
                      </View>
                      {isSelected ? (
                        <CheckCircle2 color="#3B82F6" size={20} />
                      ) : (
                        <View style={styles.unselectedRadio} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Reason for Handover Input */}
              <Text style={[styles.inputLabel, { color: textColor, marginTop: 14 }]}>
                Reason for Handover:
              </Text>
              <TextInput
                style={[
                  styles.reasonInput,
                  {
                    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                    color: textColor,
                    borderColor: cardBorder,
                  },
                ]}
                placeholder="E.g., Shift rotation, emergency response, scheduled relief..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                value={handoverReason}
                onChangeText={setHandoverReason}
              />
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setHandoverModalVisible(false)}
                style={[styles.continueMyselfButton, { borderColor: cardBorder }]}
              >
                <Text style={[styles.continueMyselfText, { color: subTextColor }]}>
                  CONTINUE TOUR MYSELF
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={submittingHandover}
                onPress={handleSubmitHandover}
                style={styles.confirmHandoverButton}
              >
                {submittingHandover ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Send color="#FFFFFF" size={16} />
                    <Text style={styles.confirmHandoverText}>PASS BATON / HANDOVER</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  headerBar: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  scrollContent: {
    padding: 16,
  },
  progressCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressHeading: {
    fontSize: 15,
    fontWeight: '700',
  },
  progressRatio: {
    fontSize: 13,
    fontWeight: '600',
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
  completionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  completionBannerText: {
    color: '#FBBF24',
    fontSize: 13,
    fontWeight: '700',
  },
  checkpointsHeader: {
    marginBottom: 14,
  },
  checkpointsHeadingText: {
    fontSize: 17,
    fontWeight: '700',
  },
  checkpointsSubtitleText: {
    fontSize: 12,
    marginTop: 2,
  },
  timelineContainer: {
    marginTop: 6,
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  timelineLeftCol: {
    alignItems: 'center',
    width: 36,
    marginRight: 10,
  },
  markerCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  markerOrderText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: -2,
    marginBottom: -2,
  },
  checkpointCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
  },
  cpCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cpNameText: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  cpGpsCoordText: {
    fontSize: 11,
    fontWeight: '500',
  },
  statePillCompleted: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  statePillCompletedText: {
    color: '#22C55E',
    fontSize: 10,
    fontWeight: '700',
  },
  statePillActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  statePillActiveText: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '700',
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
    fontWeight: '700',
  },
  completedInfoBox: {
    marginTop: 10,
    paddingTop: 10,
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
    fontSize: 11,
    fontWeight: '700',
  },
  completionTimeText: {
    fontSize: 11,
    marginTop: 2,
  },
  activeActionsContainer: {
    marginTop: 12,
    gap: 8,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    height: 44,
    borderRadius: 10,
    gap: 8,
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  passBatonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  passBatonButtonText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '600',
  },
  lockedInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  lockedInfoText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    marginTop: 10,
  },
  emptyBox: {
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
  },
  emptyBoxTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  emptyBoxSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseButton: {
    padding: 4,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  guardList: {
    maxHeight: 160,
  },
  guardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  guardItemInfo: {
    flex: 1,
  },
  guardName: {
    fontSize: 14,
    fontWeight: '700',
  },
  guardMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  unselectedRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
  },
  reasonInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
    height: 70,
  },
  modalActionButtons: {
    marginTop: 16,
    gap: 8,
  },
  confirmHandoverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    height: 44,
    borderRadius: 10,
    gap: 8,
  },
  confirmHandoverText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  continueMyselfButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
  },
  continueMyselfText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
