import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, Modal, FlatList } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Sun, Plus, Trash2, CheckCircle2, ChevronDown, Building, X, Clock } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { getSites, getClients, Site, Client } from '../../../services/siteService';
import { submitDayVisitReport, getDayVisitTemplates } from '../../../services/visitService';
import { THEME } from '../../../constants/theme';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { StepIndicator } from '../../../components/ui/StepIndicator';
import { CustomAlertModal } from '../../../components/ui/CustomAlertModal';
import { TimePicker24Modal } from '../../../components/ui/TimePicker24Modal';

const STEPS = ['General Info', 'Guards', 'Checklist', 'Feedback', 'Suggestions', 'Review'];

export default function CreateDayVisitReportScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string; siteId?: string; plannedId?: string }>();

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [clientId, setClientId] = useState(params.clientId || '');
  const [clientName, setClientName] = useState('');
  const [siteId, setSiteId] = useState(params.siteId || '');
  const [siteName, setSiteName] = useState('');
  const [shift, setShift] = useState('Morning');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');

  // Dynamic Template Questions from DB (FIELD_OFFICER_DAY_VISIT_TEMPLATES)
  const [templateQuestions, setTemplateQuestions] = useState<Array<{ id: string; section?: string; question: string }>>([]);

  // Time Picker 24h State
  const [timePickerConfig, setTimePickerConfig] = useState<{
    visible: boolean;
    mode: 'start' | 'end';
    title: string;
    value: string;
  }>({
    visible: false,
    mode: 'start',
    title: '',
    value: '09:00',
  });

  // Modal selector states
  const [clientModalVisible, setClientModalVisible] = useState(false);
  const [siteModalVisible, setSiteModalVisible] = useState(false);

  // Guards List
  const [guards, setGuards] = useState<Array<{ name: string; empCode: string; dutyType: string; rating: string }>>([
    { name: 'Ramesh Kumar', empCode: 'G001', dutyType: 'Main Gate', rating: 'Satisfactory' },
  ]);
  const [newGuardName, setNewGuardName] = useState('');
  const [newGuardCode, setNewGuardCode] = useState('');

  // Checklist
  const [checklist, setChecklist] = useState<Record<string, 'Satisfactory' | 'Unsatisfactory' | 'NA'>>({});

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
    loadClientsAndSites();
  }, []);

  const loadClientsAndSites = async () => {
    try {
      const empOidVal = user?.id || user?.empOid || user?.employee_id || 7558;
      const [clientData, siteData, templates] = await Promise.all([
        getClients(),
        getSites(),
        getDayVisitTemplates(),
      ]);
      setClients(clientData || []);
      setSites(siteData || []);

      // Load DB template questions from FIELD_OFFICER_DAY_VISIT_TEMPLATES
      if (templates && templates.length > 0) {
        const qList = templates[0].questions || [];
        if (qList.length > 0) {
          setTemplateQuestions(qList);
          const initChecklist: Record<string, 'Satisfactory' | 'Unsatisfactory' | 'NA'> = {};
          qList.forEach((qItem: any) => {
            const text = qItem.question || String(qItem);
            initChecklist[text] = 'Satisfactory';
          });
          setChecklist(initChecklist);
        }
      }

      if (params.siteId && siteData) {
        const foundSite = siteData.find((s) => String(s.id) === String(params.siteId));
        if (foundSite) {
          setSiteId(String(foundSite.id));
          setSiteName(foundSite.name);
          if (foundSite.client_id) {
            setClientId(String(foundSite.client_id));
            setClientName(foundSite.client_name || '');
          }
        }
      }
    } catch (e) {
      console.error('Error loading client & site info', e);
    }
  };

  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [siteSearchQuery, setSiteSearchQuery] = useState('');

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(clientSearchQuery.toLowerCase())
  );

  const filteredSites = sites.filter((s) => {
    const matchesClient = (!clientId || clientId === 'ALL') ? true : String(s.client_id) === String(clientId);
    const matchesSearch = s.name.toLowerCase().includes(siteSearchQuery.toLowerCase()) ||
                          (s.client_name && s.client_name.toLowerCase().includes(siteSearchQuery.toLowerCase()));
    return matchesClient && matchesSearch;
  });

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
        title: t('day_visit_submitted'),
        message: t('day_visit_success_desc'),
        type: 'success',
      });
    } catch (e: any) {
      console.error('Day visit submit failed', e);
      setAlertInfo({
        visible: true,
        title: t('missing_fields'),
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

            {/* Client Selector Dropdown */}
            <Text style={styles.fieldLabel}>SELECT CLIENT</Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setClientModalVisible(true)}
              style={styles.pickerButton}
            >
              <Text style={styles.pickerButtonText}>
                {clientName || clients.find((c) => String(c.id) === String(clientId))?.name || 'Select Client...'}
              </Text>
              <ChevronDown color={THEME.textVariant} size={20} />
            </TouchableOpacity>

            {/* Site Selector Dropdown */}
            <Text style={styles.fieldLabel}>SELECT SITE</Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSiteModalVisible(true)}
              style={styles.pickerButton}
            >
              <Text style={styles.pickerButtonText}>
                {siteName || sites.find((s) => String(s.id) === String(siteId))?.name || 'Select Site...'}
              </Text>
              <ChevronDown color={THEME.textVariant} size={20} />
            </TouchableOpacity>

            <Input label="Shift" value={shift} onChangeText={setShift} />
            <Input label="Visit Date" value={visitDate} onChangeText={setVisitDate} />
            
            {/* Start Time 24h Selector */}
            <Text style={styles.fieldLabel}>START TIME (24-HR CLOCK)</Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setTimePickerConfig({ visible: true, mode: 'start', title: 'Select Start Time (24-Hour Clock)', value: startTime })}
              style={styles.pickerButton}
            >
              <Text style={styles.pickerButtonText}>{startTime} (HH:mm)</Text>
              <Clock color={THEME.primary} size={20} />
            </TouchableOpacity>

            {/* End Time 24h Selector */}
            <Text style={styles.fieldLabel}>END TIME (24-HR CLOCK)</Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setTimePickerConfig({ visible: true, mode: 'end', title: 'Select End Time (24-Hour Clock)', value: endTime })}
              style={styles.pickerButton}
            >
              <Text style={styles.pickerButtonText}>{endTime} (HH:mm)</Text>
              <Clock color={THEME.primary} size={20} />
            </TouchableOpacity>

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
            <Text style={styles.stepTitle}>Officer Day Visit Checklist ({templateQuestions.length} Items)</Text>
            {templateQuestions.map((item, idx) => {
              const qText = item.question || String(item);
              const status = checklist[qText] || 'Satisfactory';
              const isSat = status === 'Satisfactory';
              return (
                <TouchableOpacity
                  key={item.id || idx}
                  activeOpacity={0.8}
                  onPress={() =>
                    setChecklist((prev) => ({
                      ...prev,
                      [qText]: prev[qText] === 'Satisfactory' ? 'Unsatisfactory' : 'Satisfactory',
                    }))
                  }
                  style={styles.checkRow}
                >
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    {item.section ? (
                      <Text style={{ fontSize: 10, fontWeight: '700', color: THEME.primary, marginBottom: 2 }}>
                        {item.section.toUpperCase()}
                      </Text>
                    ) : null}
                    <Text style={styles.checkQuestion}>{qText}</Text>
                  </View>
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

      {/* Client Selection Modal */}
      <Modal visible={clientModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Client</Text>
              <TouchableOpacity onPress={() => setClientModalVisible(false)}>
                <X color="#94A3B8" size={24} />
              </TouchableOpacity>
            </View>

            <Input
              placeholder="Search Client..."
              value={clientSearchQuery}
              onChangeText={setClientSearchQuery}
              style={{ marginTop: 12, marginBottom: 12 }}
            />

            <FlatList
              data={[{ id: 'ALL', name: 'All Clients (Show All Sites)' }, ...filteredClients]}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    if (item.id === 'ALL') {
                      setClientId('ALL');
                      setClientName('All Clients');
                    } else {
                      setClientId(String(item.id));
                      setClientName(item.name);
                    }
                    setSiteId('');
                    setSiteName('');
                    setClientModalVisible(false);
                  }}
                >
                  <Building color={item.id === 'ALL' ? '#10B981' : '#3B82F6'} size={18} style={{ marginRight: 10 }} />
                  <Text style={[styles.modalItemText, item.id === 'ALL' && { color: '#10B981', fontWeight: '700' }]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Site Selection Modal */}
      <Modal visible={siteModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Site</Text>
              <TouchableOpacity onPress={() => setSiteModalVisible(false)}>
                <X color="#94A3B8" size={24} />
              </TouchableOpacity>
            </View>

            <Input
              placeholder="Search Site by Name..."
              value={siteSearchQuery}
              onChangeText={setSiteSearchQuery}
              style={{ marginTop: 12, marginBottom: 12 }}
            />

            <FlatList
              data={filteredSites}
              keyExtractor={(item) => String(item.id)}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#94A3B8', fontSize: 13 }}>No sites found for this selection.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setSiteId(String(item.id));
                    setSiteName(item.name);
                    if (item.client_id) {
                      setClientId(String(item.client_id));
                      setClientName(item.client_name || '');
                    }
                    setSiteModalVisible(false);
                  }}
                >
                  <Building color="#10B981" size={18} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalItemText}>{item.name}</Text>
                    {item.client_name ? (
                      <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{item.client_name}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

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

      <TimePicker24Modal
        visible={timePickerConfig.visible}
        title={timePickerConfig.title}
        initialValue={timePickerConfig.value}
        onConfirm={(val) => {
          if (timePickerConfig.mode === 'start') setStartTime(val);
          else setEndTime(val);
        }}
        onClose={() => setTimePickerConfig((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 6,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  pickerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  modalItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F8FAFC',
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
