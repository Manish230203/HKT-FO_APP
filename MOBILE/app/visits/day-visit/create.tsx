import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Sun, Plus, Trash2, CheckCircle2 } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { getSites, Site } from '../../../services/siteService';
import { submitDayVisitReport } from '../../../services/visitService';
import { THEME } from '../../../constants/theme';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { StepIndicator } from '../../../components/ui/StepIndicator';
import { CustomAlertModal } from '../../../components/ui/CustomAlertModal';

const STEPS = ['General Info', 'Guards', 'Checklist', 'Feedback', 'Suggestions', 'Review'];

const PRE_DEFINED_QUESTIONS = [
  'Security manpower available as per deployment',
  'Guards in proper uniform, ID card & grooming',
  'Attendance & biometric verified',
  'All security posts properly manned',
  'Gate frisking carried out as per SOP',
  'CCTV cameras functioning properly',
  'Fire extinguishers available and valid',
  'Daily occurrence book updated',
];

export default function CreateDayVisitReportScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string; siteId?: string; plannedId?: string }>();

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [clientId, setClientId] = useState(params.clientId || '1');
  const [siteId, setSiteId] = useState(params.siteId || '1');
  const [siteName, setSiteName] = useState('');
  const [shift, setShift] = useState('Morning');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);

  // Guards List
  const [guards, setGuards] = useState<Array<{ name: string; empCode: string; dutyType: string; rating: string }>>([
    { name: 'Ramesh Kumar', empCode: 'G001', dutyType: 'Main Gate', rating: 'Satisfactory' },
  ]);
  const [newGuardName, setNewGuardName] = useState('');
  const [newGuardCode, setNewGuardCode] = useState('');

  // Checklist
  const [checklist, setChecklist] = useState<Record<string, 'Satisfactory' | 'Unsatisfactory' | 'NA'>>(() => {
    const init: Record<string, 'Satisfactory' | 'Unsatisfactory' | 'NA'> = {};
    PRE_DEFINED_QUESTIONS.forEach((q) => (init[q] = 'Satisfactory'));
    return init;
  });

  // Observations
  const [overallRemarks, setOverallRemarks] = useState('');
  const [keyImprovements, setKeyImprovements] = useState('');

  // Customer Feedback
  const [clientRepName, setClientRepName] = useState('');
  const [clientRepDesignation, setClientRepDesignation] = useState('');
  const [clientFeedback, setClientFeedback] = useState('Good');

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
    setGuards([...guards, { name: newGuardName, empCode: newGuardCode || 'G999', dutyType: 'General Post', rating: 'Satisfactory' }]);
    setNewGuardName('');
    setNewGuardCode('');
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
        client_rep_name: clientRepName,
        client_rep_designation: clientRepDesignation,
        client_feedback: clientFeedback,
        overall_remarks: overallRemarks,
        key_improvements: keyImprovements,
        status: 'Completed',
      };

      await submitDayVisitReport(payload);
      setAlertInfo({
        visible: true,
        title: 'Day Visit Submitted',
        message: 'Day Visit Report has been successfully submitted.',
        type: 'success',
      });
    } catch (e: any) {
      console.error('Day visit submit failed', e);
      setAlertInfo({
        visible: true,
        title: 'Submission Error',
        message: e.response?.data?.detail || 'Failed to submit Day Visit Report.',
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
            <Text style={styles.stepTitle}>General Information</Text>
            <Input label="Client ID" value={clientId} onChangeText={setClientId} />
            <Input label="Site ID" value={siteId} onChangeText={setSiteId} />
            <Input label="Site Name" value={siteName} onChangeText={setSiteName} placeholder="e.g. Eagle HQ" />
            <Input label="Shift" value={shift} onChangeText={setShift} />
            <Input label="Visit Date" value={visitDate} onChangeText={setVisitDate} />
            <Input label="Submitting Officer" value={user?.name || 'Field Officer'} editable={false} />
          </Card>
        )}

        {/* STEP 1: Guards Inspection */}
        {currentStep === 1 && (
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>Guards Inspection</Text>
            {guards.map((g, idx) => (
              <View key={idx} style={styles.guardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guardName}>{g.name} ({g.empCode})</Text>
                  <Text style={styles.guardMeta}>Duty: {g.dutyType} | Rating: {g.rating}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveGuard(idx)}>
                  <Trash2 color={THEME.danger} size={18} />
                </TouchableOpacity>
              </View>
            ))}

            <Text style={[styles.stepTitle, { marginTop: 16 }]}>Add Guard</Text>
            <Input label="Guard Name" value={newGuardName} onChangeText={setNewGuardName} />
            <Input label="Guard Code" value={newGuardCode} onChangeText={setNewGuardCode} />
            <Button title="Add Guard" variant="outline" onPress={handleAddGuard} icon={<Plus color={THEME.primary} size={18} />} />
          </Card>
        )}

        {/* STEP 2: Checklist */}
        {currentStep === 2 && (
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>Checklist & Observations</Text>
            {PRE_DEFINED_QUESTIONS.map((q) => {
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

        {/* STEP 3: Customer Feedback */}
        {currentStep === 3 && (
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>Customer Feedback</Text>
            <Input label="Client Representative Name" value={clientRepName} onChangeText={setClientRepName} placeholder="e.g. John Doe" />
            <Input label="Designation" value={clientRepDesignation} onChangeText={setClientRepDesignation} placeholder="e.g. Security Manager" />
            <Input label="Feedback Rating" value={clientFeedback} onChangeText={setClientFeedback} placeholder="e.g. Good / Excellent" />
          </Card>
        )}

        {/* STEP 4: Suggestions */}
        {currentStep === 4 && (
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>Suggestions & Overall Remarks</Text>
            <Input label="Overall Remarks" value={overallRemarks} onChangeText={setOverallRemarks} multiline numberOfLines={3} style={{ height: 80 }} />
            <Input label="Key Improvements Needed" value={keyImprovements} onChangeText={setKeyImprovements} multiline numberOfLines={3} style={{ height: 80 }} />
          </Card>
        )}

        {/* STEP 5: Review & Submit */}
        {currentStep === 5 && (
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>Review & Submit Report</Text>
            <Text style={styles.reviewLabel}>Site: <Text style={styles.reviewVal}>{siteName || siteId}</Text></Text>
            <Text style={styles.reviewLabel}>Officer: <Text style={styles.reviewVal}>{user?.name}</Text></Text>
            <Text style={styles.reviewLabel}>Date: <Text style={styles.reviewVal}>{visitDate}</Text></Text>
            <Text style={styles.reviewLabel}>Guards Inspected: <Text style={styles.reviewVal}>{guards.length}</Text></Text>
            <Text style={styles.reviewLabel}>Overall Remarks: <Text style={styles.reviewVal}>{overallRemarks || 'Satisfactory'}</Text></Text>
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
