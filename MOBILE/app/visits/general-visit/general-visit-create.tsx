import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, FlatList, Image, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { BookOpen, Send, ChevronDown, Building, X, Clock, MapPin, Plus, Trash2, Camera } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { getSites, getClients, Site, Client, checkOutSiteVisit } from '../../../services/siteService';
import { submitGeneralVisit } from '../../../services/visitService';
import { clearActiveCheckIn } from '../../../services/db';
import { THEME } from '../../../constants/theme';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { CustomAlertModal } from '../../../components/ui/CustomAlertModal';
import { TimePicker24Modal } from '../../../components/ui/TimePicker24Modal';

const DEFAULT_GENERAL_MANDATORY_QUESTIONS = [
  { id: 'gq1', section: 'Cabin & Site Post Condition', question: 'Is site cleanliness and guard cabin condition satisfactory?' },
  { id: 'gq2', section: 'Attendance & Handover Log', question: 'Are guard attendance registers and shift handover logs up to date?' },
  { id: 'gq3', section: 'Safety & Post Orders', question: 'Are safety instructions and post orders displayed at key locations?' },
  { id: 'gq4', section: 'Client & Staff Grievances', question: 'Is client feedback or grievance addressed satisfactorily?' },
  { id: 'gq5', section: 'Equipments & Gear Check', question: 'Are safety equipment (helmet, jacket, torch, baton) in working condition?' },
];

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
  const [startTime, setStartTime] = useState(
    params.checkInTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  );
  const [endTime, setEndTime] = useState(
    params.checkOutTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  );

  const handleCheckInNow = () => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    setStartTime(now);
  };

  const handleCheckOutNow = () => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    setEndTime(now);
  };

  const getSiteDurationText = () => {
    try {
      const [sH, sM] = startTime.split(':').map(Number);
      const [eH, eM] = endTime.split(':').map(Number);
      if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return null;

      let startMins = sH * 60 + sM;
      let endMins = eH * 60 + eM;
      if (endMins < startMins) endMins += 24 * 60;

      const diff = endMins - startMins;
      const hrs = Math.floor(diff / 60);
      const mins = diff % 60;

      if (hrs > 0) return `${hrs} hr ${mins} mins`;
      return `${mins} mins`;
    } catch {
      return null;
    }
  };
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

  // Template & Custom On-Spot Questions State
  const [templateQuestions, setTemplateQuestions] = useState<Array<{ id: string; section?: string; question: string }>>(DEFAULT_GENERAL_MANDATORY_QUESTIONS);
  const [customQuestions, setCustomQuestions] = useState<Array<{ id: string; section?: string; question: string; isCustom?: boolean }>>([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [checklist, setChecklist] = useState<Record<string, 'Satisfactory' | 'Unsatisfactory' | 'NA'>>(() => {
    const init: Record<string, 'Satisfactory' | 'Unsatisfactory' | 'NA'> = {};
    DEFAULT_GENERAL_MANDATORY_QUESTIONS.forEach((q) => {
      init[q.question] = 'Satisfactory';
    });
    return init;
  });

  // Photo Capture State (Per Question & General Attachments)
  const [questionPhotos, setQuestionPhotos] = useState<Record<string, string>>({});
  const [generalPhotos, setGeneralPhotos] = useState<string[]>([]);

  const handleCaptureQuestionPhoto = async (qText: string) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Camera permission is required to take question photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.5,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const photoUri = result.assets[0].uri;
        setQuestionPhotos((prev) => ({ ...prev, [qText]: photoUri }));
      }
    } catch (e) {
      console.warn('Error launching camera for question photo:', e);
    }
  };

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

  const handleAddCustomQuestion = () => {
    if (!newQuestionText.trim()) return;
    const qText = newQuestionText.trim();
    const newQ = {
      id: `spot_${Date.now()}`,
      section: 'On-Spot Inspection',
      question: qText,
      isCustom: true,
    };
    setCustomQuestions((prev) => [...prev, newQ]);
    setChecklist((prev) => ({ ...prev, [qText]: 'Satisfactory' }));
    setNewQuestionText('');
  };

  const handleRemoveCustomQuestion = (qText: string) => {
    setCustomQuestions((prev) => prev.filter((q) => (q.question || String(q)) !== qText));
    setChecklist((prev) => {
      const updated = { ...prev };
      delete updated[qText];
      return updated;
    });
  };

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
      let currentGps = gps;
      if (!currentGps) {
        currentGps = await fetchCurrentLocation();
      }

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
        gps: currentGps,
        checklist: [...templateQuestions, ...customQuestions].map((qItem: any) => {
          const text = qItem.question || String(qItem);
          return {
            section: qItem.section || 'General',
            question: text,
            status: checklist[text] || 'Satisfactory',
            isCustom: !!qItem.isCustom,
            photo: questionPhotos[text] || null,
          };
        }),
        photos: generalPhotos,
        remark: remark,
        officer: user?.name || 'Amit Kulkarni',
        employee_oid: user?.id || user?.employee_id || 7558,
        visit_type: 'General Audit',
      };

      await submitGeneralVisit(payload);

      // Trigger automatic Check-Out of the Site Visit Session
      const empOid = user?.id || (user as any)?.oid || user?.employee_id || 7558;
      try {
        await checkOutSiteVisit({
          employee_id: empOid,
          site_id: parseInt(siteId, 10) || 187,
        });
      } catch (checkOutErr) {
        console.warn('Auto check-out warning:', checkOutErr);
      }

      if (params.plannedId) {
        await clearActiveCheckIn(params.plannedId);
      }
      setAlertInfo({
        visible: true,
        title: t('general_visit_submitted'),
        message: 'General Visit Report submitted successfully and site visit session checked out.',
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
        
        {/* Check-In Time 24h Selector + Check-In Now Button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={styles.fieldLabel}>CHECK-IN TIME (START)</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleCheckInNow}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' }}
          >
            <Clock color="#10B981" size={13} style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#10B981' }}>Check-In Now</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setTimePickerConfig({ visible: true, mode: 'start', title: 'Select Check-In Time (24-Hour Clock)', value: startTime })}
          style={styles.pickerButton}
        >
          <Text style={styles.pickerButtonText}>{startTime} (HH:mm)</Text>
          <Clock color={THEME.primary} size={20} />
        </TouchableOpacity>

        {/* Check-Out Time 24h Selector + Check-Out Now Button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <Text style={styles.fieldLabel}>CHECK-OUT TIME (END)</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleCheckOutNow}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' }}
          >
            <Clock color="#F59E0B" size={13} style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#F59E0B' }}>Check-Out Now</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setTimePickerConfig({ visible: true, mode: 'end', title: 'Select Check-Out Time (24-Hour Clock)', value: endTime })}
          style={styles.pickerButton}
        >
          <Text style={styles.pickerButtonText}>{endTime} (HH:mm)</Text>
          <Clock color={THEME.primary} size={20} />
        </TouchableOpacity>

        {/* Total Site Duration Banner */}
        {getSiteDurationText() ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(59, 130, 246, 0.12)', padding: 12, borderRadius: 10, marginTop: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.25)' }}>
            <Clock color="#3B82F6" size={18} style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#93C5FD' }}>
              Total Time Spent on Site: <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>{getSiteDurationText()}</Text>
            </Text>
          </View>
        ) : null}

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
        {/* Mandatory & On-Spot Inspection Checklist */}
        <View style={{ marginTop: 16, marginBottom: 16 }}>
          <Text style={[styles.fieldLabel, { marginBottom: 10 }]}>
            GENERAL AUDIT CHECKLIST ({templateQuestions.length + customQuestions.length} ITEMS)
          </Text>

          {[...templateQuestions, ...customQuestions].map((item: any, idx) => {
            const qText = item.question || String(item);
            const status = checklist[qText] || 'Satisfactory';
            const isCustom = !!item.isCustom;

            return (
              <View key={item.id || idx} style={{ marginBottom: 14, backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    {item.section ? (
                      <Text style={{ fontSize: 10, fontWeight: '800', color: THEME.primary, marginBottom: 2 }}>
                        {item.section.toUpperCase()}
                      </Text>
                    ) : null}
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>{qText}</Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View
                      style={{
                        backgroundColor: isCustom ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                        marginRight: isCustom ? 6 : 0,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '800',
                          color: isCustom ? '#F59E0B' : '#60A5FA',
                        }}
                      >
                        {isCustom ? 'ON SPOT' : 'MANDATORY'}
                      </Text>
                    </View>

                    {isCustom ? (
                      <TouchableOpacity onPress={() => handleRemoveCustomQuestion(qText)} style={{ padding: 4 }}>
                        <Trash2 color={THEME.danger} size={16} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                {/* 3-Way Status Toggle Buttons */}
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                  {(['Satisfactory', 'Unsatisfactory', 'NA'] as const).map((val) => {
                    const isSelected = status === val;
                    let bg = 'rgba(255, 255, 255, 0.05)';
                    let border = 'rgba(255, 255, 255, 0.15)';
                    let color = '#94A3B8';
                    if (isSelected) {
                      if (val === 'Satisfactory') { bg = 'rgba(16, 185, 129, 0.25)'; border = '#10B981'; color = '#6EE7B7'; }
                      else if (val === 'Unsatisfactory') { bg = 'rgba(239, 68, 68, 0.25)'; border = '#EF4444'; color = '#FCA5A5'; }
                      else { bg = 'rgba(148, 163, 184, 0.25)'; border = '#94A3B8'; color = '#E2E8F0'; }
                    }
                    return (
                      <TouchableOpacity
                        key={val}
                        activeOpacity={0.8}
                        onPress={() => setChecklist((prev) => ({ ...prev, [qText]: val }))}
                        style={{
                          flex: 1,
                          paddingVertical: 8,
                          borderRadius: 6,
                          borderWidth: 1,
                          backgroundColor: bg,
                          borderColor: border,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: isSelected ? '800' : '600', color }}>{val}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Per-Question Photo Capture Button & Preview */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleCaptureQuestionPhoto(qText)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: questionPhotos[qText] ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.15)',
                      borderColor: questionPhotos[qText] ? '#10B981' : '#3B82F6',
                      borderWidth: 1,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 6,
                    }}
                  >
                    <Camera size={14} color={questionPhotos[qText] ? '#10B981' : '#3B82F6'} style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: questionPhotos[qText] ? '#10B981' : '#3B82F6' }}>
                      {questionPhotos[qText] ? 'Change Photo' : 'Attach Photo'}
                    </Text>
                  </TouchableOpacity>

                  {questionPhotos[qText] ? (
                    <Image
                      source={{ uri: questionPhotos[qText] }}
                      style={{ width: 36, height: 36, borderRadius: 6, borderWidth: 1, borderColor: '#10B981' }}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}

          <Text style={[styles.fieldLabel, { marginTop: 12, marginBottom: 6 }]}>ADD ON-SPOT INSPECTION QUESTION</Text>
          <Input
            label="On-Spot Question / Item"
            value={newQuestionText}
            onChangeText={setNewQuestionText}
            placeholder="e.g. Is rear emergency fire exit clear of obstruction?"
          />
          <Button
            title="Add On-Spot Question to Audit"
            variant="outline"
            onPress={handleAddCustomQuestion}
            icon={<Plus color={THEME.primary} size={18} />}
          />
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
