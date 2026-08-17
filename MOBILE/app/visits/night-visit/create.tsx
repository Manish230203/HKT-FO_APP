import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Moon, Plus, Trash2 } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { getSites } from '../../../services/siteService';
import { submitNightVisitReport } from '../../../services/visitService';
import { THEME } from '../../../constants/theme';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { StepIndicator } from '../../../components/ui/StepIndicator';
import { CustomAlertModal } from '../../../components/ui/CustomAlertModal';

const STEPS = ['General Info', 'Guards', 'Night Checklist', 'Briefing', 'Suggestions', 'Review'];

const NIGHT_QUESTIONS = [
  'Night shift guards alert and awake on post',
  'All perimeter boundary lights functioning properly',
  'Main gates and emergency exits locked & secured',
  'Patrol tour log & occurrence book verified',
  'CCTV night mode functioning properly',
  'Fire alarm control panel healthy',
];

export default function CreateNightVisitReportScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string; siteId?: string; plannedId?: string }>();

  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [clientId, setClientId] = useState(params.clientId || '1');
  const [siteId, setSiteId] = useState(params.siteId || '1');
  const [siteName, setSiteName] = useState('');
  const [shift, setShift] = useState('Night');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);

  // Guards List
  const [guards, setGuards] = useState<Array<{ name: string; empCode: string; status: string }>>([
    { name: 'Suresh Patil', empCode: 'G005', status: 'Alert & Awake' },
  ]);
  const [newGuardName, setNewGuardName] = useState('');

  // Checklist
  const [checklist, setChecklist] = useState<Record<string, 'Satisfactory' | 'Unsatisfactory'>>(() => {
    const init: Record<string, 'Satisfactory' | 'Unsatisfactory'> = {};
    NIGHT_QUESTIONS.forEach((q) => (init[q] = 'Satisfactory'));
    return init;
  });

  // Briefing & Checking
  const [lectureDetails, setLectureDetails] = useState('');
  const [randomChecking, setRandomChecking] = useState('');
  const [overallRemarks, setOverallRemarks] = useState('');

  // Modal alert
  const [alertInfo, setAlertInfo] = useState<{ visible: boolean; title: string; message: string; type: 'success' | 'error' }>({
    visible: false,
    title: '',
    message: '',
    type: 'success',
  });

  useEffect(() => {
    loadSitesData();
  }, []);

  const loadSitesData = async () => {
    try {
      const data = await getSites();
      if (data && data.length > 0) {
        const found = data.find((s) => String(s.id) === String(params.siteId));
        if (found) {
          setSiteName(found.name);
          setClientId(String(found.client_id || params.clientId || 1));
        }
      }
    } catch (e) {
      console.error('Error loading site info', e);
    }
  };

  const handleAddGuard = () => {
    if (!newGuardName) return;
    setGuards([...guards, { name: newGuardName, empCode: 'G' + Math.floor(100 + Math.random() * 900), status: 'Alert & Awake' }]);
    setNewGuardName('');
  };

  const handleRemoveGuard = (idx: number) => {
    setGuards(guards.filter((_, i) => i !== idx));
  };

  const toggleChecklistQuestion = (question: string) => {
    setChecklist((prev) => ({
      ...prev,
      [question]: prev[question] === 'Satisfactory' ? 'Unsatisfactory' : 'Satisfactory',
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        client_id: parseInt(clientId, 10) || 1,
        site_id: parseInt(siteId, 10) || 1,
        site_name: siteName || 'Selected Site',
        visit_date: visitDate,
        visit_type: 'Scheduled',
        shift: shift,
        officer: user?.name || 'Field Officer',
        guards: guards,
        checklist: Object.entries(checklist).map(([q, val]) => ({ question: q, status: val })),
        lecture_details: lectureDetails,
        random_checking: randomChecking,
        overall_remarks: overallRemarks,
        status: 'Completed',
      };

      await submitNightVisitReport(payload);
      setAlertInfo({
        visible: true,
        title: 'Night Round Submitted',
        message: 'Night Visit Report has been successfully submitted.',
        type: 'success',
      });
    } catch (e: any) {
      console.error('Night visit submit failed', e);
      setAlertInfo({
        visible: true,
        title: 'Submission Error',
        message: e.response?.data?.detail || 'Failed to submit Night Visit Report.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StepIndicator steps={STEPS} currentStep={currentStep} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* STEP 0: General Info */}
        {currentStep === 0 && (
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>Night Round Information</Text>
            <Input label="Client ID" value={clientId} onChangeText={setClientId} />
            <Input label="Site ID" value={siteId} onChangeText={setSiteId} />
            <Input label="Site Name" value={siteName} onChangeText={setSiteName} placeholder="e.g. Eagle Factory Site" />
            <Input label="Shift" value={shift} onChangeText={setShift} />
            <Input label="Visit Date" value={visitDate} onChangeText={setVisitDate} />
          </Card>
        )}

        {/* STEP 1: Guards Inspection */}
        {currentStep === 1 && (
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>Night Duty Guards Check</Text>
            {guards.map((g, idx) => (
              <View key={idx} style={styles.guardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guardName}>{g.name} ({g.empCode})</Text>
                  <Text style={styles.guardMeta}>Status: {g.status}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveGuard(idx)}>
                  <Trash2 color={THEME.danger} size={18} />
                </TouchableOpacity>
              </View>
            ))}

            <Text style={[styles.stepTitle, { marginTop: 16 }]}>Add On-Duty Guard</Text>
            <Input label="Guard Name" value={newGuardName} onChangeText={setNewGuardName} />
            <Button title="Add Guard" variant="outline" onPress={handleAddGuard} icon={<Plus color={THEME.primary} size={18} />} />
          </Card>
        )}

        {/* STEP 2: Night Checklist */}
        {currentStep === 2 && (
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>Night Patrol Checklist</Text>
            {NIGHT_QUESTIONS.map((q) => {
              const status = checklist[q];
              const isSat = status === 'Satisfactory';
              return (
                <TouchableOpacity key={q} activeOpacity={0.8} onPress={() => toggleChecklistQuestion(q)} style={styles.checkRow}>
                  <Text style={styles.checkQuestion}>{q}</Text>
                  <Badge label={status} variant={isSat ? 'success' : 'danger'} />
                </TouchableOpacity>
              );
            })}
          </Card>
        )}

        {/* STEP 3: Briefing */}
        {currentStep === 3 && (
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>Briefing & Random Checking</Text>
            <Input label="Security Briefing / Lecture Details" value={lectureDetails} onChangeText={setLectureDetails} multiline numberOfLines={3} style={{ height: 80 }} placeholder="Briefing conducted on alert night duty..." />
            <Input label="Random Material / Vehicle Checking Details" value={randomChecking} onChangeText={setRandomChecking} multiline numberOfLines={3} style={{ height: 80 }} placeholder="Random checking of vehicle gate logs..." />
          </Card>
        )}

        {/* STEP 4: Suggestions */}
        {currentStep === 4 && (
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>Overall Night Round Remarks</Text>
            <Input label="Overall Remarks" value={overallRemarks} onChangeText={setOverallRemarks} multiline numberOfLines={4} style={{ height: 100 }} placeholder="All posts found alert during night round." />
          </Card>
        )}

        {/* STEP 5: Review & Submit */}
        {currentStep === 5 && (
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>Review Night Visit Report</Text>
            <Text style={styles.reviewLabel}>Site: <Text style={styles.reviewVal}>{siteName || siteId}</Text></Text>
            <Text style={styles.reviewLabel}>Officer: <Text style={styles.reviewVal}>{user?.name}</Text></Text>
            <Text style={styles.reviewLabel}>Shift: <Text style={styles.reviewVal}>{shift}</Text></Text>
            <Text style={styles.reviewLabel}>Guards Checked: <Text style={styles.reviewVal}>{guards.length}</Text></Text>
            <Text style={styles.reviewLabel}>Briefing Provided: <Text style={styles.reviewVal}>{lectureDetails ? 'Yes' : 'No'}</Text></Text>
          </Card>
        )}
      </ScrollView>

      {/* Footer Navigation Controls */}
      <View style={styles.footerRow}>
        {currentStep > 0 ? (
          <Button title={t('previous')} variant="ghost" onPress={() => setCurrentStep((s) => s - 1)} style={styles.flexBtn} />
        ) : null}

        {currentStep < STEPS.length - 1 ? (
          <Button title={t('next')} variant="primary" onPress={() => setCurrentStep((s) => s + 1)} style={styles.flexBtn} />
        ) : (
          <Button title={t('submit')} variant="secondary" onPress={handleSubmit} loading={submitting} style={styles.flexBtn} />
        )}
      </View>

      <CustomAlertModal
        visible={alertInfo.visible}
        title={alertInfo.title}
        message={alertInfo.message}
        type={alertInfo.type}
        onClose={() => {
          setAlertInfo({ ...alertInfo, visible: false });
          if (alertInfo.type === 'success') router.replace('/(tabs)/dashboard');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  stepCard: {
    padding: 16,
  },
  stepTitle: {
    fontSize: THEME.typography.md,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 12,
  },
  guardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 10,
    marginVertical: 4,
  },
  guardName: {
    fontSize: THEME.typography.sm,
    fontWeight: '600',
    color: THEME.text,
  },
  guardMeta: {
    fontSize: THEME.typography.xs,
    color: THEME.textVariant,
    marginTop: 2,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  checkQuestion: {
    fontSize: THEME.typography.xs,
    color: THEME.text,
    flex: 1,
    marginRight: 10,
  },
  reviewLabel: {
    fontSize: THEME.typography.sm,
    color: THEME.textVariant,
    marginVertical: 4,
  },
  reviewVal: {
    fontWeight: '700',
    color: THEME.text,
  },
  footerRow: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: THEME.card,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    gap: 12,
  },
  flexBtn: {
    flex: 1,
  },
});
