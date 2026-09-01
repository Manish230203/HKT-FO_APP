import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, FlatList, Image, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { BookOpen, Send, ChevronDown, Building, X, MapPin, Camera, Lock } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { getSites, getClients, Site, Client } from '../../../services/siteService';
import { submitGeneralVisit } from '../../../services/visitService';
import { markReportSubmittedForCheckIn } from '../../../services/db';
import { THEME } from '../../../constants/theme';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { CustomAlertModal } from '../../../components/ui/CustomAlertModal';

export default function CreateGeneralVisitScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string; siteId?: string; plannedId?: string; checkInTime?: string; checkOutTime?: string }>();

  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [clientId, setClientId] = useState(params.clientId || '');
  const [clientName, setClientName] = useState('');
  const [siteId, setSiteId] = useState(params.siteId || '');
  const [siteName, setSiteName] = useState('');

  // Modal selector states
  const [clientModalVisible, setClientModalVisible] = useState(false);
  const [siteModalVisible, setSiteModalVisible] = useState(false);

  const [personVisited, setPersonVisited] = useState('');
  const [reasonOfVisit, setReasonOfVisit] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(
    params.checkInTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  );
  const [endTime, setEndTime] = useState(
    params.checkOutTime || null
  );

  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alertInfo, setAlertInfo] = useState<{ visible: boolean; title: string; message: string; type: 'success' | 'error' }>({
    visible: false,
    title: '',
    message: '',
    type: 'success',
  });

  // GPS Location State
  const [gps, setGps] = useState('');
  const [fetchingGps, setFetchingGps] = useState(false);

  // Photo Capture State (General Attachments)
  const [generalPhotos, setGeneralPhotos] = useState<string[]>([]);

  const handleCaptureGeneralPhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Camera permission is required to take visit photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.5,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const photoUri = result.assets[0].uri;
        setGeneralPhotos((prev) => [...prev, photoUri]);
      }
    } catch (e) {
      console.warn('Error launching camera for general photo:', e);
    }
  };

  const handleRemoveGeneralPhoto = (index: number) => {
    setGeneralPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    loadClientsAndSites();
    fetchCurrentLocation();
  }, []);

  const fetchCurrentLocation = async (): Promise<string> => {
    setFetchingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let loc = null;
        try {
          loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        } catch {
          loc = await Location.getLastKnownPositionAsync();
        }
        if (loc && loc.coords) {
          const coordsStr = `${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`;
          setGps(coordsStr);
          return coordsStr;
        }
      }
    } catch (e) {
      console.warn('GPS location fetch error:', e);
    } finally {
      setFetchingGps(false);
    }
    return '';
  };

  const loadClientsAndSites = async () => {
    try {
      const clientData = await getClients();
      setClients(clientData);

      if (params.clientId) {
        const initialClient = clientData.find((c) => String(c.id) === String(params.clientId));
        if (initialClient) {
          setClientName(initialClient.name);
          const initialSites = await getSites(initialClient.id);
          setSites(initialSites);

          if (params.siteId) {
            const initialSite = initialSites.find((s) => String(s.id) === String(params.siteId));
            if (initialSite) {
              setSiteName(initialSite.name);
            }
          }
        }
      } else {
        const siteData = await getSites();
        setSites(siteData);
        if (params.siteId) {
          const initialSite = siteData.find((s) => String(s.id) === String(params.siteId));
          if (initialSite) {
            setSiteName(initialSite.name);
            if (initialSite.clientId) {
              setClientId(String(initialSite.clientId));
              const parentClient = clientData.find((c) => String(c.id) === String(initialSite.clientId));
              if (parentClient) setClientName(parentClient.name);
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to load clients and sites', e);
    }
  };

  const handleClientChange = async (selectedClientId: string, selectedClientName: string) => {
    setClientId(selectedClientId);
    setClientName(selectedClientName);
    setSiteId('');
    setSiteName('');
    try {
      const siteData = await getSites(Number(selectedClientId));
      setSites(siteData);
    } catch (e) {
      console.error('Failed to load sites for client', e);
    }
  };

  const handleSubmit = async () => {
    if (!clientId) {
      setAlertInfo({
        visible: true,
        title: t('missing_fields'),
        message: 'Please select a Client.',
        type: 'error',
      });
      return;
    }

    if (!siteId) {
      setAlertInfo({
        visible: true,
        title: t('missing_fields'),
        message: 'Please select a Site.',
        type: 'error',
      });
      return;
    }

    if (!personVisited.trim()) {
      setAlertInfo({
        visible: true,
        title: t('missing_fields'),
        message: 'Please enter the Person Visited (Name / Role).',
        type: 'error',
      });
      return;
    }

    if (!reasonOfVisit.trim()) {
      setAlertInfo({
        visible: true,
        title: t('missing_fields'),
        message: 'Please enter the Reason for Visit.',
        type: 'error',
      });
      return;
    }

    setSubmitting(true);
    try {
      let currentGps = gps;
      if (!currentGps) {
        currentGps = await fetchCurrentLocation();
      }

      const cName = clientName || clients.find((c) => String(c.id) === String(clientId))?.name || 'Selected Client';
      const sName = siteName || sites.find((s) => String(s.id) === String(siteId))?.name || 'Selected Site';

      const payload = {
        client_id: parseInt(clientId, 10) || 1,
        clientId: parseInt(clientId, 10) || 1,
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
        gps: currentGps,
        checklist: [],
        photos: generalPhotos,
        remark: remark,
        officer: user?.name || 'Amit Kulkarni',
        employee_oid: user?.id || user?.employee_id || 7558,
        visit_type: 'General Visit',
      };

      const res = await submitGeneralVisit(payload);

      if (params.plannedId || siteId) {
        await markReportSubmittedForCheckIn(params.plannedId, siteId, (res as any)?.report_id || (res as any)?.oid, 'General Visit');
      }

      setAlertInfo({
        visible: true,
        title: t('general_visit_submitted') || 'Report Submitted',
        message: 'General Visit Report submitted successfully! Please tap Check-Out on the visits screen when you leave site.',
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

  const handleAlertDismiss = () => {
    setAlertInfo((prev) => ({ ...prev, visible: false }));
    if (alertInfo.type === 'success') {
      router.replace('/visits');
    }
  };

  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [siteSearchQuery, setSiteSearchQuery] = useState('');

  const filteredClients = clients.filter((c) =>
    (c.name || '').toLowerCase().includes(clientSearchQuery.toLowerCase())
  );

  const filteredSites = sites.filter((s) =>
    (s.name || '').toLowerCase().includes(siteSearchQuery.toLowerCase())
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: THEME.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: 140 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        indicatorStyle="white"
      >
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <BookOpen color={THEME.secondary} size={24} />
          <Text style={styles.headerTitle}>General Visit Report</Text>
        </View>

        {/* Client Selector Dropdown */}
        <Text style={styles.fieldLabel}>CLIENT {Boolean(params.siteId || params.plannedId) ? '(LOCKED)' : ''}</Text>
        <TouchableOpacity
          activeOpacity={Boolean(params.siteId || params.plannedId) ? 1 : 0.8}
          disabled={Boolean(params.siteId || params.plannedId)}
          onPress={() => setClientModalVisible(true)}
          style={[styles.pickerButton, Boolean(params.siteId || params.plannedId) ? styles.pickerButtonLocked : null]}
        >
          <Text style={[styles.pickerButtonText, Boolean(params.siteId || params.plannedId) ? styles.pickerButtonTextLocked : null]}>
            {clientName || clients.find((c) => String(c.id) === String(clientId))?.name || 'Select Client...'}
          </Text>
          {Boolean(params.siteId || params.plannedId) ? (
            <Lock color="#64748B" size={16} />
          ) : (
            <ChevronDown color={THEME.textVariant} size={20} />
          )}
        </TouchableOpacity>

        {/* Site Selector Dropdown */}
        <Text style={styles.fieldLabel}>SITE {Boolean(params.siteId || params.plannedId) ? '(LOCKED)' : ''}</Text>
        <TouchableOpacity
          activeOpacity={Boolean(params.siteId || params.plannedId) ? 1 : 0.8}
          disabled={Boolean(params.siteId || params.plannedId)}
          onPress={() => setSiteModalVisible(true)}
          style={[styles.pickerButton, Boolean(params.siteId || params.plannedId) ? styles.pickerButtonLocked : null]}
        >
          <Text style={[styles.pickerButtonText, Boolean(params.siteId || params.plannedId) ? styles.pickerButtonTextLocked : null]}>
            {siteName || sites.find((s) => String(s.id) === String(siteId))?.name || 'Select Site...'}
          </Text>
          {Boolean(params.siteId || params.plannedId) ? (
            <Lock color="#64748B" size={16} />
          ) : (
            <ChevronDown color={THEME.textVariant} size={20} />
          )}
        </TouchableOpacity>
        
        <Input label="Person Visited (Name / Role)" value={personVisited} onChangeText={setPersonVisited} placeholder="e.g. Mr. Rajesh Sharma (Facility Manager)" />
        <Input label="Reason for Visit" value={reasonOfVisit} onChangeText={setReasonOfVisit} placeholder="e.g. Routine Inspection / Client Meeting" />
        
        <Input label="Visit Date (YYYY-MM-DD)" value={visitDate} onChangeText={setVisitDate} />

        {/* GPS Location Status Banner */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: 12, borderRadius: 10, marginTop: 8, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.25)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <MapPin color="#10B981" size={18} style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#6EE7B7' }}>GPS LOCATION</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF', marginTop: 2 }}>
                {fetchingGps ? 'Fetching GPS coordinates...' : gps || 'Acquiring GPS location...'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={fetchCurrentLocation}
            disabled={fetchingGps}
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#10B981' }}>
              {fetchingGps ? 'Locating...' : 'Refresh GPS'}
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* GENERAL VISIT PHOTO ATTACHMENTS */}
        <View style={{ marginBottom: 16 }}>
          <Text style={styles.fieldLabel}>GENERAL VISIT SITE PHOTOS / ATTACHMENTS ({generalPhotos.length})</Text>
          
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleCaptureGeneralPhoto}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              borderWidth: 1.5,
              borderColor: '#3B82F6',
              borderStyle: 'dashed',
              borderRadius: 10,
              paddingVertical: 14,
              marginBottom: 10,
            }}
          >
            <Camera color="#3B82F6" size={20} style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#60A5FA' }}>Capture Site Photo Attachment</Text>
          </TouchableOpacity>

          {generalPhotos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', gap: 8 }}>
              {generalPhotos.map((uri, idx) => (
                <View key={idx} style={{ position: 'relative', marginRight: 8 }}>
                  <Image source={{ uri }} style={{ width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: '#334155' }} />
                  <TouchableOpacity
                    onPress={() => handleRemoveGeneralPhoto(idx)}
                    style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#EF4444', borderRadius: 10, padding: 2 }}
                  >
                    <X size={12} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
        
        <Input
          label="Remarks / Observations"
          value={remark}
          onChangeText={setRemark}
          multiline
          numberOfLines={4}
          placeholder="Enter visit observations, remarks..."
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
              placeholder="Search Site..."
              value={siteSearchQuery}
              onChangeText={setSiteSearchQuery}
              style={{ marginTop: 12, marginBottom: 12 }}
            />

            <FlatList
              data={filteredSites}
              keyExtractor={(item) => String(item.id)}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#94A3B8', fontSize: 13 }}>No sites found for this client.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setSiteId(String(item.id));
                    setSiteName(item.name);
                    setSiteModalVisible(false);
                  }}
                >
                  <Building color="#10B981" size={18} style={{ marginRight: 10 }} />
                  <Text style={styles.modalItemText}>{item.name}</Text>
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
          onClose={handleAlertDismiss}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    padding: 20,
    borderRadius: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME.text,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.textVariant,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 16,
  },
  pickerButtonText: {
    color: THEME.text,
    fontSize: 14,
    flex: 1,
  },
  pickerButtonLocked: {
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderColor: '#334155',
  },
  pickerButtonTextLocked: {
    color: '#CBD5E1',
    fontWeight: '700',
  },
  submitBtn: {
    marginTop: 24,
    height: 50,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalItemText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
});
