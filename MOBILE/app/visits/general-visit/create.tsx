import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BookOpen, Send } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { getSites } from '../../../services/siteService';
import { submitGeneralVisit } from '../../../services/visitService';
import { THEME } from '../../../constants/theme';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { CustomAlertModal } from '../../../components/ui/CustomAlertModal';

export default function CreateGeneralVisitScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string; siteId?: string; plannedId?: string }>();

  const [clientId, setClientId] = useState(params.clientId || '1');
  const [siteId, setSiteId] = useState(params.siteId || '1');
  const [siteName, setSiteName] = useState('');
  const [personVisited, setPersonVisited] = useState('');
  const [reasonOfVisit, setReasonOfVisit] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('10:00 AM');
  const [endTime, setEndTime] = useState('11:30 AM');
  const [remark, setRemark] = useState('');

  const [submitting, setSubmitting] = useState(false);
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

  const handleSubmit = async () => {
    if (!personVisited || !reasonOfVisit) {
      setAlertInfo({
        visible: true,
        title: 'Missing Required Fields',
        message: 'Please fill in Person Visited and Reason for Visit.',
        type: 'error',
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        client_id: parseInt(clientId, 10) || 1,
        site_id: parseInt(siteId, 10) || 1,
        person_visited: personVisited,
        reason_of_visit: reasonOfVisit,
        visit_date: visitDate,
        start_time: startTime,
        end_time: endTime,
        remark: remark,
        officer: user?.name || 'Field Officer',
        visit_type: 'Scheduled',
      };

      await submitGeneralVisit(payload);
      setAlertInfo({
        visible: true,
        title: 'General Visit Submitted',
        message: 'General Audit Visit Report has been successfully submitted.',
        type: 'success',
      });
    } catch (e: any) {
      console.error('General visit submit failed', e);
      setAlertInfo({
        visible: true,
        title: 'Submission Error',
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

        <Input label="Client ID" value={clientId} onChangeText={setClientId} />
        <Input label="Site ID" value={siteId} onChangeText={setSiteId} />
        <Input label="Site Name" value={siteName} onChangeText={setSiteName} placeholder="e.g. Unique Delta Branch" />
        
        <Input label="Person Visited (Name / Role)" value={personVisited} onChangeText={setPersonVisited} placeholder="e.g. Mr. Rajesh Sharma (Facility Manager)" />
        <Input label="Reason for Visit" value={reasonOfVisit} onChangeText={setReasonOfVisit} placeholder="e.g. Surprise Security Audit & Client Meeting" />
        
        <Input label="Visit Date (YYYY-MM-DD)" value={visitDate} onChangeText={setVisitDate} />
        <Input label="Start Time" value={startTime} onChangeText={setStartTime} />
        <Input label="End Time" value={endTime} onChangeText={setEndTime} />
        
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
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
