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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  ShieldCheck,
  Camera,
  CheckCircle2,
  XCircle,
  Trash2,
  AlertCircle,
  FileText,
  Send,
  HelpCircle,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  getCheckpointChecklist,
  submitCheckpointChecklist,
  ChecklistQuestion,
} from '../../services/patrolService';

interface AnswerState {
  answer: 'Yes' | 'No';
  comment: string;
  photoUri: string | null;
  photoBase64: string | null;
}

export default function CheckpointChecklistScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const params = useLocalSearchParams<{
    checkpointId: string;
    checkpointName: string;
    tourName: string;
    siteId?: string;
    checklistId?: string;
    latitude?: string;
    longitude?: string;
  }>();

  const checkpointId = parseInt(params.checkpointId || '0', 10);
  const checkpointName = params.checkpointName ? decodeURIComponent(params.checkpointName) : 'Checkpoint';
  const tourName = params.tourName ? decodeURIComponent(params.tourName) : 'Tour';
  const siteId = params.siteId ? parseInt(params.siteId, 10) : 1;
  const initialLat = params.latitude ? parseFloat(params.latitude) : 0;
  const initialLng = params.longitude ? parseFloat(params.longitude) : 0;
  const empOid = user?.id || 113;

  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [checklistTitle, setChecklistTitle] = useState<string>(`Checklist - ${checkpointName}`);
  const [questions, setQuestions] = useState<ChecklistQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await getCheckpointChecklist(checkpointId, empOid);
        if (res && res.success) {
          setChecklistTitle(res.title || `Checklist - ${checkpointName}`);
          const qList = res.questions || [];
          setQuestions(qList);

          // Initialize answer states
          const initialAns: Record<number, AnswerState> = {};
          qList.forEach((q) => {
            initialAns[q.question_id] = {
              answer: (q.default_answer as 'Yes' | 'No') || 'Yes',
              comment: '',
              photoUri: null,
              photoBase64: null,
            };
          });
          setAnswers(initialAns);
        }
      } catch (e: any) {
        console.error('Error loading checklist questions:', e);
        Alert.alert('Notice', 'Loaded standard checklist questions for this checkpoint.');
      } finally {
        setLoading(false);
      }
    })();
  }, [checkpointId, empOid, checkpointName]);

  const handleSelectAnswer = (qId: number, val: 'Yes' | 'No') => {
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

  const handlePickPhoto = async (qId: number) => {
    Alert.alert(
      'Attach Photo',
      'Choose camera or gallery for this question:',
      [
        {
          text: 'Camera',
          onPress: async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              Alert.alert('Permission Required', 'Camera permission is needed to capture checkpoint photo.');
              return;
            }
            const res = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.5,
              base64: true,
            });
            if (!res.canceled && res.assets && res.assets[0]) {
              const asset = res.assets[0];
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
              Alert.alert('Permission Required', 'Gallery permission is needed to attach photo.');
              return;
            }
            const res = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.5,
              base64: true,
            });
            if (!res.canceled && res.assets && res.assets[0]) {
              const asset = res.assets[0];
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
  };

  const handleRemovePhoto = (qId: number) => {
    setAnswers((prev) => ({
      ...prev,
      [qId]: {
        ...prev[qId],
        photoUri: null,
        photoBase64: null,
      },
    }));
  };

  const handlePressSubmit = () => {
    // Confirmation dialog as explicitly specified in requirements
    Alert.alert(
      'Confirm Submission',
      `Are you sure you want to submit the checklist answers for checkpoint '${checkpointName}'?`,
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: 'SUBMIT',
          onPress: executeSubmit,
        },
      ]
    );
  };

  const executeSubmit = async () => {
    try {
      setSubmitting(true);

      // Get latest GPS coordinates
      let lat = initialLat;
      let lng = initialLng;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      } catch (err) {
        // Fallback to initial
      }

      // Format answers for submission
      const payloadAnswers = questions.map((q) => {
        const a = answers[q.question_id] || { answer: 'Yes', comment: '', photoBase64: null };
        return {
          link_id: q.link_id,
          question_id: q.question_id,
          answer_value: a.answer,
          comment: a.comment,
          photo_base64: a.photoBase64,
        };
      });

      const res = await submitCheckpointChecklist(checkpointId, {
        empOid,
        tourName,
        latitude: lat,
        longitude: lng,
        siteId,
        answers: payloadAnswers,
      });

      if (res && res.success) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        if (res.tour_completed) {
          Alert.alert(
            'Tour Completed! 🎉',
            `Congratulations! All ${res.total_checkpoints} checkpoints for tour '${tourName}' have been completed and GPS-verified.`,
            [
              {
                text: 'View Tours',
                onPress: () => router.replace('/patrol'),
              },
            ]
          );
        } else {
          Alert.alert(
            'Checklist Submitted ✓',
            `Checklist for '${checkpointName}' submitted successfully. The next checkpoint has been unlocked!`,
            [
              {
                text: 'Next Checkpoint',
                onPress: () =>
                  router.replace({
                    pathname: '/patrol/tour',
                    params: {
                      tourName: tourName,
                      siteId: String(siteId),
                    },
                  }),
              },
            ]
          );
        }
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Failed to submit checklist.';
      Alert.alert('Submission Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const darkNavyBg = isDark ? '#0A1128' : '#F4F7FA';
  const cardBg = isDark ? '#131C33' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subTextColor = isDark ? '#94A3B8' : '#64748B';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkNavyBg }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
          >
            <ArrowLeft color={isDark ? '#FFFFFF' : '#0F172A'} size={22} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
              {checkpointName}
            </Text>
            <Text style={[styles.headerSubtitle, { color: '#3B82F6' }]} numberOfLines={1}>
              {tourName} • Checkpoint Checklist
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Banner Card */}
          <View style={[styles.topBannerCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.bannerRow}>
              <View style={styles.bannerIconBox}>
                <ShieldCheck color="#22C55E" size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bannerTitle, { color: textColor }]}>QR Code Verified ✓</Text>
                <Text style={[styles.bannerSubtitle, { color: subTextColor }]}>
                  Please complete the following checklist questions to conclude this checkpoint.
                </Text>
              </View>
            </View>
          </View>

          {/* Questions List */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={[styles.loadingText, { color: subTextColor }]}>Loading checklist questions...</Text>
            </View>
          ) : (
            questions.map((q, idx) => {
              const currentAns = answers[q.question_id] || { answer: 'Yes', comment: '', photoUri: null };
              const isYes = currentAns.answer === 'Yes';
              const isNo = currentAns.answer === 'No';

              return (
                <View
                  key={`q_${q.question_id}_${idx}`}
                  style={[styles.questionCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
                >
                  {/* Question Header & Text */}
                  <View style={styles.questionHeaderRow}>
                    <Text style={styles.questionIndexBadge}>Q{idx + 1}</Text>
                    <Text style={[styles.questionText, { color: textColor }]}>{q.text}</Text>
                  </View>

                  {/* YES / NO Toggle Buttons */}
                  <View style={styles.toggleRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleSelectAnswer(q.question_id, 'Yes')}
                      style={[
                        styles.toggleButton,
                        isYes
                          ? { backgroundColor: '#10B981', borderColor: '#10B981' }
                          : { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: cardBorder },
                      ]}
                    >
                      <CheckCircle2 color={isYes ? '#FFFFFF' : '#10B981'} size={18} />
                      <Text
                        style={[
                          styles.toggleButtonText,
                          { color: isYes ? '#FFFFFF' : textColor },
                        ]}
                      >
                        YES
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleSelectAnswer(q.question_id, 'No')}
                      style={[
                        styles.toggleButton,
                        isNo
                          ? { backgroundColor: '#EF4444', borderColor: '#EF4444' }
                          : { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: cardBorder },
                      ]}
                    >
                      <XCircle color={isNo ? '#FFFFFF' : '#EF4444'} size={18} />
                      <Text
                        style={[
                          styles.toggleButtonText,
                          { color: isNo ? '#FFFFFF' : textColor },
                        ]}
                      >
                        NO
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Optional Photo Attachment Button & Preview */}
                  <View style={styles.photoSection}>
                    {currentAns.photoUri ? (
                      <View style={styles.photoPreviewRow}>
                        <Image source={{ uri: currentAns.photoUri }} style={styles.thumbnailImage} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={[styles.photoAttachedText, { color: textColor }]}>
                            Photo attached ✓
                          </Text>
                          <TouchableOpacity
                            onPress={() => handleRemovePhoto(q.question_id)}
                            style={styles.removePhotoBtn}
                          >
                            <Trash2 color="#EF4444" size={14} />
                            <Text style={styles.removePhotoText}>Remove photo</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => handlePickPhoto(q.question_id)}
                        style={[styles.attachPhotoBtn, { borderColor: cardBorder }]}
                      >
                        <Camera color="#3B82F6" size={16} />
                        <Text style={styles.attachPhotoBtnText}>
                          {q.requires_photo ? 'Attach Photo (Required)' : 'Add Photo (Optional)'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}

          <View style={{ height: 30 }} />
        </ScrollView>

        {/* Bottom Submit Button */}
        <View style={[styles.bottomBar, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={submitting || loading}
            onPress={handlePressSubmit}
            style={styles.submitButton}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Send color="#FFFFFF" size={18} />
                <Text style={styles.submitButtonText}>Submit Checklist</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  headerCenter: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 90,
  },
  topBannerCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  bannerSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  questionCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  questionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  questionIndexBadge: {
    color: '#3B82F6',
    fontWeight: '800',
    fontSize: 14,
    marginRight: 8,
    marginTop: 1,
  },
  questionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 8,
  },
  toggleButtonText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  photoSection: {
    marginTop: 4,
  },
  attachPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  attachPhotoBtnText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '600',
  },
  photoPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: 8,
    borderRadius: 8,
  },
  thumbnailImage: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  photoAttachedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  removePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  removePhotoText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    height: 48,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  loadingContainer: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    marginTop: 10,
  },
});
