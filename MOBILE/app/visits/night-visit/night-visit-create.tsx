import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, FlatList, Image, Alert, Keyboard } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Moon, Plus, Trash2, ChevronDown, Building, X, Clock, MapPin, Camera, Lock } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { getSites, getClients, getSiteGuards, Site, Client, checkOutSiteVisit } from '../../../services/siteService';
import { submitNightVisitReport, getNightVisitTemplates } from '../../../services/visitService';
import { clearActiveCheckIn, markReportSubmittedForCheckIn } from '../../../services/db';
import { THEME } from '../../../constants/theme';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { StepIndicator } from '../../../components/ui/StepIndicator';
import { CustomAlertModal } from '../../../components/ui/CustomAlertModal';
import { TimePicker24Modal } from '../../../components/ui/TimePicker24Modal';

const STEPS = ['General Info', 'Guards', 'Night Checklist', 'Briefing', 'Suggestions', 'Review'];

const DEFAULT_NIGHT_MANDATORY_QUESTIONS = [
  { id: 'nq1', section: 'Night Guard Alertness', question: 'Are night duty security guards alert, awake, and in proper uniform?' },
  { id: 'nq2', section: 'Perimeter & Gate Security', question: 'Are perimeter fences, main entry gates, and access points locked & secured?' },
  { id: 'nq3', section: 'Patrol & Register Log', question: 'Is patrol tracking / torch light / night patrol register being updated properly?' },
  { id: 'nq4', section: 'Critical Areas Lock & Key', question: 'Are key rooms, server rooms, and high-value storage areas locked & verified?' },
  { id: 'nq5', section: 'Random Checking & Briefing', question: 'Were random night checks performed and guard briefing delivered?' },
];

export default function CreateNightVisitReportScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string; siteId?: string; plannedId?: string; checkInTime?: string; checkOutTime?: string }>();

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
  const [shift, setShift] = useState('Night');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(
    params.checkInTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  );
  const [endTime, setEndTime] = useState(
    params.checkOutTime || null
  );

  // Custom On-Spot Questions State
  const [customQuestions, setCustomQuestions] = useState<Array<{ id: string; section?: string; question: string; isCustom?: boolean }>>([]);
  const [newQuestionText, setNewQuestionText] = useState('');

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
      if (!startTime || !endTime) return null;
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

  // Dynamic Template Questions from DB (FIELD_OFFICER_NIGHT_VISIT_TEMPLATES)
  const [allTemplatePool, setAllTemplatePool] = useState<Array<{ id: string; section?: string; question: string; required?: boolean }>>([]);
  const [templateQuestions, setTemplateQuestions] = useState<Array<{ id: string; section?: string; question: string; required?: boolean }>>([]);
  const [onSpotModalVisible, setOnSpotModalVisible] = useState(false);
  const [bankSearchQuery, setBankSearchQuery] = useState('');

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
    value: '22:00',
  });

  // Modal selector states
  const [clientModalVisible, setClientModalVisible] = useState(false);
  const [siteModalVisible, setSiteModalVisible] = useState(false);

  // Guards List
  const [guards, setGuards] = useState<Array<{ name: string; empCode: string; status: string; isTemporary?: boolean }>>([]);
  const [newGuardName, setNewGuardName] = useState('');
  const [newGuardCode, setNewGuardCode] = useState('');

  // Question Photo Capture State
  const [questionPhotos, setQuestionPhotos] = useState<Record<string, string>>({});

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
        const asset = result.assets[0];
        const photoData = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        setQuestionPhotos((prev) => ({ ...prev, [qText]: photoData }));
      }
    } catch (e) {
      console.warn('Error launching camera for question photo:', e);
    }
  };

  // Checklist
  const [checklist, setChecklist] = useState<Record<string, 'Satisfactory' | 'Unsatisfactory' | 'NA'>>({});

  // GPS Location State
  const [gps, setGps] = useState('');
  const [fetchingGps, setFetchingGps] = useState(false);

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

  useEffect(() => {
    if (siteId) {
      fetchGuards(siteId, shift);
    }
  }, [siteId, shift]);

  const fetchGuards = async (sId: string, sShift?: string) => {
    try {
      const fetched = await getSiteGuards(sId, sShift);
      if (fetched && fetched.length > 0) {
        setGuards((prev) => {
          const tempGuards = prev.filter((g) => g.isTemporary);
          const regularGuards = fetched.map((g) => ({
            name: g.name,
            empCode: g.empCode || `G${g.empOid || '001'}`,
            status: g.status || 'Alert & Awake',
            isTemporary: false,
          }));
          return [...regularGuards, ...tempGuards];
        });
      }
    } catch (e) {
      console.error('Failed to fetch site guards from DB', e);
    }
  };

  const loadClientsAndSites = async () => {
    try {
      const empOidVal = user?.id || user?.empOid || user?.employee_id || 7558;
      const [clientData, siteData, templates] = await Promise.all([
        getClients(),
        getSites(),
        getNightVisitTemplates(),
      ]);
      setClients(clientData || []);
      setSites(siteData || []);

      // Load DB template questions from FIELD_OFFICER_NIGHT_VISIT_TEMPLATES or fallback to mandatory questions
      // Load DB template questions from FIELD_OFFICER_NIGHT_VISIT_TEMPLATES
      let allQs: any[] = [];
      if (templates && templates.length > 0 && templates[0].questions?.length > 0) {
        allQs = templates[0].questions;
      } else {
        allQs = DEFAULT_NIGHT_MANDATORY_QUESTIONS;
      }
      setAllTemplatePool(allQs);

      // Only show required questions in the initial checklist
      const requiredQs = allQs.filter(
        (q: any) => q.required === true || q.is_required === true || q.required === 1 || q.is_required === 1 || q.mandatory === true
      );
      const defaultList = requiredQs.length > 0 ? requiredQs : allQs.slice(0, 5);
      setTemplateQuestions(defaultList);

      const initChecklist: Record<string, 'Satisfactory' | 'Unsatisfactory' | 'NA'> = {};
      defaultList.forEach((qItem: any) => {
        const text = qItem.question || String(qItem);
        initChecklist[text] = 'Satisfactory';
      });
      setChecklist(initChecklist);

      if (params.siteId && siteData) {
        const foundSite = siteData.find((s) => String(s.id) === String(params.siteId));
        if (foundSite) {
          setSiteId(String(foundSite.id));
          setSiteName(foundSite.name);
          fetchGuards(String(foundSite.id), shift);
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
    const matchesClient = clientId ? String(s.client_id) === String(clientId) : false;
    const matchesSearch = s.name.toLowerCase().includes(siteSearchQuery.toLowerCase()) ||
                          (s.client_name && s.client_name.toLowerCase().includes(siteSearchQuery.toLowerCase()));
    return matchesClient && matchesSearch;
  });

  // Handlers for Temporary Guards
  const handleAddGuard = () => {
    if (!newGuardName.trim()) return;
    const tempGuard = {
      name: newGuardName.trim(),
      empCode: newGuardCode.trim() || `TEMP${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'Alert & Awake',
      isTemporary: true,
    };
    setGuards([...guards, tempGuard]);
    setNewGuardName('');
    setNewGuardCode('');
  };

  const handleRemoveGuard = (idx: number) => {
    setGuards(guards.filter((_, i) => i !== idx));
  };

  const availableBankQuestions = allTemplatePool.filter((q: any) => {
    const qText = (q.question || String(q)).toLowerCase().trim();
    const inRequired = templateQuestions.some((t: any) => (t.question || String(t)).toLowerCase().trim() === qText);
    const inCustom = customQuestions.some((c: any) => (c.question || String(c)).toLowerCase().trim() === qText);
    return !inRequired && !inCustom;
  });

  const filteredBankQuestions = availableBankQuestions.filter((q: any) => {
    const qText = (q.question || String(q)).toLowerCase();
    const qSec = (q.section || '').toLowerCase();
    const query = bankSearchQuery.toLowerCase();
    return qText.includes(query) || qSec.includes(query);
  });

  const handleAddFromBank = (qItem: any) => {
    const qText = qItem.question || String(qItem);
    const newQ = {
      id: qItem.id || `bank_${Date.now()}`,
      section: qItem.section || 'On-Spot Inspection',
      question: qText,
      isCustom: true,
    };
    setCustomQuestions((prev) => [...prev, newQ]);
    setChecklist((prev) => ({ ...prev, [qText]: 'Satisfactory' }));
    setOnSpotModalVisible(false);
    setBankSearchQuery('');
    Alert.alert('Question Added', `"${qText}" added to the checklist.`);
  };

  const handleAddCustomQuestion = () => {
    const qText = newQuestionText.trim();
    if (!qText) {
      Alert.alert('Question Required', 'Please enter your on-spot inspection question in the input field first.');
      return;
    }
    const exists = [...templateQuestions, ...customQuestions].some(
      (q: any) => (q.question || String(q)).toLowerCase() === qText.toLowerCase()
    );
    if (exists) {
      Alert.alert('Duplicate Item', 'This checklist item already exists in the checklist.');
      return;
    }
    const newQ = {
      id: `spot_${Date.now()}`,
      section: 'Custom Inspection',
      question: qText,
      isCustom: true,
    };
    setCustomQuestions((prev) => [...prev, newQ]);
    setChecklist((prev) => ({ ...prev, [qText]: 'Satisfactory' }));
    setNewQuestionText('');
    Keyboard.dismiss();
    Alert.alert('Question Added', `"${qText}" added to the checklist.`);
  };

  const handleRemoveCustomQuestion = (qText: string) => {
    setCustomQuestions((prev) => prev.filter((q) => (q.question || String(q)) !== qText));
    setChecklist((prev) => {
      const updated = { ...prev };
      delete updated[qText];
      return updated;
    });
  };

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

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let currentGps = gps;
      if (!currentGps) {
        currentGps = await fetchCurrentLocation();
      }

      const capturedPhotos = Object.values(questionPhotos).filter((p) => p && typeof p === 'string');

      const payload = {
        client_id: parseInt(clientId, 10) || 1,
        site_id: parseInt(siteId, 10) || 1,
        site_name: siteName || 'Selected Site',
        visit_date: visitDate,
        visit_type: 'Scheduled',
        shift: shift,
        officer: user?.name || 'Field Officer',
        'check-in_time': startTime,
        start_time: startTime,
        startTime: startTime,
        check_in_time: startTime,
        'check-out_time': endTime,
        end_time: endTime,
        endTime: endTime,
        check_out_time: endTime,
        gps: currentGps,
        guards: guards,
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
        photos: capturedPhotos,
        lecture_details: lectureDetails,
        random_checking: randomChecking,
        overall_remarks: overallRemarks,
        status: 'Completed',
      };

      const res = await submitNightVisitReport(payload);

      if (params.plannedId || siteId) {
        await markReportSubmittedForCheckIn(params.plannedId, siteId, (res as any)?.report_id || (res as any)?.oid, 'Night Round');
      }

      setAlertInfo({
        visible: true,
        title: t('night_visit_submitted') || 'Report Submitted',
        message: 'Night Round Report submitted successfully! Please tap Check-Out on the visits screen when you leave site.',
        type: 'success',
      });
    } catch (e: any) {
      console.error('Night visit submit failed', e);
      setAlertInfo({
        visible: true,
        title: t('missing_fields'),
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

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 140 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        indicatorStyle="white"
      >
        {/* STEP 0: General Info */}
        {currentStep === 0 && (
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>Night Round Information</Text>

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

            <Input label="Shift" value={shift} onChangeText={setShift} />
            <Input label="Visit Date" value={visitDate} onChangeText={setVisitDate} />

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
          </Card>
        )}

        {/* STEP 1: Guards Inspection */}
        {currentStep === 1 && (
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>Night Duty Guards Check ({guards.length} Deployed)</Text>
            {guards.length === 0 ? (
              <Text style={{ fontSize: 13, color: '#94A3B8', marginVertical: 10 }}>
                No active regular night guards found for this site in DB. You can add temporary guards below.
              </Text>
            ) : (
              guards.map((g, idx) => (
                <View key={idx} style={styles.guardRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.guardName}>{g.name} ({g.empCode})</Text>
                      <View
                        style={{
                          backgroundColor: g.isTemporary ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 4,
                          marginLeft: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '800',
                            color: g.isTemporary ? '#F59E0B' : '#60A5FA',
                          }}
                        >
                          {g.isTemporary ? 'TEMPORARY' : 'REGULAR'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.guardMeta}>Status: {g.status}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveGuard(idx)}>
                    <Trash2 color={THEME.danger} size={18} />
                  </TouchableOpacity>
                </View>
              ))
            )}

            <Text style={[styles.stepTitle, { marginTop: 16 }]}>Add Temporary On-Duty Guard</Text>
            <Input label="Temporary Guard Name" value={newGuardName} onChangeText={setNewGuardName} placeholder="e.g. Suresh Patil" />
            <Input label="Employee Code / ID" value={newGuardCode} onChangeText={setNewGuardCode} placeholder="e.g. EMP9120 or Temp ID" />
            <Button title="Add Temporary Guard to Report" variant="outline" onPress={handleAddGuard} icon={<Plus color={THEME.primary} size={18} />} />
          </Card>
        )}

        {/* STEP 2: Night Checklist */}
        {currentStep === 2 && (
          <Card style={styles.stepCard}>
            <Text style={styles.stepTitle}>
              Officer Night Round Checklist ({templateQuestions.length + customQuestions.length} Items)
            </Text>

            {[...templateQuestions, ...customQuestions].map((item: any, idx) => {
              const qText = item.question || String(item);
              const status = checklist[qText] || 'Satisfactory';
              const isCustom = !!item.isCustom;

              return (
                <View key={item.id || idx} style={{ marginBottom: 16, backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' }}>
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

            <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.1)' }}>
              <Text style={[styles.stepTitle, { marginBottom: 4 }]}>Add On-Spot Inspection Question</Text>
              <Text style={{ fontSize: 12, color: THEME.textVariant, marginBottom: 14 }}>
                Add extra inspection points from the question pool or type a new custom item.
              </Text>

              {/* 1. Dropdown / Picker from Template Pool */}
              {availableBankQuestions.length > 0 ? (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.fieldLabel}>CHOOSE FROM QUESTION POOL ({availableBankQuestions.length} AVAILABLE)</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    activeOpacity={0.8}
                    onPress={() => setOnSpotModalVisible(true)}
                  >
                    <Text style={[styles.pickerButtonText, { color: '#E2E8F0' }]}>
                      Select from Question Bank...
                    </Text>
                    <ChevronDown size={20} color={THEME.textVariant} />
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* 2. Custom Question Input */}
              <View>
                <Input
                  label="OR Type a New Custom Question"
                  value={newQuestionText}
                  onChangeText={setNewQuestionText}
                  placeholder="e.g. Is rear emergency fire exit clear of obstruction?"
                  returnKeyType="done"
                  onSubmitEditing={handleAddCustomQuestion}
                />
                <Button
                  title="Add Custom Question to Checklist"
                  variant="outline"
                  onPress={handleAddCustomQuestion}
                  icon={<Plus color={THEME.primary} size={18} />}
                />
              </View>
            </View>
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
                  <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
                    {!clientId ? (t('select_client_first') || 'Please select a client first.') : 'No sites found for this client.'}
                  </Text>
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

      {/* On-Spot Question Bank Modal */}
      <Modal visible={onSpotModalVisible} transparent animationType="slide" onRequestClose={() => setOnSpotModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Question from Pool ({availableBankQuestions.length})</Text>
              <TouchableOpacity onPress={() => setOnSpotModalVisible(false)}>
                <X color="#94A3B8" size={20} />
              </TouchableOpacity>
            </View>

            <Input
              placeholder="Search questions in pool..."
              value={bankSearchQuery}
              onChangeText={setBankSearchQuery}
              containerStyle={{ marginVertical: 8 }}
            />

            <FlatList
              data={filteredBankQuestions}
              keyExtractor={(item, index) => item.id || `bank_q_${index}`}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={{
                    padding: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    marginBottom: 6,
                    borderRadius: 8,
                  }}
                  activeOpacity={0.7}
                  onPress={() => handleAddFromBank(item)}
                >
                  {item.section ? (
                    <Text style={{ fontSize: 10, fontWeight: '800', color: THEME.primary, marginBottom: 2 }}>
                      {item.section.toUpperCase()}
                    </Text>
                  ) : null}
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>
                    {item.question}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: THEME.textVariant, textAlign: 'center' }}>
                    {availableBankQuestions.length === 0
                      ? 'All questions from the pool have been added.'
                      : 'No questions match your search.'}
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
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
  pickerButtonLocked: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
  },
  pickerButtonTextLocked: {
    color: '#CBD5E1',
    fontWeight: '700',
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
