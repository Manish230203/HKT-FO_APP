import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  CheckCircle2,
  Play,
  CalendarDays,
  Building2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getPlannedVisits, PlannedVisit } from '../../services/siteService';
import { getDayVisitReports, getNightVisitReports, getGeneralVisits } from '../../services/visitService';
import { THEME } from '../../constants/theme';

import { Modal } from 'react-native';
import { X, User, MapPin, FileText, Clock as ClockIcon } from 'lucide-react-native';

type CompletedVisit = {
  id: string;
  reportNo: string;
  clientName: string;
  siteName: string;
  visitType: string;
  date: string;
  officer: string;
  status: string;
  rawReport?: any;
};

export default function VisitsScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();

  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [loading, setLoading] = useState(false);
  const [plannedVisits, setPlannedVisits] = useState<PlannedVisit[]>([]);
  const [completedVisits, setCompletedVisits] = useState<CompletedVisit[]>([]);
  const [selectedReport, setSelectedReport] = useState<CompletedVisit | null>(null);

  // Sync tab from navigation params each time they change
  useEffect(() => {
    if (params.tab === 'completed') {
      setActiveTab('completed');
    } else {
      setActiveTab('pending');
    }
  }, [params.tab]);

  const fetchVisits = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const empOidVal = user?.id || user?.empOid || user?.employee_id || 7558;

      const planned = await getPlannedVisits(empOidVal);
      setPlannedVisits(planned || []);

      const compiled: CompletedVisit[] = [];
      const seenIds = new Set<string>();

      const dayReps = await getDayVisitReports(empOidVal);
      (dayReps || []).forEach((r: any, idx: number) => {
        const rawOid = String(r.id || r.oid || idx);
        const itemKey = rawOid.startsWith('day_') ? rawOid : `day_${rawOid}`;
        if (!seenIds.has(itemKey)) {
          seenIds.add(itemKey);
          compiled.push({
            id: itemKey,
            reportNo: r.reportNo || r.report_id || `DVR-${rawOid}`,
            clientName: r.client_name || r.clientName || r.company || 'ADIENT INDIA PVT LTD',
            siteName: r.site_name || r.unit || 'ADIENT - PIMPRI',
            visitType: 'Day Visit',
            date: r.visitDate || r.visit_date || r.createdOn || today,
            officer: r.officer || user?.name || 'Amit Kulkarni',
            status: 'Completed',
            rawReport: r,
          });
        }
      });

      const nightReps = await getNightVisitReports(empOidVal);
      (nightReps || []).forEach((r: any, idx: number) => {
        const rawOid = String(r.id || r.oid || idx);
        const itemKey = rawOid.startsWith('night_') ? rawOid : `night_${rawOid}`;
        if (!seenIds.has(itemKey)) {
          seenIds.add(itemKey);
          compiled.push({
            id: itemKey,
            reportNo: r.reportNo || r.report_id || `NVR-${rawOid}`,
            clientName: r.client_name || r.clientName || r.company || 'ADIENT INDIA PVT LTD',
            siteName: r.site_name || r.unit || 'ADIENT - PIMPRI',
            visitType: 'Night Round',
            date: r.visitDate || r.visit_date || r.createdOn || today,
            officer: r.officer || user?.name || 'Amit Kulkarni',
            status: 'Completed',
            rawReport: r,
          });
        }
      });

      const genReps = await getGeneralVisits(empOidVal);
      (genReps || []).forEach((r: any, idx: number) => {
        const rawOid = String(r.id || r.oid || idx);
        const itemKey = rawOid.startsWith('gen_') ? rawOid : `gen_${rawOid}`;
        if (!seenIds.has(itemKey)) {
          seenIds.add(itemKey);
          compiled.push({
            id: itemKey,
            reportNo: r.report_id || r.report_no || r.reportNo || `GVR-${rawOid}`,
            clientName: r.client_name || r.clientName || 'ADIENT INDIA PVT LTD',
            siteName: r.site_name || r.siteName || 'ADIENT - PIMPRI',
            visitType: 'General Audit',
            date: r.visit_date || r.visitDate || today,
            officer: r.officer || user?.name || 'Amit Kulkarni',
            status: 'Completed',
            rawReport: r,
          });
        }
      });

      setCompletedVisits(compiled);
    } catch (e) {
      console.error('Failed to fetch visits', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchVisits();
    }, [])
  );

  const isVisitOverdue = (pv: PlannedVisit) => {
    if (pv.status === 'Completed') return false;
    if (pv.status === 'Overdue') return true;
    const periodStr = pv.plannedPeriod || pv.date || '';
    if (periodStr) {
      const parts = periodStr.split('-');
      const endDateStr = parts[parts.length - 1].trim();
      const endDate = new Date(endDateStr);
      if (!isNaN(endDate.getTime())) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (endDate < today) return true;
      }
    }
    return false;
  };

  const pendingVisits = plannedVisits.filter((pv) => {
    if (pv.status === 'Completed') return false;
    const done = pv.completedVisits || 0;
    const freq = pv.visitFrequency
      ? parseInt(String(pv.visitFrequency), 10)
      : pv.frequency
      ? parseInt(String(pv.frequency), 10)
      : 1;
    return done < freq || freq === 0;
  });

  const getStatusInfo = (pv: PlannedVisit) => {
    const overdue = isVisitOverdue(pv);
    const done = pv.completedVisits || 0;
    const total =
      (pv.visitFrequency
        ? parseInt(String(pv.visitFrequency), 10)
        : pv.frequency
        ? parseInt(String(pv.frequency), 10)
        : 1) || 1;

    if (overdue) return { label: t('overdue'), color: '#EF4444', bg: 'rgba(239,68,68,0.15)', done, total };
    if (done > 0) return { label: t('in_progress'), color: '#3B82F6', bg: 'rgba(59,130,246,0.15)', done, total };
    return { label: t('pending'), color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', done, total };
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0A1128" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color="#FFFFFF" size={22} />
        </TouchableOpacity>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>
            {activeTab === 'pending' ? t('pending_visits') : t('completed_visits')}
          </Text>
          <Text style={styles.headerSub}>
            {activeTab === 'pending'
              ? `${pendingVisits.length} ${t('pending')}`
              : `${completedVisits.length} ${t('completed')}`}
          </Text>
        </View>
        <TouchableOpacity onPress={fetchVisits} style={styles.refreshBtn}>
          <RefreshCw color="#3B82F6" size={20} />
        </TouchableOpacity>
      </View>


      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchVisits} tintColor="#3B82F6" />}
      >
        {/* PENDING TAB */}
        {activeTab === 'pending' && (
          <>
            {pendingVisits.length === 0 ? (
              <View style={styles.emptyBox}>
                <CheckCircle2 color="#10B981" size={48} style={{ marginBottom: 12 }} />
                <Text style={styles.emptyTitle}>{t('all_clear')}</Text>
                <Text style={styles.emptySubtitle}>{t('no_pending_visits_desc')}</Text>
              </View>
            ) : (
              pendingVisits.map((pv) => {
                const status = getStatusInfo(pv);
                return (
                  <View key={pv.id} style={styles.visitCard}>
                    {/* Card Top: Plan Code + Status Badge */}
                    <View style={styles.cardTopRow}>
                      <View style={styles.planCodeBadge}>
                        <Text style={styles.planCodeText}>{pv.planCode || 'PLAN'}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
                      </View>
                    </View>

                    {/* Site & Client */}
                    <Text style={styles.siteNameText} numberOfLines={2}>
                      {pv.siteName || 'Site'}
                    </Text>
                    <Text style={styles.clientNameText}>{pv.clientName || 'Client'}</Text>

                    {/* Divider */}
                    <View style={styles.divider} />

                    {/* Meta row */}
                    <View style={styles.metaRow}>
                      <View style={styles.metaItem}>
                        <CalendarDays color="#64748B" size={13} style={{ marginRight: 4 }} />
                        <Text style={styles.metaText}>{pv.plannedPeriod || pv.date || '—'}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Building2 color="#64748B" size={13} style={{ marginRight: 4 }} />
                        <Text style={styles.metaText}>{pv.planningType || pv.visitType || 'Single'}</Text>
                      </View>
                    </View>

                    {/* Progress + Start Button */}
                    <View style={styles.cardBottomRow}>
                      <View style={styles.progressWrap}>
                        <Text style={styles.progressLabel}>
                          {status.done}/{status.total} {t('visits_done')}
                        </Text>
                        <View style={styles.progressBarBg}>
                          <View
                            style={[
                              styles.progressBarFill,
                              {
                                width: `${Math.min((status.done / status.total) * 100, 100)}%`,
                                backgroundColor: status.color,
                              },
                            ]}
                          />
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.startBtn}
                        onPress={() =>
                          router.push(
                            `/visits/select-type?clientId=${pv.clientId || ''}&siteId=${pv.siteId || ''}&plannedId=${pv.id}`
                          )
                        }
                      >
                        <Play color="#FFFFFF" size={13} style={{ marginRight: 4 }} />
                        <Text style={styles.startBtnText}>{t('start_visit_btn')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* COMPLETED TAB */}
        {activeTab === 'completed' && (
          <>
            {completedVisits.length === 0 ? (
              <View style={styles.emptyBox}>
                <AlertCircle color="#64748B" size={48} style={{ marginBottom: 12 }} />
                <Text style={styles.emptyTitle}>{t('no_reports_yet')}</Text>
                <Text style={styles.emptySubtitle}>{t('no_completed_visits_desc')}</Text>
              </View>
            ) : (
              completedVisits.map((visit, index) => (
                <TouchableOpacity
                  key={`${visit.id}_${index}`}
                  activeOpacity={0.85}
                  onPress={() => setSelectedReport(visit)}
                  style={styles.visitCard}
                >
                  {/* Top row: Visit Type Badge + Completed Status */}
                  <View style={styles.cardTopRow}>
                    <View style={[
                      styles.visitTypeBadge,
                      visit.visitType.includes('Day') && { backgroundColor: 'rgba(245,158,11,0.15)' },
                      visit.visitType.includes('Night') && { backgroundColor: 'rgba(129,140,248,0.15)' },
                      visit.visitType.includes('General') && { backgroundColor: 'rgba(52,211,153,0.15)' },
                    ]}>
                      <Text style={[
                        styles.visitTypeBadgeText,
                        visit.visitType.includes('Day') && { color: '#F59E0B' },
                        visit.visitType.includes('Night') && { color: '#818CF8' },
                        visit.visitType.includes('General') && { color: '#34D399' },
                      ]}>
                        {visit.visitType}
                      </Text>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                      <CheckCircle2 color="#10B981" size={12} style={{ marginRight: 4 }} />
                      <Text style={[styles.statusBadgeText, { color: '#10B981' }]}>{t('completed')}</Text>
                    </View>
                  </View>

                  {/* Report ID */}
                  <Text style={styles.reportNoText} numberOfLines={1} ellipsizeMode="tail">
                    {visit.reportNo}
                  </Text>

                  {/* Site & Client */}
                  <Text style={styles.siteNameText} numberOfLines={1}>
                    {visit.siteName}
                  </Text>
                  <Text style={styles.clientNameText} numberOfLines={1}>{visit.clientName}</Text>

                  <View style={styles.divider} />

                  {/* Date Footer */}
                  <View style={styles.cardBottomRow}>
                    <View style={styles.metaItem}>
                      <CalendarDays color="#64748B" size={13} style={{ marginRight: 4 }} />
                      <Text style={styles.metaText}>{visit.date}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* COMPLETED REPORT DETAIL MODAL (Exact WEB Match Preview Sheet) */}
      <Modal
        visible={!!selectedReport}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedReport(null)}
      >
        <View style={styles.detailOverlay}>
          <View style={styles.detailContainer}>
            {/* Header Close Bar */}
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailTitle}>{selectedReport?.reportNo}</Text>
                <Text style={styles.detailSubtitle}>{selectedReport?.visitType}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedReport(null)} style={styles.detailCloseBtn}>
                <X color="#94A3B8" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
              {/* Corporate Banner Header (Exact WEB Match) */}
              <View style={styles.previewCorporateBanner}>
                <View style={styles.bannerHeaderTopRow}>
                  <Building2 color="#60A5FA" size={20} />
                  <Text style={styles.companyNameTitle}>Unique Delta Force Security Pvt. Ltd.</Text>
                </View>

                <View style={styles.reportTitleBanner}>
                  <Text style={styles.reportMainHeading}>
                    {selectedReport?.visitType === 'Day Visit'
                      ? 'FIELD OFFICER DAY VISIT REPORT'
                      : selectedReport?.visitType === 'Night Round'
                      ? 'FIELD OFFICER NIGHT VISIT REPORT'
                      : 'FIELD OFFICER GENERAL VISIT REPORT'}
                  </Text>
                  <Text style={styles.reportIdTag}>REPORT ID : {selectedReport?.reportNo}</Text>
                </View>

                <View style={styles.bannerDateRow}>
                  <ClockIcon color="#94A3B8" size={13} style={{ marginRight: 4 }} />
                  <Text style={styles.bannerDateText}>
                    DATE : {selectedReport?.date} | {selectedReport?.rawReport?.['check-in_time'] || selectedReport?.rawReport?.start_time || selectedReport?.rawReport?.startTime || '09:00'} - {selectedReport?.rawReport?.['check-out_time'] || selectedReport?.rawReport?.end_time || selectedReport?.rawReport?.endTime || '17:00'}
                  </Text>
                </View>
              </View>

              {/* 1. General Information Card (Navy Section Header) */}
              <View style={styles.detailSectionCard}>
                <View style={styles.navySectionTitleBox}>
                  <Text style={styles.navySectionTitle}>GENERAL INFORMATION</Text>
                </View>
                <View style={styles.gridInfoBox}>
                  <View style={styles.infoRowItem}>
                    <Text style={styles.gridLabel}>Client Name</Text>
                    <Text style={styles.gridValue}>{selectedReport?.clientName || 'ADIENT INDIA PVT LTD'}</Text>
                  </View>
                  <View style={styles.infoRowItem}>
                    <Text style={styles.gridLabel}>Site Name</Text>
                    <Text style={styles.gridValue}>{selectedReport?.siteName || 'ADIENT - PIMPRI'}</Text>
                  </View>
                  <View style={styles.infoRowItem}>
                    <Text style={styles.gridLabel}>Shift</Text>
                    <Text style={styles.gridValue}>{selectedReport?.rawReport?.shift || (selectedReport?.visitType === 'Night Round' ? 'Night Shift' : 'Day Shift')}</Text>
                  </View>
                  <View style={styles.infoRowItem}>
                    <Text style={styles.gridLabel}>Visit Type</Text>
                    <Text style={styles.gridValue}>{selectedReport?.visitType}</Text>
                  </View>
                  <View style={styles.infoRowItem}>
                    <Text style={styles.gridLabel}>Officer Name</Text>
                    <Text style={styles.gridValue}>{selectedReport?.officer || 'Amit Kulkarni'}</Text>
                  </View>
                  <View style={styles.infoRowItem}>
                    <Text style={styles.gridLabel}>Start Time</Text>
                    <Text style={styles.gridValue}>{selectedReport?.rawReport?.['check-in_time'] || selectedReport?.rawReport?.start_time || selectedReport?.rawReport?.startTime || '—'}</Text>
                  </View>
                  <View style={styles.infoRowItem}>
                    <Text style={styles.gridLabel}>End Time</Text>
                    <Text style={styles.gridValue}>{selectedReport?.rawReport?.['check-out_time'] || selectedReport?.rawReport?.end_time || selectedReport?.rawReport?.endTime || '—'}</Text>
                  </View>
                  <View style={styles.infoRowItem}>
                    <Text style={styles.gridLabel}>GPS Location</Text>
                    <Text style={styles.gridValue}>{selectedReport?.rawReport?.gps || 'Location Logged'}</Text>
                  </View>
                </View>
              </View>

              {/* 2. Visit Parameters & Scope (General Visit) */}
              {selectedReport?.visitType === 'General Audit' && (
                <View style={styles.detailSectionCard}>
                  <View style={styles.navySectionTitleBox}>
                    <Text style={styles.navySectionTitle}>VISIT PARAMETERS & SCOPE</Text>
                  </View>
                  <View style={styles.gridInfoBox}>
                    <View style={styles.infoRowItemFull}>
                      <Text style={styles.gridLabel}>Person Visited</Text>
                      <Text style={styles.gridValue}>{selectedReport?.rawReport?.person_visited || selectedReport?.rawReport?.personVisited || 'N/A'}</Text>
                    </View>
                    <View style={styles.infoRowItemFull}>
                      <Text style={styles.gridLabel}>Reason of Visit</Text>
                      <Text style={styles.gridValue}>{selectedReport?.rawReport?.reason_of_visit || selectedReport?.rawReport?.reasonOfVisit || 'Routine Security Audit'}</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* 3. Guards Present on Duty */}
              {selectedReport?.visitType !== 'General Audit' && (() => {
                let guardsList: any[] = [];
                const rawG = selectedReport?.rawReport?.guards;
                if (Array.isArray(rawG)) guardsList = rawG;
                else if (typeof rawG === 'string' && rawG.trim()) {
                  try { guardsList = JSON.parse(rawG); } catch (e) {}
                }
                return (
                  <View style={styles.detailSectionCard}>
                    <View style={styles.navySectionTitleBox}>
                      <Text style={styles.navySectionTitle}>GUARDS PRESENT ON DUTY ({guardsList.length})</Text>
                    </View>
                    {guardsList.length > 0 ? (
                      <View style={styles.tableWrap}>
                        <View style={styles.tableHeaderRow}>
                          <Text style={[styles.thCell, { flex: 0.5 }]}>#</Text>
                          <Text style={[styles.thCell, { flex: 2 }]}>Guard Name</Text>
                          <Text style={[styles.thCell, { flex: 1 }]}>Emp Code</Text>
                          <Text style={[styles.thCell, { flex: 1.5, textAlign: 'right' }]}>Status</Text>
                        </View>
                        {guardsList.map((g: any, idx: number) => (
                          <View key={idx} style={styles.tableBodyRow}>
                            <Text style={[styles.tdCell, { flex: 0.5, color: '#64748B' }]}>{idx + 1}</Text>
                            <Text style={[styles.tdCell, { flex: 2, fontWeight: '700', color: '#F8FAFC' }]}>{g.name || 'Guard'}</Text>
                            <Text style={[styles.tdCell, { flex: 1, color: '#94A3B8' }]}>{g.empCode || g.employeeId || g.emp_code || 'G'}</Text>
                            <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                              <View style={[styles.statusBadgePill, g.present !== false && g.status !== 'Absent' ? styles.statusBadgeSuccess : styles.statusBadgeDanger]}>
                                <Text style={styles.statusBadgeText}>{g.status || (g.present !== false ? 'Present' : 'Absent')}</Text>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.emptyTableText}>No guards listed for this visit.</Text>
                    )}
                  </View>
                );
              })()}

              {/* 4. Inspection Checklist Items */}
              {selectedReport?.visitType !== 'General Audit' && (() => {
                let checklistList: any[] = [];
                const rawC = selectedReport?.rawReport?.checklist;
                if (Array.isArray(rawC)) checklistList = rawC;
                else if (typeof rawC === 'string' && rawC.trim()) {
                  try { checklistList = JSON.parse(rawC); } catch (e) {}
                }
                return (
                  <View style={styles.detailSectionCard}>
                    <View style={styles.navySectionTitleBox}>
                      <Text style={styles.navySectionTitle}>INSPECTION CHECKLIST ITEMS ({checklistList.length})</Text>
                    </View>
                    {checklistList.length > 0 ? (
                      <View style={styles.tableWrap}>
                        {checklistList.map((item: any, idx: number) => {
                          const qText = item.question || item.title || String(item);
                          const statusStr = item.status || item.answer || 'Satisfactory';
                          const isNegative = statusStr === 'Unsatisfactory' || statusStr === 'NO' || statusStr === 'NOT OK';
                          return (
                            <View key={idx} style={styles.checklistRow}>
                              <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={styles.questionText}>{idx + 1}. {qText}</Text>
                                {item.remarks || item.observation ? (
                                  <Text style={styles.questionRemarkText}>Remarks: {item.remarks || item.observation}</Text>
                                ) : null}
                              </View>
                              <View style={[styles.statusBadgePill, !isNegative ? styles.statusBadgeSuccess : styles.statusBadgeDanger]}>
                                <Text style={styles.statusBadgeText}>{statusStr}</Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={styles.emptyTableText}>No checklist items recorded.</Text>
                    )}
                  </View>
                );
              })()}

              {/* 5. Lecture & Random Checking (Night Visit) */}
              {selectedReport?.visitType === 'Night Round' && (
                <View style={styles.detailSectionCard}>
                  <View style={styles.navySectionTitleBox}>
                    <Text style={styles.navySectionTitle}>BRIEFING, LECTURE & RANDOM CHECKING</Text>
                  </View>
                  <View style={styles.gridInfoBox}>
                    <View style={styles.infoRowItemFull}>
                      <Text style={styles.gridLabel}>Short Lecture Details</Text>
                      <Text style={styles.gridValue}>{selectedReport?.rawReport?.lecture_details || selectedReport?.rawReport?.lectureDetails || 'No short lecture details recorded.'}</Text>
                    </View>
                    <View style={styles.infoRowItemFull}>
                      <Text style={styles.gridLabel}>Random Checking Details</Text>
                      <Text style={styles.gridValue}>{selectedReport?.rawReport?.random_checking || selectedReport?.rawReport?.randomChecking || 'No random checking details recorded.'}</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* 6. Remarks & Customer Feedback */}
              <View style={styles.detailSectionCard}>
                <View style={styles.navySectionTitleBox}>
                  <Text style={styles.navySectionTitle}>REMARKS & OFFICER SUGGESTIONS</Text>
                </View>
                <View style={styles.remarkContentBox}>
                  <Text style={styles.remarkContentText}>
                    {selectedReport?.rawReport?.overall_remarks ||
                     selectedReport?.rawReport?.suggestions ||
                     selectedReport?.rawReport?.remark ||
                     'No additional remarks recorded.'}
                  </Text>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A1128',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(59,130,246,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  tabActiveGreen: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  // Visit Card
  visitCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  planCodeBadge: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  planCodeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
    letterSpacing: 0.5,
  },
  reportNoText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  visitTypeBadge: {
    flexShrink: 0,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  visitTypeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3B82F6',
  },
  siteNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 3,
    lineHeight: 22,
  },
  clientNameText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 12,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: '#64748B',
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressWrap: {
    flex: 1,
    marginRight: 12,
  },
  progressLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 5,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  startBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Empty state
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  // Detail Modal Styles
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  detailContainer: {
    backgroundColor: THEME.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.text,
  },
  detailSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.primary,
    marginTop: 2,
  },
  detailCloseBtn: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
  },
  detailSectionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.textVariant,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  remarkBox: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  remarkText: {
    fontSize: 13,
    color: '#E2E8F0',
    lineHeight: 18,
  },
  // Corporate Banner WEB Style
  previewCorporateBanner: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#1E3A8A',
  },
  bannerHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  companyNameTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 0.2,
  },
  reportTitleBanner: {
    backgroundColor: '#1E3A8A',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 6,
  },
  reportMainHeading: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  reportIdTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#93C5FD',
    textAlign: 'center',
    marginTop: 3,
  },
  bannerDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  bannerDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  navySectionTitleBox: {
    backgroundColor: '#1E3A8A',
    borderLeftWidth: 4,
    borderLeftColor: '#60A5FA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 12,
  },
  navySectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },
  gridInfoBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoRowItem: {
    width: '48%',
    backgroundColor: 'rgba(15,23,42,0.6)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  infoRowItemFull: {
    width: '100%',
    backgroundColor: 'rgba(15,23,42,0.6)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  gridLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  gridValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  tableWrap: {
    backgroundColor: 'rgba(15,23,42,0.4)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  thCell: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F8FAFC',
    textTransform: 'uppercase',
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tdCell: {
    fontSize: 12,
  },
  statusBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeSuccess: {
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  statusBadgeDanger: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  emptyTableText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
    padding: 10,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  questionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F1F5F9',
    lineHeight: 16,
  },
  questionRemarkText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    fontStyle: 'italic',
  },
  remarkContentBox: {
    backgroundColor: 'rgba(15,23,42,0.6)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  remarkContentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E2E8F0',
    lineHeight: 18,
  },
});
