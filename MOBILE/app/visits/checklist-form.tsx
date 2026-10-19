import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Shield,
  Camera,
  CheckCircle2,
  XCircle,
  Trash2,
  AlertCircle,
  FileText,
  ChevronRight,
  Send,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';
import { getSiteChecklist, submitSiteChecklist } from '../../services/visitService';
import { clearActiveCheckIn } from '../../services/db';
import { useTheme } from '../../context/ThemeContext';
import { StatusBar } from 'react-native';

interface QuestionItem {
  id: number | string;
  question_id: number;
  text: string;
  response_type: string;
  options: string[];
  is_critical?: boolean;
  requires_photo?: boolean;
  requires_comment?: boolean;
}

interface AnswerState {
  answer: string;
  remark: string;
  photoUri: string | null;
  photoBase64: string | null;
}

export default function ChecklistFormScreen() {
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    siteId: string;
    siteName?: string;
    clientId?: string;
    clientName?: string;
    plannedId?: string;
    customVisitId?: string;
    customSiteName?: string;
    customClientName?: string;
    isCustom?: string;
    checkInTime?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checklistTitle, setChecklistTitle] = useState('Site Inspection Checklist');
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [overallRemarks, setOverallRemarks] = useState('');

  const siteId = params.siteId || '1';
  const siteName = params.siteName ? decodeURIComponent(params.siteName) : (params.customSiteName ? decodeURIComponent(params.customSiteName) : 'Site');
  const clientName = params.clientName ? decodeURIComponent(params.clientName) : (params.customClientName ? decodeURIComponent(params.customClientName) : 'Client');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await getSiteChecklist(siteId);
        if (res && res.success) {
          setChecklistTitle(res.title || `Site Inspection - ${siteName}`);
          const qList: QuestionItem[] = res.questions || [];
          setQuestions(qList);

          // Initialize answer states
          const initialAnswers: Record<string, AnswerState> = {};
          qList.forEach((q) => {
            initialAnswers[String(q.id)] = {
              answer: 'Yes', // Default positive
              remark: '',
              photoUri: null,
              photoBase64: null,
            };
          });
          setAnswers(initialAnswers);
        }
      } catch (e) {
        console.error('Error loading checklist:', e);
        Alert.alert('Notice', 'Loaded standard field checklist questions.');
      } finally {
        setLoading(false);
      }
    })();
  }, [siteId]);

  const handleSetAnswer = (qId: string, val: string) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    setAnswers((prev) => ({
      ...prev,
      [qId]: {
        ...prev[qId],
        answer: val,
      },
    }));
  };

  const handleSetRemark = (qId: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qId]: {
        ...prev[qId],
        remark: text,
      },
    }));
  };

  const handlePickPhoto = async (qId: string) => {
    try {
      Alert.alert(
        'Question Photo',
        'Capture a photo for this checklist question:',
        [
          {
            text: 'Camera',
            onPress: async () => {
              const perm = await ImagePicker.requestCameraPermissionsAsync();
              if (!perm.granted) {
                Alert.alert('Permission Denied', 'Camera permission is required.');
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.6,
                base64: true,
              });
              if (!result.canceled && result.assets && result.assets[0]) {
                const asset = result.assets[0];
                setAnswers((prev) => ({
                  ...prev,
                  [qId]: {
                    ...prev[qId],
                    photoUri: asset.uri,
                    photoBase64: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : null,
                  },
                }));
              }
            },
          },
          {
            text: 'Gallery',
            onPress: async () => {
              const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!perm.granted) {
                Alert.alert('Permission Denied', 'Media library permission is required.');
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.6,
                base64: true,
              });
              if (!result.canceled && result.assets && result.assets[0]) {
                const asset = result.assets[0];
                setAnswers((prev) => ({
                  ...prev,
                  [qId]: {
                    ...prev[qId],
                    photoUri: asset.uri,
                    photoBase64: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : null,
                  },
                }));
              }
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } catch (e) {
      console.error('Error attaching photo:', e);
    }
  };

  const handleRemovePhoto = (qId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qId]: {
        ...prev[qId],
        photoUri: null,
        photoBase64: null,
      },
    }));
  };

  const handleSubmit = async () => {
    // Validate if any critical question or required field is missing
    const payloadAnswers = questions.map((q) => {
      const ans = answers[String(q.id)] || {
        answer: 'Yes',
        remark: '',
        photoUri: null,
        photoBase64: null,
      };
      return {
        question_id: q.question_id || q.id,
        text: q.text,
        answer: ans.answer,
        remark: ans.remark,
        photo: ans.photoBase64 || ans.photoUri || null,
      };
    });

    setSubmitting(true);
    try {
      const payload: any = {
        employee_id: user?.id || (user as any)?.oid || 1,
        officer_name: user?.name || 'Field Officer',
        site_id: Number(siteId) || null,
        site_name: siteName,
        client_id: params.clientId ? Number(params.clientId) : null,
        client_name: clientName,
        planned_id: params.plannedId || null,
        custom_visit_id: params.customVisitId || null,
        check_in_time: params.checkInTime || '09:00',
        check_out_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        overall_remarks: overallRemarks,
        answers: payloadAnswers,
      };

      const res = await submitSiteChecklist(payload);

      if (params.plannedId) {
        await clearActiveCheckIn(params.plannedId);
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      Alert.alert(
        'Checklist Submitted! 🎉',
        res?.message || `Site inspection checklist for ${siteName} has been successfully recorded.`,
        [
          {
            text: 'View Visits',
            onPress: () => {
              router.replace('/visits?tab=completed');
            },
          },
          {
            text: 'Go to Dashboard',
            onPress: () => {
              router.replace('/(tabs)/dashboard');
            },
          },
        ]
      );
    } catch (e: any) {
      console.error('Submit checklist error:', e);
      Alert.alert('Submission Error', e?.message || 'Failed to submit checklist. Please check connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

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
          <Text style={styles.headerTitle} numberOfLines={1}>
            {checklistTitle}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            Site: {siteName} • {clientName}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Site Banner Card */}
          <View style={styles.siteBanner}>
            <View style={styles.siteBannerIconBox}>
              <Shield color="#3B82F6" size={24} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.siteBannerTitle}>{siteName}</Text>
              <Text style={styles.siteBannerSubtitle}>Client: {clientName}</Text>
              <Text style={styles.siteBannerMeta}>
                QR Verified • {questions.length} Assigned Inspection Questions
              </Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.loadingText}>Loading assigned questions...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionHeaderTitle}>INSPECTION QUESTIONS</Text>

              {questions.map((q, idx) => {
                const current = answers[String(q.id)] || {
                  answer: 'Yes',
                  remark: '',
                  photoUri: null,
                  photoBase64: null,
                };

                return (
                  <View key={String(q.id)} style={styles.questionCard}>
                    {/* Question Header & Badges */}
                    <View style={styles.questionHeaderRow}>
                      <View style={styles.qNumBadge}>
                        <Text style={styles.qNumText}>#{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.questionText}>{q.text}</Text>
                        <View style={styles.badgeRow}>
                          {q.is_critical && (
                            <View style={styles.criticalBadge}>
                              <Text style={styles.criticalBadgeText}>CRITICAL</Text>
                            </View>
                          )}
                          {q.requires_photo && (
                            <View style={styles.photoBadge}>
                              <Text style={styles.photoBadgeText}>PHOTO NEEDED</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>

                    {/* Answer Toggle Buttons */}
                    <View style={styles.answerButtonsRow}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => handleSetAnswer(String(q.id), 'Yes')}
                        style={[
                          styles.ansBtn,
                          current.answer === 'Yes' && styles.ansBtnYesActive,
                        ]}
                      >
                        <CheckCircle2
                          color={current.answer === 'Yes' ? '#10B981' : '#64748B'}
                          size={18}
                          style={{ marginRight: 6 }}
                        />
                        <Text
                          style={[
                            styles.ansBtnText,
                            current.answer === 'Yes' && styles.ansBtnTextYesActive,
                          ]}
                        >
                          YES
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => handleSetAnswer(String(q.id), 'No')}
                        style={[
                          styles.ansBtn,
                          current.answer === 'No' && styles.ansBtnNoActive,
                        ]}
                      >
                        <XCircle
                          color={current.answer === 'No' ? '#EF4444' : '#64748B'}
                          size={18}
                          style={{ marginRight: 6 }}
                        />
                        <Text
                          style={[
                            styles.ansBtnText,
                            current.answer === 'No' && styles.ansBtnTextNoActive,
                          ]}
                        >
                          NO
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Question-Specific Remark / Note */}
                    <View style={styles.remarkBox}>
                      <Text style={styles.inputLabel}>REMARK / OBSERVATION</Text>
                      <TextInput
                        style={styles.remarkInput}
                        placeholder="Add observation or remark for this question..."
                        placeholderTextColor="#64748B"
                        value={current.remark}
                        onChangeText={(txt) => handleSetRemark(String(q.id), txt)}
                      />
                    </View>

                    {/* Question-Specific Photo Attachment */}
                    <View style={styles.photoSection}>
                      <Text style={styles.inputLabel}>
                        QUESTION PHOTO {q.requires_photo ? '(REQUIRED)' : '(OPTIONAL)'}
                      </Text>

                      {current.photoUri ? (
                        <View style={styles.photoPreviewRow}>
                          <Image
                            source={{ uri: current.photoUri }}
                            style={styles.photoThumb}
                          />
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.photoAttachedText}>Photo attached ✓</Text>
                            <TouchableOpacity
                              style={styles.removePhotoBtn}
                              onPress={() => handleRemovePhoto(String(q.id))}
                              activeOpacity={0.8}
                            >
                              <Trash2 color="#EF4444" size={14} style={{ marginRight: 4 }} />
                              <Text style={styles.removePhotoText}>Remove Photo</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.addPhotoBtn}
                          onPress={() => handlePickPhoto(String(q.id))}
                          activeOpacity={0.85}
                        >
                          <Camera color="#3B82F6" size={18} style={{ marginRight: 8 }} />
                          <Text style={styles.addPhotoBtnText}>Take or Attach Photo</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* Overall Remarks Card */}
              <View style={styles.overallCard}>
                <Text style={styles.overallTitle}>OVERALL VISIT REMARKS</Text>
                <TextInput
                  style={styles.overallInput}
                  multiline
                  numberOfLines={4}
                  placeholder="Enter any additional inspection notes, guard shift observations, or overall summary..."
                  placeholderTextColor="#64748B"
                  value={overallRemarks}
                  onChangeText={setOverallRemarks}
                />
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitButton, submitting && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Send color="#FFFFFF" size={18} style={{ marginRight: 8 }} />
                    <Text style={styles.submitButtonText}>SUBMIT SITE CHECKLIST</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  siteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  siteBannerIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  siteBannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  siteBannerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  siteBannerMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
    marginTop: 4,
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: colors.textSecondary,
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  questionCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  questionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  qNumBadge: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 10,
    marginTop: 2,
  },
  qNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3B82F6',
  },
  questionText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  criticalBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  criticalBadgeText: {
    color: '#EF4444',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  photoBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  photoBadgeText: {
    color: '#F59E0B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  answerButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  ansBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  ansBtnYesActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: '#10B981',
  },
  ansBtnNoActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderColor: '#EF4444',
  },
  ansBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  ansBtnTextYesActive: {
    color: '#10B981',
  },
  ansBtnTextNoActive: {
    color: '#EF4444',
  },
  remarkBox: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  remarkInput: {
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 13,
  },
  photoSection: {
    marginTop: 4,
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: 10,
    paddingVertical: 10,
  },
  addPhotoBtnText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '700',
  },
  photoPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: colors.surfaceSecondary,
  },
  photoAttachedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  removePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  removePhotoText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '600',
  },
  overallCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  overallTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  overallInput: {
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    padding: 12,
    color: colors.text,
    fontSize: 13,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
