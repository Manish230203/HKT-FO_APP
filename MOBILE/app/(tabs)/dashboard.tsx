import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Search,
  Fingerprint,
  LayoutGrid,
  CheckCircle2,
  Clock,
  Building2,
  MapPin,
  PlusCircle,
  Play,
  User,
  Settings,
  ChevronUp,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getPlannedVisits, getSites, Site, PlannedVisit } from '../../services/siteService';
import { getAttendanceRecords } from '../../services/attendanceService';
import { getPunchRecords } from '../../services/db';
import { getDayVisitReports, getNightVisitReports, getGeneralVisits } from '../../services/visitService';

export default function DashboardScreen() {
  const { user, profileImage } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [greeting, setGreeting] = useState('Good Day');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Visits View: null = Show Icon Grid, 'pending' | 'completed' = Show Detailed Table
  const [selectedVisitsView, setSelectedVisitsView] = useState<'pending' | 'completed' | null>(null);

  // Sites State
  const [sites, setSites] = useState<Site[]>([]);
  const [baseSiteName, setBaseSiteName] = useState('Main Base HQ');

  // Session timer state
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [sessionTime, setSessionTime] = useState('00:00:00');
  const [sessionStart, setSessionStart] = useState<Date | null>(null);

  // Visits Data
  const [plannedVisits, setPlannedVisits] = useState<PlannedVisit[]>([]);
  const [completedVisits, setCompletedVisits] = useState<Array<{
    id: string;
    reportNo: string;
    clientName: string;
    siteName: string;
    visitType: string;
    date: string;
    officer: string;
    status: string;
  }>>([]);

  useFocusEffect(
    useCallback(() => {
      updateGreeting();
      fetchDashboardData();
    }, [])
  );

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isCheckedIn && sessionStart) {
      timer = setInterval(() => {
        const diff = Math.floor((new Date().getTime() - sessionStart.getTime()) / 1000);
        const hrs = String(Math.floor(diff / 3600)).padStart(2, '0');
        const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const secs = String(diff % 60).padStart(2, '0');
        setSessionTime(`${hrs}:${mins}:${secs}`);
      }, 1000);
    } else {
      setSessionTime('00:00:00');
    }
    return () => clearInterval(timer);
  }, [isCheckedIn, sessionStart]);

  const updateGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning,');
    else if (hour < 17) setGreeting('Good Afternoon,');
    else setGreeting('Good Evening,');
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Sites
      const siteList = await getSites();
      setSites(siteList || []);
      if (siteList && siteList.length > 0) {
        setBaseSiteName(siteList[0].name || 'Main Base HQ');
      }

      // 2. Attendance (Check Active Punch-In from DB for current user)
      const empId = user?.employee_id || (user?.id ? String(user.id) : '');
      const punchLogs = await getPunchRecords(empId);
      const activePunch = punchLogs.find((r) => r.status === 'PUNCHED-IN' || r.punchOutTime === '--:--');

      if (activePunch) {
        setIsCheckedIn(true);
        const punchMs = activePunch.timestamp || Date.now();
        setSessionStart(new Date(punchMs));
      } else {
        setIsCheckedIn(false);
        setSessionStart(null);
        setSessionTime('00:00:00');
      }

      // 3. Planned / Pending Visits from backend API
      const planned = await getPlannedVisits();
      setPlannedVisits(planned || []);

      // 4. Completed Visit Reports from backend APIs
      const compiled: any[] = [];
      
      const dayReps = await getDayVisitReports();
      (dayReps || []).forEach((r: any) => {
        compiled.push({
          id: `day_${r.id}`,
          reportNo: r.reportNo || `DVR-${r.id}`,
          clientName: r.clientName || r.company || 'Client',
          siteName: r.site_name || r.unit || 'Site',
          visitType: 'Day Visit',
          date: r.visitDate || r.createdOn || today,
          officer: r.officer || user?.name || 'FO Officer',
          status: 'Completed',
        });
      });

      const nightReps = await getNightVisitReports();
      (nightReps || []).forEach((r: any) => {
        compiled.push({
          id: `night_${r.id}`,
          reportNo: r.reportNo || `NVR-${r.id}`,
          clientName: r.clientName || r.company || 'Client',
          siteName: r.site_name || r.unit || 'Site',
          visitType: 'Night Round',
          date: r.visitDate || r.createdOn || today,
          officer: r.officer || user?.name || 'FO Officer',
          status: 'Completed',
        });
      });

      const genReps = await getGeneralVisits();
      (genReps || []).forEach((r: any) => {
        compiled.push({
          id: `gen_${r.id}`,
          reportNo: r.report_no || `GVR-${r.id}`,
          clientName: r.client_name || 'Client',
          siteName: r.site_name || 'Site',
          visitType: 'General Audit',
          date: r.visit_date || today,
          officer: r.officer || user?.name || 'FO Officer',
          status: 'Completed',
        });
      });

      setCompletedVisits(compiled);
    } catch (e) {
      console.error('Failed to fetch dashboard data', e);
    } finally {
      setLoading(false);
    }
  };

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

  const onlyPendingPlannedVisits = plannedVisits.filter((pv) => {
    if (pv.status === 'Completed') return false;
    const done = pv.completedVisits || 0;
    const freq = pv.visitFrequency ? parseInt(String(pv.visitFrequency), 10) : (pv.frequency ? parseInt(String(pv.frequency), 10) : 1);
    if (done >= freq && freq > 0) return false;
    return true;
  });

  const filteredPlannedVisits = searchQuery
    ? onlyPendingPlannedVisits.filter(
        (v) =>
          (v.siteName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (v.clientName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (v.plannedPeriod || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (v.planCode || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : onlyPendingPlannedVisits;

  const filteredCompletedVisits = searchQuery
    ? completedVisits.filter(
        (v) =>
          v.reportNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.siteName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : completedVisits;

  const renderStatusBadge = (pv: PlannedVisit) => {
    const overdue = isVisitOverdue(pv);
    const done = pv.completedVisits || 0;
    const total = (pv.visitFrequency ? parseInt(String(pv.visitFrequency), 10) : (pv.frequency ? parseInt(String(pv.frequency), 10) : 1)) || 1;

    let statusText = 'Pending';
    let textColor = '#EF4444';
    let bgColor = 'rgba(239, 68, 68, 0.15)';
    let borderColor = 'rgba(239, 68, 68, 0.3)';

    if (overdue) {
      statusText = 'Overdue';
      textColor = '#EF4444';
      bgColor = 'rgba(239, 68, 68, 0.15)';
      borderColor = 'rgba(239, 68, 68, 0.3)';
    } else if (done > 0) {
      statusText = 'In Progress';
      textColor = '#3B82F6';
      bgColor = 'rgba(59, 130, 246, 0.15)';
      borderColor = 'rgba(59, 130, 246, 0.3)';
    } else {
      statusText = 'Pending';
      textColor = '#EF4444';
      bgColor = 'rgba(239, 68, 68, 0.15)';
      borderColor = 'rgba(239, 68, 68, 0.3)';
    }

    return (
      <View style={{ alignItems: 'flex-start' }}>
        <View style={[styles.statusBadge, { backgroundColor: bgColor, borderColor: borderColor }]}>
          <Text style={[styles.statusBadgeText, { color: textColor }]} numberOfLines={1}>
            {statusText}
          </Text>
        </View>
        <Text style={styles.visitsDoneText}>
          {done}/{total} Visits Done
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0A1128" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDashboardData} tintColor="#3B82F6" />}
      >
        {/* 1. Header Profile Card */}
        <View style={styles.standardCard}>
          <TouchableOpacity onPress={() => router.push('/profile')} style={styles.userProfileSection}>
            <View style={styles.avatarWrapper}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatarImage} />
              ) : (
                <User color="#FFFFFF" size={26} />
              )}
            </View>
            <View style={styles.userTextCol}>
              <Text style={styles.greetingText}>{greeting}</Text>
              <Text style={styles.userNameText}>{user?.name || 'Field Officer'}</Text>
              <Text style={styles.empIdText}>EMP ID: {user?.employee_id || 'EMP001'}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 2. Search Bar */}
        <View style={styles.searchBarContainer}>
          <Search color="#64748B" size={20} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search records, tasks, or sites..."
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* 3. Session Card */}
        <View style={styles.standardCard}>
          <View style={styles.sessionHeaderRow}>
            <View style={[styles.dot, isCheckedIn ? styles.dotActive : styles.dotInactive]} />
            <Text style={styles.sessionStatusText}>
              {isCheckedIn ? 'Active Session' : 'No Active Session'}
            </Text>
          </View>
          <Text style={styles.timerDigits}>{sessionTime}</Text>
        </View>

        {/* 4. Action Cards (MANUAL ATTENDANCE & ADD VISIT) */}
        <View style={styles.actionCardsRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/mark-attendance')}
            style={styles.actionCard}
          >
            <View style={[styles.actionIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
              <Fingerprint color="#3B82F6" size={30} />
            </View>
            <Text style={styles.actionCardTitle}>MANUAL{'\n'}ATTENDANCE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/visits/select-type')}
            style={styles.actionCard}
          >
            <View style={[styles.actionIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <PlusCircle color="#10B981" size={30} />
            </View>
            <Text style={styles.actionCardTitle}>ADD{'\n'}VISIT</Text>
          </TouchableOpacity>
        </View>

        {/* 5. FIELD OFFICER VISITS SECTION (Styled EXACTLY like Attendance Card) */}
        <View style={styles.standardCard}>
          <View style={styles.tableHeaderBar}>
            <Text style={styles.sectionTitleNoMargin}>FIELD OFFICER VISITS</Text>
            {selectedVisitsView !== null && (
              <TouchableOpacity
                onPress={() => setSelectedVisitsView(null)}
                style={styles.collapseBtn}
              >
                <ChevronUp color="#3B82F6" size={16} style={{ marginRight: 4 }} />
                <Text style={styles.collapseText}>Collapse</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* IF NO CARD CLICKED: SHOW MATCHING ICON GRID ITEMS (Pending Visits & Completed Visits) */}
          {selectedVisitsView === null ? (
            <View style={styles.gridItemsRow}>
              {/* Item 1: Pending Visits */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSelectedVisitsView('pending')}
                style={styles.gridItem}
              >
                <View style={styles.gridIconCircleWrapper}>
                  <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                    <Clock color="#3B82F6" size={24} />
                  </View>
                  {onlyPendingPlannedVisits.length > 0 && (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{onlyPendingPlannedVisits.length}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.gridItemLabel}>Pending Visits</Text>
              </TouchableOpacity>

              {/* Item 2: Completed Visits */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSelectedVisitsView('completed')}
                style={styles.gridItem}
              >
                <View style={styles.gridIconCircleWrapper}>
                  <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                    <CheckCircle2 color="#10B981" size={24} />
                  </View>
                  {completedVisits.length > 0 && (
                    <View style={[styles.countBadge, { backgroundColor: '#10B981' }]}>
                      <Text style={styles.countBadgeText}>{completedVisits.length}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.gridItemLabel}>Completed Visits</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* IF A CARD IS CLICKED: DISPLAY DETAILED TABLE FORMAT WITH TAB TOGGLE */
            <View>
              {/* Tab Toggle Buttons */}
              <View style={styles.tabToggleRow}>
                <TouchableOpacity
                  onPress={() => setSelectedVisitsView('pending')}
                  style={[styles.tabBtn, selectedVisitsView === 'pending' && styles.tabBtnActive]}
                >
                  <Text style={[styles.tabBtnText, selectedVisitsView === 'pending' && styles.tabBtnTextActive]}>
                    Pending Visits ({onlyPendingPlannedVisits.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setSelectedVisitsView('completed')}
                  style={[styles.tabBtn, selectedVisitsView === 'completed' && styles.tabBtnActive]}
                >
                  <Text style={[styles.tabBtnText, selectedVisitsView === 'completed' && styles.tabBtnTextActive]}>
                    Completed Visits ({completedVisits.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* TAB CONTENT: PENDING VISITS TABLE */}
              {selectedVisitsView === 'pending' && (
                filteredPlannedVisits.length === 0 ? (
                  <View style={styles.emptyTableBox}>
                    <Text style={styles.emptyTableText}>No pending visits scheduled for today.</Text>
                  </View>
                ) : (
                  <View style={styles.tableContainer}>
                    <View style={styles.tableHeadRow}>
                      <Text style={[styles.thCell, { flex: 1.2 }]}>PLANNED PERIOD</Text>
                      <Text style={[styles.thCell, { flex: 1.4 }]}>SITE / CLIENT</Text>
                      <Text style={[styles.thCell, { flex: 1.3 }]}>STATUS</Text>
                      <Text style={[styles.thCell, { flex: 0.9, textAlign: 'right' }]}>ACTION</Text>
                    </View>

                    {filteredPlannedVisits.map((pv) => (
                      <View key={pv.id} style={styles.tableBodyRow}>
                        <View style={{ flex: 1.2 }}>
                          <Text style={styles.reportNoText} numberOfLines={2}>
                            {pv.plannedPeriod || pv.date || 'Planned Period'}
                          </Text>
                          {pv.planCode ? <Text style={styles.dateSubText}>{pv.planCode}</Text> : null}
                        </View>

                        <View style={{ flex: 1.4 }}>
                          <Text style={styles.siteNameCell} numberOfLines={1}>{pv.siteName || 'Site'}</Text>
                          <Text style={styles.clientSubText} numberOfLines={1}>{pv.clientName || 'Client'}</Text>
                        </View>

                        <View style={{ flex: 1.3, justifyContent: 'center' }}>
                          {renderStatusBadge(pv)}
                        </View>

                        <TouchableOpacity
                          onPress={() =>
                            router.push(
                              `/visits/select-type?clientId=${pv.clientId || ''}&siteId=${pv.siteId || ''}&plannedId=${pv.id}`
                            )
                          }
                          style={styles.startVisitBtn}
                        >
                          <Play color="#FFFFFF" size={12} style={{ marginRight: 4 }} />
                          <Text style={styles.startVisitText}>Start</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )
              )}

              {/* TAB CONTENT: COMPLETED VISITS TABLE */}
              {selectedVisitsView === 'completed' && (
                filteredCompletedVisits.length === 0 ? (
                  <View style={styles.emptyTableBox}>
                    <Text style={styles.emptyTableText}>No completed visit reports submitted yet.</Text>
                  </View>
                ) : (
                  <View style={styles.tableContainer}>
                    <View style={styles.tableHeadRow}>
                      <Text style={[styles.thCell, { flex: 1.2 }]}>REPORT NO / DATE</Text>
                      <Text style={[styles.thCell, { flex: 1.4 }]}>SITE / CLIENT</Text>
                      <Text style={[styles.thCell, { flex: 1 }]}>TYPE</Text>
                      <Text style={[styles.thCell, { flex: 1.2, textAlign: 'right' }]}>STATUS</Text>
                    </View>

                    {filteredCompletedVisits.slice(0, 10).map((visit) => (
                      <View key={visit.id} style={styles.tableBodyRow}>
                        <View style={{ flex: 1.2 }}>
                          <Text style={styles.reportNoText}>{visit.reportNo}</Text>
                          <Text style={styles.dateSubText}>{visit.date}</Text>
                        </View>

                        <View style={{ flex: 1.4 }}>
                          <Text style={styles.siteNameCell} numberOfLines={1}>{visit.siteName}</Text>
                          <Text style={styles.clientSubText} numberOfLines={1}>{visit.clientName}</Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.visitTypeBadgeText}>{visit.visitType}</Text>
                        </View>

                        <View style={{ flex: 1.2, alignItems: 'flex-end', justifyContent: 'center' }}>
                          <View style={[styles.statusBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
                            <Text style={[styles.statusBadgeText, { color: '#10B981' }]} numberOfLines={1}>
                              Completed
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )
              )}
            </View>
          )}
        </View>

        {/* 6. ATTENDANCE CARD */}
        <View style={styles.standardCard}>
          <Text style={styles.sectionTitle}>ATTENDANCE</Text>

          <View style={styles.gridItemsRow}>
            <TouchableOpacity
              onPress={() => router.push('/attendance?view=dashboard')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <LayoutGrid color="#3B82F6" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>Dashboard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/attendance?view=logs')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <CheckCircle2 color="#10B981" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>Attendance Log</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/attendance?view=missed')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <Clock color="#F59E0B" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>Missed Punches</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 7. PROFILE & SETTINGS CARD */}
        <View style={styles.standardCard}>
          <Text style={styles.sectionTitle}>PROFILE & SETTINGS</Text>

          <View style={styles.gridItemsRow}>
            <TouchableOpacity
              onPress={() => router.push('/profile')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(236, 72, 153, 0.15)' }]}>
                <User color="#EC4899" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/settings')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(148, 163, 184, 0.15)' }]}>
                <Settings color="#94A3B8" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 8. SITES SECTION (Styled EXACTLY like Attendance Card) */}
        <View style={styles.standardCard}>
          <Text style={styles.sectionTitle}>SITES</Text>

          <View style={styles.gridItemsRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/sites')}
              style={styles.gridItem}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <Building2 color="#3B82F6" size={24} />
              </View>
              <Text style={styles.gridItemLabel}>My Base Site</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/sites')}
              style={styles.gridItem}
            >
              <View style={styles.gridIconCircleWrapper}>
                <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <MapPin color="#10B981" size={24} />
                </View>
                {sites.length > 0 && (
                  <View style={[styles.countBadge, { backgroundColor: '#10B981' }]}>
                    <Text style={styles.countBadgeText}>{sites.length}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.gridItemLabel}>Allocated Sites</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.copyrightText}>© 2026 HUMANKIND TECHNOLOGY</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#0A1128',
  },
  container: {
    flex: 1,
    backgroundColor: '#0A1128',
  },
  content: {
    padding: 16,
    paddingTop: Platform.OS === 'android' ? 24 : 12,
    paddingBottom: 40,
  },

  /* UNIFIED STANDARD CARD DESIGN (Matching Attendance Container Card) */
  standardCard: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  /* Header Card Details */
  userProfileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 2,
    borderColor: '#3B82F6',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
  },
  userTextCol: {
    justifyContent: 'center',
  },
  greetingText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  userNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  empIdText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '700',
    marginTop: 2,
  },

  /* Search Bar */
  searchBarContainer: {
    backgroundColor: '#131C33',
    borderRadius: 24,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },

  /* Session Blue Card */
  sessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotActive: {
    backgroundColor: '#10B981',
  },
  dotInactive: {
    backgroundColor: '#93C5FD',
  },
  sessionStatusText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  timerDigits: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '800',
    marginTop: 8,
    letterSpacing: 1,
  },

  /* Action Cards Row */
  actionCardsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#131C33',
    borderRadius: 24,
    padding: 20,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    height: 150,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  actionIconBox: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  actionCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 18,
    letterSpacing: 0.3,
  },

  /* Features Container Section Titles */
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  sectionTitleNoMargin: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.8,
  },

  /* UNIFIED ICON GRID ROW (ATTENDANCE / VISITS / SETTINGS / SITES) */
  gridItemsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  gridItem: {
    alignItems: 'center',
    flex: 1,
  },
  gridIconCircleWrapper: {
    position: 'relative',
  },
  gridIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  gridItemLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  countBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  collapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  collapseText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
  },

  /* Visits Section with Tab Toggle */
  tableHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  tabToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: '#3B82F6',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
  },
  emptyTableBox: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyTableText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  tableContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeadRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  thCell: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  reportNoText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
  },
  dateSubText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  siteNameCell: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  clientSubText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  visitTypeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 14,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  visitsDoneText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 3,
    fontWeight: '500',
  },
  startVisitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  startVisitText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  copyrightText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 20,
  },
});
