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

      const dayReps = await getDayVisitReports(empOidVal);
      (dayReps || []).forEach((r: any) => {
        compiled.push({
          id: `day_${r.id || r.oid}`,
          reportNo: r.reportNo || r.report_id || `DVR-${r.id || r.oid}`,
          clientName: r.client_name || r.clientName || r.company || 'ADIENT INDIA PVT LTD',
          siteName: r.site_name || r.unit || 'ADIENT - PIMPRI',
          visitType: 'Day Visit',
          date: r.visitDate || r.visit_date || r.createdOn || today,
          officer: r.officer || user?.name || 'Amit Kulkarni',
          status: 'Completed',
          rawReport: r,
        });
      });

      const nightReps = await getNightVisitReports(empOidVal);
      (nightReps || []).forEach((r: any) => {
        compiled.push({
          id: `night_${r.id || r.oid}`,
          reportNo: r.reportNo || r.report_id || `NVR-${r.id || r.oid}`,
          clientName: r.client_name || r.clientName || r.company || 'ADIENT INDIA PVT LTD',
          siteName: r.site_name || r.unit || 'ADIENT - PIMPRI',
          visitType: 'Night Round',
          date: r.visitDate || r.visit_date || r.createdOn || today,
          officer: r.officer || user?.name || 'Amit Kulkarni',
          status: 'Completed',
          rawReport: r,
        });
      });

      const genReps = await getGeneralVisits(empOidVal);
      (genReps || []).forEach((r: any) => {
        compiled.push({
          id: `gen_${r.id || r.oid}`,
          reportNo: r.report_id || r.report_no || r.reportNo || `GVR-${r.id || r.oid}`,
          clientName: r.client_name || r.clientName || 'ADIENT INDIA PVT LTD',
          siteName: r.site_name || r.siteName || 'ADIENT - PIMPRI',
          visitType: 'General Audit',
          date: r.visit_date || r.visitDate || today,
          officer: r.officer || user?.name || 'Amit Kulkarni',
          status: 'Completed',
          rawReport: r,
        });
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
              completedVisits.map((visit) => (
                <TouchableOpacity
                  key={visit.id}
                  activeOpacity={0.85}
                  onPress={() => setSelectedReport(visit)}
                  style={styles.visitCard}
                >
                  {/* Top row: Report No + Type badge */}
                  <View style={styles.cardTopRow}>
                    <Text style={styles.reportNoText}>{visit.reportNo}</Text>
                    <View style={styles.visitTypeBadge}>
                      <Text style={styles.visitTypeBadgeText}>{visit.visitType}</Text>
                    </View>
                  </View>

                  {/* Site & Client */}
                  <Text style={styles.siteNameText} numberOfLines={2}>
                    {visit.siteName}
                  </Text>
                  <Text style={styles.clientNameText}>{visit.clientName}</Text>

                  <View style={styles.divider} />

                  {/* Meta + Status */}
                  <View style={styles.cardBottomRow}>
                    <View style={styles.metaItem}>
                      <CalendarDays color="#64748B" size={13} style={{ marginRight: 4 }} />
                      <Text style={styles.metaText}>{visit.date}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                      <CheckCircle2 color="#10B981" size={12} style={{ marginRight: 4 }} />
                      <Text style={[styles.statusBadgeText, { color: '#10B981' }]}>{t('completed')}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* COMPLETED REPORT DETAIL MODAL (Web Format Sheet) */}
      <Modal
        visible={!!selectedReport}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedReport(null)}
      >
        <View style={styles.detailOverlay}>
          <View style={styles.detailContainer}>
            {/* Header */}
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailTitle}>{selectedReport?.reportNo}</Text>
                <Text style={styles.detailSubtitle}>{selectedReport?.visitType}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedReport(null)} style={styles.detailCloseBtn}>
                <X color="#94A3B8" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {/* Primary Report Info Card */}
              <View style={styles.detailSectionCard}>
                <Text style={styles.sectionHeading}>REPORT GENERAL INFORMATION</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Client Name:</Text>
                  <Text style={styles.infoValue}>{selectedReport?.clientName}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Site Name:</Text>
                  <Text style={styles.infoValue}>{selectedReport?.siteName}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Field Officer:</Text>
                  <Text style={styles.infoValue}>{selectedReport?.officer}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Visit Date:</Text>
                  <Text style={styles.infoValue}>{selectedReport?.date}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Audit Status:</Text>
                  <Text style={[styles.infoValue, { color: '#10B981', fontWeight: '800' }]}>COMPLETED</Text>
                </View>
              </View>

              {/* General Visit Details */}
              {selectedReport?.visitType === 'General Audit' && (
                <View style={styles.detailSectionCard}>
                  <Text style={styles.sectionHeading}>VISIT & AUDIT DETAILS</Text>
                  {selectedReport?.rawReport?.person_visited || selectedReport?.rawReport?.personVisited ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Person Visited:</Text>
                      <Text style={styles.infoValue}>
                        {selectedReport.rawReport.person_visited || selectedReport.rawReport.personVisited}
                      </Text>
                    </View>
                  ) : null}
                  {selectedReport?.rawReport?.reason_of_visit || selectedReport?.rawReport?.reasonOfVisit ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Reason for Visit:</Text>
                      <Text style={styles.infoValue}>
                        {selectedReport.rawReport.reason_of_visit || selectedReport.rawReport.reasonOfVisit}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Start Time:</Text>
                    <Text style={styles.infoValue}>
                      {selectedReport?.rawReport?.['check-in_time'] || selectedReport?.rawReport?.start_time || selectedReport?.rawReport?.startTime || '10:00'} (24-Hr Clock)
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>End Time:</Text>
                    <Text style={styles.infoValue}>
                      {selectedReport?.rawReport?.['check-out_time'] || selectedReport?.rawReport?.end_time || selectedReport?.rawReport?.endTime || '11:30'} (24-Hr Clock)
                    </Text>
                  </View>
                  {selectedReport?.rawReport?.remark ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={styles.infoLabel}>Audit Observations / Remarks:</Text>
                      <View style={styles.remarkBox}>
                        <Text style={styles.remarkText}>{selectedReport.rawReport.remark}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              )}

              {/* Day / Night Visit Details */}
              {selectedReport?.visitType !== 'General Audit' && (
                <>
                  <View style={styles.detailSectionCard}>
                    <Text style={styles.sectionHeading}>INSPECTION & SHIFT DETAILS</Text>
                    {selectedReport?.rawReport?.shift ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Shift:</Text>
                        <Text style={styles.infoValue}>{selectedReport.rawReport.shift}</Text>
                      </View>
                    ) : null}
                    {selectedReport?.rawReport?.overall_remarks ? (
                      <View style={{ marginTop: 10 }}>
                        <Text style={styles.infoLabel}>Officer Remarks:</Text>
                        <View style={styles.remarkBox}>
                          <Text style={styles.remarkText}>{selectedReport.rawReport.overall_remarks}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>

                  {/* Guards Inspected List */}
                  {Array.isArray(selectedReport?.rawReport?.guards) && selectedReport.rawReport.guards.length > 0 ? (
                    <View style={styles.detailSectionCard}>
                      <Text style={styles.sectionHeading}>GUARDS INSPECTED ({selectedReport.rawReport.guards.length})</Text>
                      {selectedReport.rawReport.guards.map((g: any, idx: number) => (
                        <View key={idx} style={styles.infoRow}>
                          <Text style={styles.infoLabel}>{g.name} ({g.empCode || g.emp_code || 'G'})</Text>
                          <Text style={styles.infoValue}>{g.status || g.dutyType || 'Alert'}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {/* Checklist Items */}
                  {Array.isArray(selectedReport?.rawReport?.checklist) && selectedReport.rawReport.checklist.length > 0 ? (
                    <View style={styles.detailSectionCard}>
                      <Text style={styles.sectionHeading}>AUDIT CHECKLIST ITEMS ({selectedReport.rawReport.checklist.length})</Text>
                      {selectedReport.rawReport.checklist.map((item: any, idx: number) => (
                        <View key={idx} style={styles.infoRow}>
                          <Text style={[styles.infoLabel, { flex: 1, paddingRight: 8 }]} numberOfLines={2}>
                            {item.question || item.title || String(item)}
                          </Text>
                          <Text style={[styles.infoValue, { color: item.status === 'Unsatisfactory' ? '#EF4444' : '#10B981' }]}>
                            {item.status || 'Satisfactory'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </>
              )}
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
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.3,
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
});
