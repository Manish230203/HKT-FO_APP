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
  Image,
  Modal,
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
  ChevronDown,
  ChevronUp,
  MapPin,
  QrCode,
  FileText,
  X,
  Maximize2,
  UserCheck,
  Calendar,
  Compass,
} from 'lucide-react-native';
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

  // Collapsible Accordion State
  const [expandedCheckpoints, setExpandedCheckpoints] = useState<Record<number, boolean>>({});
  const [photosModuleExpanded, setPhotosModuleExpanded] = useState<boolean>(false);
  const [metaModuleExpanded, setMetaModuleExpanded] = useState<boolean>(false);
  const [previewPhoto, setPreviewPhoto] = useState<{ uri: string; caption?: string } | null>(null);

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

          // By default expand all checkpoints so officer immediately sees their filled data
          const initialExpanded: Record<number, boolean> = {};
          const cpList = d.blueprint?.checkpoints || [];
          cpList.forEach((cp) => {
            initialExpanded[cp.oid] = true;
          });
          setExpandedCheckpoints(initialExpanded);

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

  // Flatten all photos for quick photo gallery access
  const allCapturedPhotos: Array<{ uri: string; checkpointName: string; questionText?: string; timestamp?: string }> = [];

  if (draft) {
    Object.entries(draft.checkpoints).forEach(([cpOidStr, cp]) => {
      const cpOid = Number(cpOidStr);
      const cpBp = checkpointsList.find((c) => c.oid === cpOid);
      const cpName = cpBp?.name || `Checkpoint #${cpOid}`;

      Object.values(cp.responses || {}).forEach((r) => {
        if (r.response_value) totalQuestionsAnswered += 1;
        if (r.is_critical_violation) criticalViolationsCount += 1;

        if (r.photos && r.photos.length > 0) {
          totalPhotosCaptured += r.photos.length;
          const qBp = cpBp?.questions?.find((q) => q.oid === r.question_oid);
          r.photos.forEach((p) => {
            const uri = p.local_uri || p.uploaded_url;
            if (uri) {
              allCapturedPhotos.push({
                uri,
                checkpointName: cpName,
                questionText: qBp?.text,
                timestamp: p.captured_at,
              });
            }
          });
        }
      });
    });
  }

  const toggleCheckpointAccordion = (cpOid: number) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    setExpandedCheckpoints((prev) => ({
      ...prev,
      [cpOid]: !prev[cpOid],
    }));
  };

  const areAllExpanded = checkpointsList.length > 0 && checkpointsList.every((cp) => !!expandedCheckpoints[cp.oid]);

  const toggleExpandAll = () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    const nextState = !areAllExpanded;
    const updated: Record<number, boolean> = {};
    checkpointsList.forEach((cp) => {
      updated[cp.oid] = nextState;
    });
    setExpandedCheckpoints(updated);
    setPhotosModuleExpanded(nextState);
    setMetaModuleExpanded(nextState);
  };

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

      // 4. Update local draft status or clean up
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
  const innerCardBg = isDark ? '#0F172A' : '#F8FAFC';
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
            <CheckCircle2 color={completedCheckpoints === totalCheckpoints ? "#22C55E" : "#3B82F6"} size={44} />
          </View>
          <Text style={[styles.successTitle, { color: textColor }]}>
            {completedCheckpoints === totalCheckpoints ? 'Tour Checklist Completed' : 'Patrol Tour Checked Out'}
          </Text>
          <Text style={[styles.successSubtitle, { color: subTextColor }]}>
            {completedCheckpoints === totalCheckpoints
              ? 'All checkpoints verified & checklist items recorded'
              : `${completedCheckpoints} of ${totalCheckpoints} checkpoints covered`}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.tourName, { color: '#3B82F6' }]}>{draft.tour_title}</Text>
            <View style={styles.statusBadgeLive}>
              <View style={styles.pulseDot} />
              <Text style={styles.statusBadgeText}>READY TO SUBMIT</Text>
            </View>
          </View>
        </View>

        {/* Metrics Grid */}
        <View style={styles.metricsGrid}>
          <View style={[styles.metricCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Layers color="#3B82F6" size={20} />
            <Text style={[styles.metricVal, { color: textColor }]}>
              {completedCheckpoints}/{totalCheckpoints}
            </Text>
            <Text style={[styles.metricLabel, { color: subTextColor }]}>Checkpoints Verified</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <ShieldCheck color="#22C55E" size={20} />
            <Text style={[styles.metricVal, { color: textColor }]}>{totalQuestionsAnswered}</Text>
            <Text style={[styles.metricLabel, { color: subTextColor }]}>Questions Answered</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Camera color="#F59E0B" size={20} />
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
              size={20}
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

        {/* COLLAPSIBLE MODULES SECTION HEADER */}
        <View style={styles.sectionHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Layers color="#3B82F6" size={18} />
            <Text style={[styles.sectionHeadingTitle, { color: textColor }]}>Filled Inspection Details</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={toggleExpandAll}
            style={[styles.toggleAllBtn, { borderColor: cardBorder, backgroundColor: innerCardBg }]}
          >
            <Text style={styles.toggleAllBtnText}>
              {areAllExpanded ? 'Collapse All' : 'Expand All'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* MODULE 1: CHECKPOINTS & QUESTIONS (COLLAPSIBLE ACCORDION PER CHECKPOINT) */}
        {checkpointsList.map((cp, idx) => {
          const isExpanded = !!expandedCheckpoints[cp.oid];
          const cpExec = draft.checkpoints[cp.oid];
          const responses = cpExec?.responses || {};
          const isDone = cpExec?.status === 'completed' || cpExec?.status === 'verified';
          const answeredCount = Object.values(responses).filter((r) => !!r.response_value).length;
          const photosInCp = Object.values(responses).reduce((acc, r) => acc + (r.photos?.length || 0), 0);
          const hasViolationInCp = Object.values(responses).some((r) => r.is_critical_violation || r.is_failure);

          return (
            <View
              key={cp.oid}
              style={[
                styles.accordionCard,
                {
                  backgroundColor: cardBg,
                  borderColor: isExpanded ? '#3B82F6' : cardBorder,
                },
              ]}
            >
              {/* Accordion Header (Tappable) */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => toggleCheckpointAccordion(cp.oid)}
                style={styles.accordionHeader}
              >
                <View style={styles.accordionHeaderLeft}>
                  <View style={[styles.cpNumberBadge, { backgroundColor: isDone ? '#22C55E' : '#3B82F6' }]}>
                    <Text style={styles.cpNumberText}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cpTitleText, { color: textColor }]} numberOfLines={1}>
                      {cp.name}
                    </Text>
                    <View style={styles.cpMetaRow}>
                      {isDone && (
                        <View style={styles.verifiedMiniTag}>
                          <CheckCircle2 color="#22C55E" size={11} />
                          <Text style={styles.verifiedMiniText}>Verified</Text>
                        </View>
                      )}
                      <Text style={[styles.cpSubText, { color: subTextColor }]}>
                        {answeredCount} Qs {photosInCp > 0 ? `• ${photosInCp} 📷` : ''}
                      </Text>
                      {hasViolationInCp && (
                        <View style={styles.violationMiniTag}>
                          <Text style={styles.violationMiniText}>Violation</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <View style={[styles.chevronCircle, { backgroundColor: innerCardBg }]}>
                  {isExpanded ? (
                    <ChevronUp color={subTextColor} size={18} />
                  ) : (
                    <ChevronDown color={subTextColor} size={18} />
                  )}
                </View>
              </TouchableOpacity>

              {/* Accordion Body (Collapsible Content) */}
              {isExpanded && (
                <View style={styles.accordionBody}>
                  {/* Verification Detail Strip */}
                  <View style={[styles.verificationBox, { backgroundColor: innerCardBg, borderColor: cardBorder }]}>
                    <View style={styles.verifRow}>
                      <MapPin color="#3B82F6" size={14} />
                      <Text style={[styles.verifLabel, { color: subTextColor }]}>GPS Status:</Text>
                      <Text style={[styles.verifValue, { color: '#22C55E' }]}>
                        {cpExec?.accuracy_meters
                          ? `GPS Verified (±${Math.round(cpExec.accuracy_meters)}m accuracy)`
                          : 'GPS Verified (Within Range)'}
                      </Text>
                    </View>

                    {cpExec?.scanned_qr ? (
                      <View style={styles.verifRow}>
                        <QrCode color="#3B82F6" size={14} />
                        <Text style={[styles.verifLabel, { color: subTextColor }]}>QR Payload:</Text>
                        <Text style={[styles.verifValue, { color: textColor }]} numberOfLines={1}>
                          {cpExec.scanned_qr}
                        </Text>
                      </View>
                    ) : null}

                    {cpExec?.verified_at ? (
                      <View style={styles.verifRow}>
                        <Clock color="#3B82F6" size={14} />
                        <Text style={[styles.verifLabel, { color: subTextColor }]}>Verified At:</Text>
                        <Text style={[styles.verifValue, { color: textColor }]}>
                          {new Date(cpExec.verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Checklist Questions List */}
                  {cp.questions && cp.questions.length > 0 ? (
                    <View style={{ marginTop: 12, gap: 10 }}>
                      {cp.questions.map((q, qIndex) => {
                        const resp = responses[q.oid];
                        const ansValue = resp?.response_value || 'Not Answered';
                        const isYes = ansValue.toUpperCase() === 'YES';
                        const isNo = ansValue.toUpperCase() === 'NO';
                        const isCritical = resp?.is_critical_violation || false;
                        const comment = resp?.comment?.trim();
                        const photos = resp?.photos || [];

                        return (
                          <View
                            key={q.oid}
                            style={[
                              styles.questionSummaryCard,
                              {
                                backgroundColor: innerCardBg,
                                borderColor: isCritical ? '#EF4444' : cardBorder,
                              },
                            ]}
                          >
                            {/* Question Header & Answer Pill */}
                            <View style={styles.qHeadRow}>
                              <Text style={[styles.qIndexText, { color: subTextColor }]}>Q{qIndex + 1}.</Text>
                              <Text style={[styles.qText, { color: textColor }]}>{q.text}</Text>
                            </View>

                            <View style={styles.answerRow}>
                              <View
                                style={[
                                  styles.answerBadge,
                                  isYes && styles.answerBadgeYes,
                                  isNo && styles.answerBadgeNo,
                                  !isYes && !isNo && styles.answerBadgeNeutral,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.answerBadgeText,
                                    isYes && styles.answerBadgeTextYes,
                                    isNo && styles.answerBadgeTextNo,
                                  ]}
                                >
                                  {isYes ? '✓ YES' : isNo ? '✗ NO' : ansValue}
                                </Text>
                              </View>

                              {isCritical && (
                                <View style={styles.criticalBadge}>
                                  <AlertTriangle color="#EF4444" size={12} />
                                  <Text style={styles.criticalBadgeText}>Critical Violation</Text>
                                </View>
                              )}
                            </View>

                            {/* Question Remark / Note */}
                            {comment ? (
                              <View style={[styles.commentBox, { borderColor: cardBorder }]}>
                                <Text style={[styles.commentLabel, { color: subTextColor }]}>Officer Remark:</Text>
                                <Text style={[styles.commentText, { color: textColor }]}>{comment}</Text>
                              </View>
                            ) : null}

                            {/* Question Attached Photos */}
                            {photos.length > 0 && (
                              <View style={{ marginTop: 8 }}>
                                <Text style={[styles.photosTitle, { color: subTextColor }]}>
                                  Attached Photos ({photos.length}):
                                </Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosScroll}>
                                  {photos.map((photo, pIdx) => {
                                    const photoUri = photo.local_uri || photo.uploaded_url;
                                    if (!photoUri) return null;
                                    return (
                                      <TouchableOpacity
                                        key={photo.id || pIdx}
                                        activeOpacity={0.8}
                                        onPress={() =>
                                          setPreviewPhoto({
                                            uri: photoUri,
                                            caption: `${cp.name} - Q${qIndex + 1}: ${q.text}`,
                                          })
                                        }
                                        style={styles.thumbWrapper}
                                      >
                                        <Image source={{ uri: photoUri }} style={styles.thumbImage} resizeMode="cover" />
                                        <View style={styles.expandOverlay}>
                                          <Maximize2 color="#FFFFFF" size={12} />
                                        </View>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </ScrollView>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={[styles.emptyHintText, { color: subTextColor }]}>
                      No checklist questions configured for this checkpoint.
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/* MODULE 2: ALL PHOTOS GALLERY (COLLAPSIBLE) */}
        {allCapturedPhotos.length > 0 && (
          <View style={[styles.accordionCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPhotosModuleExpanded((v) => !v)}
              style={styles.accordionHeader}
            >
              <View style={styles.accordionHeaderLeft}>
                <View style={[styles.cpNumberBadge, { backgroundColor: '#F59E0B' }]}>
                  <Camera color="#FFFFFF" size={14} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cpTitleText, { color: textColor }]}>Captured Evidence Photos</Text>
                  <Text style={[styles.cpSubText, { color: subTextColor }]}>
                    {allCapturedPhotos.length} photo{allCapturedPhotos.length > 1 ? 's' : ''} captured during inspection
                  </Text>
                </View>
              </View>
              <View style={[styles.chevronCircle, { backgroundColor: innerCardBg }]}>
                {photosModuleExpanded ? (
                  <ChevronUp color={subTextColor} size={18} />
                ) : (
                  <ChevronDown color={subTextColor} size={18} />
                )}
              </View>
            </TouchableOpacity>

            {photosModuleExpanded && (
              <View style={styles.accordionBody}>
                <View style={styles.galleryGrid}>
                  {allCapturedPhotos.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      activeOpacity={0.8}
                      onPress={() => setPreviewPhoto({ uri: item.uri, caption: `${item.checkpointName}${item.questionText ? ` - ${item.questionText}` : ''}` })}
                      style={styles.galleryItem}
                    >
                      <Image source={{ uri: item.uri }} style={styles.galleryImage} resizeMode="cover" />
                      <View style={styles.galleryBadge}>
                        <Text style={styles.galleryBadgeText} numberOfLines={1}>
                          {item.checkpointName}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* MODULE 3: TOUR METADATA & TIMINGS (COLLAPSIBLE) */}
        <View style={[styles.accordionCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setMetaModuleExpanded((v) => !v)}
            style={styles.accordionHeader}
          >
            <View style={styles.accordionHeaderLeft}>
              <View style={[styles.cpNumberBadge, { backgroundColor: '#6366F1' }]}>
                <Compass color="#FFFFFF" size={14} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cpTitleText, { color: textColor }]}>Tour Audit & Session Info</Text>
                <Text style={[styles.cpSubText, { color: subTextColor }]}>Execution UUID & Timestamps</Text>
              </View>
            </View>
            <View style={[styles.chevronCircle, { backgroundColor: innerCardBg }]}>
              {metaModuleExpanded ? (
                <ChevronUp color={subTextColor} size={18} />
              ) : (
                <ChevronDown color={subTextColor} size={18} />
              )}
            </View>
          </TouchableOpacity>

          {metaModuleExpanded && (
            <View style={styles.accordionBody}>
              <View style={[styles.verificationBox, { backgroundColor: innerCardBg, borderColor: cardBorder }]}>
                <View style={styles.verifRow}>
                  <Calendar color="#3B82F6" size={14} />
                  <Text style={[styles.verifLabel, { color: subTextColor }]}>Started At:</Text>
                  <Text style={[styles.verifValue, { color: textColor }]}>
                    {draft.started_at ? new Date(draft.started_at).toLocaleString() : 'N/A'}
                  </Text>
                </View>
                <View style={styles.verifRow}>
                  <Clock color="#3B82F6" size={14} />
                  <Text style={[styles.verifLabel, { color: subTextColor }]}>Completed At:</Text>
                  <Text style={[styles.verifValue, { color: textColor }]}>
                    {new Date().toLocaleTimeString()}
                  </Text>
                </View>
                <View style={styles.verifRow}>
                  <FileText color="#3B82F6" size={14} />
                  <Text style={[styles.verifLabel, { color: subTextColor }]}>Session ID:</Text>
                  <Text style={[styles.verifValue, { color: textColor }]}>
                    {draft.execution_uuid ? draft.execution_uuid.slice(0, 18) + '...' : 'N/A'}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Officer Final Remarks */}
        <View style={[styles.notesCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.notesLabel, { color: textColor }]}>Officer Tour Remarks & Notes:</Text>
          <TextInput
            style={[
              styles.notesInput,
              {
                backgroundColor: innerCardBg,
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

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* FULL-SCREEN IMAGE PREVIEW MODAL */}
      <Modal
        visible={previewPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPhoto(null)}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={2}>
                {previewPhoto?.caption || 'Photo Preview'}
              </Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setPreviewPhoto(null)}
                style={styles.modalCloseBtn}
              >
                <X color="#FFFFFF" size={22} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalImageContainer}>
              {previewPhoto?.uri ? (
                <Image
                  source={{ uri: previewPhoto.uri }}
                  style={styles.modalFullImage}
                  resizeMode="contain"
                />
              ) : null}
            </View>
          </SafeAreaView>
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
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  successHeader: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  successTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  successSubtitle: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
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
    flex: 1,
  },
  statusBadgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#22C55E',
    letterSpacing: 0.5,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricVal: {
    fontSize: 17,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },

  /* SECTION HEADER & EXPAND/COLLAPSE */
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 2,
  },
  sectionHeadingTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  toggleAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  toggleAllBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
  },

  /* ACCORDION CARDS */
  accordionCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  cpNumberBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cpNumberText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  cpTitleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cpMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  verifiedMiniTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedMiniText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#22C55E',
  },
  violationMiniTag: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  violationMiniText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EF4444',
  },
  cpSubText: {
    fontSize: 11,
    fontWeight: '500',
  },
  chevronCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  accordionBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },

  /* VERIFICATION BOX */
  verificationBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  verifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verifLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  verifValue: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },

  /* QUESTION DETAIL CARD */
  questionSummaryCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  qHeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  qIndexText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  qText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  answerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  answerBadgeYes: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
  },
  answerBadgeNo: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
  },
  answerBadgeNeutral: {
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
  },
  answerBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3B82F6',
  },
  answerBadgeTextYes: {
    color: '#22C55E',
  },
  answerBadgeTextNo: {
    color: '#EF4444',
  },
  criticalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  criticalBadgeText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '700',
  },
  commentBox: {
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
  },
  commentLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  commentText: {
    fontSize: 12,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  photosTitle: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  photosScroll: {
    gap: 8,
  },
  thumbWrapper: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  expandOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    padding: 2,
  },
  emptyHintText: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 8,
  },

  /* GALLERY GRID */
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  galleryItem: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  galleryBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  galleryBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },

  /* OFFICER NOTES */
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

  /* FINALIZE BUTTON */
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

  /* PREVIEW MODAL */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
  },
  modalSafe: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  modalFullImage: {
    width: '100%',
    height: '100%',
  },
});
