import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, FlatList } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BookOpen, Send, ChevronDown, Building, X, Clock } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { getSites, getClients, Site, Client } from '../../../services/siteService';
import { submitGeneralVisit } from '../../../services/visitService';
import { THEME } from '../../../constants/theme';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { CustomAlertModal } from '../../../components/ui/CustomAlertModal';
import { TimePicker24Modal } from '../../../components/ui/TimePicker24Modal';

export default function CreateGeneralVisitScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string; siteId?: string; plannedId?: string }>();

  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [clientId, setClientId] = useState(params.clientId || '');
  const [clientName, setClientName] = useState('');
  const [siteId, setSiteId] = useState(params.siteId || '');
  const [siteName, setSiteName] = useState('');

  // Modal selector states
  const [clientModalVisible, setClientModalVisible] = useState(false);
  const [siteModalVisible, setSiteModalVisible] = useState(false);

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
    value: '10:00',
  });

  const [personVisited, setPersonVisited] = useState('');
  const [reasonOfVisit, setReasonOfVisit] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:30');
  const [remark, setRemark] = useState('');

  const [submitting, setSubmitting] = useState(false);
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
      const [clientData, siteData] = await Promise.all([getClients(), getSites()]);
      setClients(clientData || []);
      setSites(siteData || []);

      if (params.siteId && siteData) {
        const foundSite = siteData.find((s) => String(s.id) === String(params.siteId));
        if (foundSite) {
          setSiteId(String(foundSite.id));
          setSiteName(foundSite.name);
          const cId = foundSite.client_id || params.clientId;
          if (cId) {
            setClientId(String(cId));
            const foundClient = (clientData || []).find((c) => String(c.id) === String(cId));
            setClientName(foundClient?.name || foundSite.client_name || '');
          }
        }
      } else if (params.clientId && clientData) {
        const foundClient = (clientData || []).find((c) => String(c.id) === String(params.clientId));
        if (foundClient) {
          setClientId(String(foundClient.id));
          setClientName(foundClient.name);
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
    const matchesClient = !clientId ? true : String(s.client_id) === String(clientId);
    const matchesSearch = s.name.toLowerCase().includes(siteSearchQuery.toLowerCase()) ||
                          (s.client_name && s.client_name.toLowerCase().includes(siteSearchQuery.toLowerCase()));
    return matchesClient && matchesSearch;
  });

  const handleSubmit = async () => {
    if (!personVisited || !reasonOfVisit) {
      setAlertInfo({
        visible: true,
        title: t('missing_fields'),
        message: t('fill_person_and_reason'),
        type: 'error',
      });
      return;
    }

    setSubmitting(true);
    try {
      const selClient = clients.find((c) => String(c.id) === String(clientId));
      const selSite = sites.find((s) => String(s.id) === String(siteId));
      const cName = clientName || selClient?.name || selSite?.client_name || 'ADIENT INDIA PVT LTD';
      const sName = siteName || selSite?.name || 'ADIENT - PIMPRI';
      const rId = `GVR-${Date.now()}`;

      const payload = {
        report_id: rId,
        reportId: rId,
        client_id: parseInt(clientId, 10) || selSite?.client_id || 27,
        clientId: parseInt(clientId, 10) || selSite?.client_id || 27,
        client_name: cName,
        clientName: cName,
        site_id: parseInt(siteId, 10) || 187,
        siteId: parseInt(siteId, 10) || 187,
        site_name: sName,
        siteName: sName,
        person_visited: personVisited,
        personVisited: personVisited,
        reason_of_visit: reasonOfVisit,
        reasonOfVisit: reasonOfVisit,
        visit_date: visitDate,
        visitDate: visitDate,
        start_time: startTime,
        startTime: startTime,
        end_time: endTime,
        endTime: endTime,
        remark: remark,
        officer: user?.name || 'Amit Kulkarni',
        employee_oid: user?.id || user?.employee_id || 7558,
        visit_type: 'General Audit',
      };

      await submitGeneralVisit(payload);
      setAlertInfo({
        visible: true,
        title: t('general_visit_submitted'),
        message: t('general_visit_success_desc'),
        type: 'success',
      });
    } catch (e: any) {
      console.error('General visit submit failed', e);
      setAlertInfo({
        visible: true,
        title: t('missing_fields'),
        message: e.response?.data?.detail || 'Failed to submit General Visit Report.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.formCard}>
        <View style={styles.headerRow}>
          <BookOpen color={THEME.secondary} size={24} />
          <Text style={styles.headerTitle}>General Visit Audit Form</Text>
        </View>

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
        
        <Input label="Person Visited (Name / Role)" value={personVisited} onChangeText={setPersonVisited} placeholder="e.g. Mr. Rajesh Sharma (Facility Manager)" />
        <Input label="Reason for Visit" value={reasonOfVisit} onChangeText={setReasonOfVisit} placeholder="e.g. Surprise Security Audit & Client Meeting" />
        
        <Input label="Visit Date (YYYY-MM-DD)" value={visitDate} onChangeText={setVisitDate} />
        
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
        
        <Input
          label="Remarks / Observations"
          value={remark}
          onChangeText={setRemark}
          multiline
          numberOfLines={4}
          style={{ height: 90 }}
          placeholder="Enter audit observations, remarks..."
        />

        <Button
          title={t('submit')}
          variant="primary"
          onPress={handleSubmit}
          loading={submitting}
          style={styles.submitBtn}
          icon={<Send color="#FFFFFF" size={18} />}
        />
      </Card>

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
              data={filteredClients}
              keyExtractor={(item) => String(item.id)}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#94A3B8', fontSize: 13 }}>No clients found.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setClientId(String(item.id));
                    setClientName(item.name);
                    setSiteId('');
                    setSiteName('');
                    setClientModalVisible(false);
                  }}
                >
                  <Building color="#3B82F6" size={18} style={{ marginRight: 10 }} />
                  <Text style={styles.modalItemText}>{item.name}</Text>
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
    </ScrollView>
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
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  formCard: {
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: THEME.typography.md,
    fontWeight: '700',
    color: THEME.text,
  },
  submitBtn: {
    marginTop: 16,
  },
});
