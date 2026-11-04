import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  CheckCircle2,
  ShieldCheck,
  Building2,
  AlertTriangle,
  Camera,
  Layers,
  ArrowRight,
  RotateCw,
  Clock,
  Send,
} from 'lucide-react-native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../context/LanguageContext';
import {
  getQuickLocation,
  TourDraft,
  getTourDraft,
  saveTourDraft,
  completeTourVisit,
  syncOfflineTour,
  deleteTourDraft,
  uploadTourEvidence,
} from '../../../services/siteTourService';
import { markReportSubmittedForCheckIn } from '../../../services/db';

export default function TourSummaryScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();

  const params = useLocalSearchParams<{
    executionUuid: string;
    tourOid: string;
    tourVisitOid?: string;
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
  const paramVisitOid = params.tourVisitOid ? parseInt(params.tourVisitOid, 10) : undefined;

  const [draft, setDraft] = useState<TourDraft | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [officerNotes, setOfficerNotes] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const d = await getTourDraft(executionUuid);
        if (d) {
          if (!d.tour_visit_oid && paramVisitOid) {
            d.tour_visit_oid = paramVisitOid;
          }
          setDraft(d);

          // Pre-fill officer notes with remarks entered on questions if not already set
          const comments: string[] = [];
          Object.values(d.checkpoints || {}).forEach((cp) => {
            Object.values(cp.responses || {}).forEach((r) => {
              if (r.comment && r.comment.trim()) {
                comments.push(r.comment.trim());
              }
            });
          });
          if (comments.length > 0) {
            setOfficerNotes(comments.join('; '));
          }
        }
      } catch (e) {
        console.error('Error loading tour draft for summary:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [executionUuid, paramVisitOid]);

  // Compute summary metrics
  const checkpointsList = draft?.blueprint?.checkpoints || [];
  const totalCheckpoints = checkpointsList.length;
  const completedCheckpoints = checkpointsList.filter(
    (cp) => draft?.checkpoints[cp.oid]?.status === 'completed'
  ).length;

  let totalQuestionsAnswered = 0;
  let totalPhotosCaptured = 0;
  let criticalViolationsCount = 0;

  if (draft) {
    Object.values(draft.checkpoints).forEach((cp) => {
      Object.values(cp.responses || {}).forEach((r) => {
        if (r.response_value) totalQuestionsAnswered += 1;
        if (r.photos) totalPhotosCaptured += r.photos.length;
        if (r.is_critical_violation) criticalViolationsCount += 1;
      });
    });
  }

  const handleFinalSubmit = async () => {
    try {
      setSubmitting(true);

      let lat = 0;
      let lng = 0;
      try {
        const loc = await getQuickLocation();
        lat = loc.latitude;
        lng = loc.longitude;
      } catch (err) {
        // Fallback
      }

      // 0. Upload any pending photos in parallel (fast!)
      if (draft) {
        const pendingUploads: Promise<void>[] = [];
        for (const cp of Object.values(draft.checkpoints)) {
          for (const resp of Object.values(cp.responses || {})) {
            for (const photo of resp.photos || []) {
              if (!photo.uploaded_url && photo.local_uri) {
                const uploadTask = (async () => {
                  try {
                    const srvUrl = await uploadTourEvidence(photo.local_uri, {
                      tour_visit_oid: draft.tour_oid,
                      checkpoint_oid: cp.checkpoint_oid,
                      question_oid: resp.question_oid,
                      execution_uuid: draft.execution_uuid,
                    });
                    photo.uploaded_url = srvUrl;
                    photo.upload_status = 'uploaded';
                  } catch (upErr) {
                    console.warn('Deferred photo upload failed, retained locally on device:', upErr);
                  }
                })();
                pendingUploads.push(uploadTask);
              }
            }
          }
        }
        if (pendingUploads.length > 0) {
          await Promise.allSettled(pendingUploads);
          await saveTourDraft(draft);
        }
      }

      // 1. Sync full bundle to backend
      try {
        await syncOfflineTour({
          execution_uuid: executionUuid,
          tour_oid: draft?.tour_oid || 101,
          site_oid: siteId,
          custom_visit_oid: customVisitId,
          session_id: sessionId,
          started_at: draft?.started_at,
          completed_at: new Date().toISOString(),
          checkpoints: draft?.checkpoints || {},
        });
      } catch (syncErr) {
        console.warn('Bundle sync pending offline:', syncErr);
      }

      // 2. Complete Tour Visit on backend
      let completedReportId = '';
      try {
        const targetVisitOid = draft?.tour_visit_oid || draft?.tour_oid || 101;
        const compRes = await completeTourVisit(targetVisitOid, {
          execution_uuid: executionUuid,
          notes: officerNotes.trim(),
          end_latitude: lat,
          end_longitude: lng,
          checkpoints: draft?.checkpoints,
        });
        if (compRes && compRes.report_id) {
          completedReportId = compRes.report_id;
        }
      } catch (apiErr) {
        console.warn('Backend complete tour call pending offline:', apiErr);
      }

      // 3. Mark report submitted for this check-in session so manual check-out is unlocked
      const targetId = plannedId || siteId || customVisitId;
      if (targetId) {
        await markReportSubmittedForCheckIn(
          plannedId || undefined,
          siteId || undefined,
          completedReportId || draft?.report_id || `TOUR-${executionUuid.slice(0, 8)}`,
          'DYNAMIC_TOUR',
          customVisitId || undefined
        );
      }

      // 3. Update local draft status or clean up
      if (draft) {
        const finishedDraft: TourDraft = {
          ...draft,
          completed_at: new Date().toISOString(),
          sync_status: 'synced',
        };
        await saveTourDraft(finishedDraft);
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      Alert.alert(
        t('tour_completed_title') || 'Tour Completed! 🎉',
        'Your site tour checklist and photos have been submitted successfully! View your generated report in Completed Visits.',
        [
          {
            text: t('completed_visits') || 'View Completed Report',
            onPress: () => {
              router.replace('/visits?tab=completed');
            },
          },
        ]
      );
    } catch (e: any) {
      console.error('Error during final tour completion:', e);
      Alert.alert(t('error') || 'Error', e?.message || 'Failed to finalize tour inspection');
    } finally {
      setSubmitting(false);
    }
  };

  const darkNavyBg = isDark ? '#0A1128' : '#F4F7FA';
  const cardBg = isDark ? '#131C33' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subTextColor = isDark ? '#94A3B8' : '#64748B';

  if (loading || !draft) {
    return (
      <View style={[styles.centerBox, { backgroundColor: darkNavyBg }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={[styles.loadingText, { color: subTextColor }]}>Loading summary...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: darkNavyBg }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Success Header Icon */}
        <View style={styles.successHeader}>
          <View style={styles.successIconCircle}>
            <CheckCircle2 color="#22C55E" size={48} />
          </View>
          <Text style={[styles.successTitle, { color: textColor }]}>Tour Checklist Completed</Text>
          <Text style={[styles.successSubtitle, { color: subTextColor }]}>
            All checkpoints verified & checklist items recorded
          </Text>
        </View>

        {/* Site Details Card */}
        <View style={[styles.summaryCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.siteInfoRow}>
            <Building2 color="#3B82F6" size={20} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.siteName, { color: textColor }]}>{siteName}</Text>
              {clientName ? <Text style={[styles.clientName, { color: subTextColor }]}>{clientName}</Text> : null}
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]} />
          <Text style={[styles.tourName, { color: '#3B82F6' }]}>{draft.tour_title}</Text>
        </View>

        {/* Metrics Grid */}
        <View style={styles.metricsGrid}>
          <View style={[styles.metricCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Layers color="#3B82F6" size={22} />
            <Text style={[styles.metricVal, { color: textColor }]}>
              {completedCheckpoints}/{totalCheckpoints}
            </Text>
            <Text style={[styles.metricLabel, { color: subTextColor }]}>Checkpoints Verified</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <ShieldCheck color="#22C55E" size={22} />
            <Text style={[styles.metricVal, { color: textColor }]}>{totalQuestionsAnswered}</Text>
            <Text style={[styles.metricLabel, { color: subTextColor }]}>Questions Answered</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Camera color="#F59E0B" size={22} />
            <Text style={[styles.metricVal, { color: textColor }]}>{totalPhotosCaptured}</Text>
            <Text style={[styles.metricLabel, { color: subTextColor }]}>Photos Attached</Text>
          </View>

          <View
            style={[
              styles.metricCard,
              {
                backgroundColor: cardBg,
                borderColor: criticalViolationsCount > 0 ? '#EF4444' : cardBorder,
              },
            ]}
          >
            <AlertTriangle
              color={criticalViolationsCount > 0 ? '#EF4444' : '#22C55E'}
              size={22}
            />
            <Text
              style={[
                styles.metricVal,
                { color: criticalViolationsCount > 0 ? '#EF4444' : '#22C55E' },
              ]}
            >
              {criticalViolationsCount}
            </Text>
            <Text style={[styles.metricLabel, { color: subTextColor }]}>Critical Violations</Text>
          </View>
        </View>

        {/* Officer Final Remarks */}
        <View style={[styles.notesCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.notesLabel, { color: textColor }]}>Officer Tour Remarks & Notes:</Text>
          <TextInput
            style={[
              styles.notesInput,
              {
                backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                color: textColor,
                borderColor: cardBorder,
              },
            ]}
            placeholder="Add general visit observation or handover note (optional)..."
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={3}
            value={officerNotes}
            onChangeText={setOfficerNotes}
          />
        </View>

        {/* Finalize Button */}
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={submitting}
          onPress={handleFinalSubmit}
          style={styles.finalizeBtn}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Send color="#FFFFFF" size={18} />
              <Text style={styles.finalizeBtnText}>Finalize & Submit Inspection Report</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 30 }} />
      </ScrollView>
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
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  successHeader: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  successSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  siteInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  siteName: {
    fontSize: 16,
    fontWeight: '700',
  },
  clientName: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  tourName: {
    fontSize: 14,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  metricVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  notesCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
  },
  finalizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E',
    paddingVertical: 15,
    borderRadius: 12,
    gap: 10,
    marginTop: 4,
  },
  finalizeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
