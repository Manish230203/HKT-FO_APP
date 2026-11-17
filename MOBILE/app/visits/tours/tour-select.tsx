import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StatusBar,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  ArrowLeft,
  Building2,
  Compass,
  Clock,
  CheckCircle2,
  Play,
  RotateCcw,
  Shield,
  Layers,
  ChevronRight,
  Search,
  X,
} from 'lucide-react-native';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../context/LanguageContext';
import {
  getQuickLocation,
  TourItem,
  TourDraft,
  getAssignedToursForSite,
  getAssignedToursForCustomVisit,
  getAllDatabaseTours,
  getTourBlueprint,
  startTourVisit,
  saveTourDraft,
  getActiveTourDrafts,
  generateUUID,
} from '../../../services/siteTourService';
import * as Location from 'expo-location';

export default function TourSelectScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();

  const params = useLocalSearchParams<{
    siteId?: string;
    siteName?: string;
    customVisitId?: string;
    clientName?: string;
    sessionId?: string;
    plannedId?: string;
  }>();

  const siteId = params.siteId ? parseInt(params.siteId, 10) : undefined;
  const customVisitId = params.customVisitId ? parseInt(params.customVisitId, 10) : undefined;
  const isGlobalTourView = !siteId && !customVisitId;
  const siteName = params.siteName ? decodeURIComponent(params.siteName) : (customVisitId ? 'Custom Site' : 'Site Location');
  const clientName = params.clientName ? decodeURIComponent(params.clientName) : '';
  const sessionId = params.sessionId ? parseInt(params.sessionId, 10) : undefined;
  const plannedId = params.plannedId || '';

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [tours, setTours] = useState<TourItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeDrafts, setActiveDrafts] = useState<Record<number, TourDraft>>({});
  const [startingTourOid, setStartingTourOid] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      let tourList: TourItem[] = [];

      if (siteId) {
        tourList = await getAssignedToursForSite(siteId);
      } else if (customVisitId) {
        tourList = await getAssignedToursForCustomVisit(customVisitId);
      } else {
        tourList = await getAllDatabaseTours();
      }

      setTours(tourList);

      // Check existing drafts for resume
      const drafts = await getActiveTourDrafts();
      const draftMap: Record<number, TourDraft> = {};
      drafts.forEach((d) => {
        if (
          isGlobalTourView ||
          (siteId && d.site_id === siteId) ||
          (customVisitId && d.custom_visit_id === customVisitId)
        ) {
          draftMap[d.tour_oid] = d;
        }
      });
      setActiveDrafts(draftMap);
    } catch (e: any) {
      console.error('Error loading tours:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [siteId, customVisitId, isGlobalTourView]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const filteredTours = useMemo(() => {
    if (!searchQuery.trim()) return tours;
    const q = searchQuery.toLowerCase().trim();
    return tours.filter((tour) => {
      const titleMatch = (tour.title || '').toLowerCase().includes(q);
      const descMatch = (tour.description || '').toLowerCase().includes(q);
      const siteMatch = (tour.site_name || '').toLowerCase().includes(q);
      const clientMatch = (tour.client_name || '').toLowerCase().includes(q);
      return titleMatch || descMatch || siteMatch || clientMatch;
    });
  }, [tours, searchQuery]);

  const handleStartOrResumeTour = async (tour: TourItem) => {
    try {
      setStartingTourOid(tour.tour_oid);

      const effectiveSiteId = siteId || tour.site_id;
      const effectiveSiteName = (!isGlobalTourView && siteName && siteName !== 'Site Location' && siteName !== 'Custom Site')
        ? siteName
        : (tour.site_name || 'Site Location');
      const effectiveClientName = clientName || tour.client_name || '';

      const existingDraft = activeDrafts[tour.tour_oid];
      if (existingDraft && existingDraft.sync_status === 'in_progress') {
        // Resume existing draft
        router.push({
          pathname: '/visits/tours/tour-execute',
          params: {
            executionUuid: existingDraft.execution_uuid,
            tourOid: String(tour.tour_oid),
            siteId: effectiveSiteId ? String(effectiveSiteId) : '',
            siteName: encodeURIComponent(effectiveSiteName),
            customVisitId: customVisitId ? String(customVisitId) : '',
            clientName: encodeURIComponent(effectiveClientName),
            sessionId: sessionId ? String(sessionId) : '',
            plannedId: plannedId,
          },
        });
        return;
      }

      // Fetch Blueprint
      const blueprint = await getTourBlueprint(tour.tour_oid, effectiveSiteId, customVisitId);
      if (!blueprint || blueprint.checkpoints.length === 0) {
        Alert.alert(
          t('error') || 'Error',
          t('failed_load_checkpoints') || 'Failed to load tour checkpoints and questions. Please check network connection.'
        );
        return;
      }

      // Generate UUID for idempotency key
      const executionUuid = generateUUID();

      let lat = 0;
      let lng = 0;
      try {
        const loc = await getQuickLocation();
        lat = loc.latitude;
        lng = loc.longitude;
      } catch (err) {
        // Location fallback
      }

      // Initialize checkpoint executions (All active in open checkpoint mode - start from anywhere)
      const initialCheckpoints: Record<number, any> = {};
      blueprint.checkpoints.forEach((cp) => {
        initialCheckpoints[cp.oid] = {
          checkpoint_oid: cp.oid,
          status: 'active',
          verification_status: 'unverified',
          responses: {},
        };
      });

      const newDraft: TourDraft = {
        execution_uuid: executionUuid,
        tour_oid: tour.tour_oid,
        tour_title: tour.title,
        site_id: effectiveSiteId,
        custom_visit_id: customVisitId,
        site_name: effectiveSiteName,
        client_name: effectiveClientName,
        session_id: sessionId,
        started_at: new Date().toISOString(),
        sync_status: 'in_progress',
        checkpoints: initialCheckpoints,
        blueprint: blueprint,
        last_saved_at: new Date().toISOString(),
        version: 1,
      };

      // Start on backend (optional non-blocking)
      try {
        const startRes = await startTourVisit({
          tour_oid: tour.tour_oid,
          site_oid: effectiveSiteId,
          custom_visit_oid: customVisitId,
          session_id: sessionId,
          execution_uuid: executionUuid,
          start_latitude: lat,
          start_longitude: lng,
        });
        if (startRes && startRes.tour_visit_oid) {
          newDraft.tour_visit_oid = startRes.tour_visit_oid;
        }
      } catch (apiErr) {
        console.warn('Backend tour start call offline/pending:', apiErr);
      }

      // Save draft atomically
      await saveTourDraft(newDraft);

      // Navigate to execute
      router.push({
        pathname: '/visits/tours/tour-execute',
        params: {
          executionUuid: executionUuid,
          tourOid: String(tour.tour_oid),
          tourVisitOid: newDraft.tour_visit_oid ? String(newDraft.tour_visit_oid) : '',
          siteId: effectiveSiteId ? String(effectiveSiteId) : '',
          siteName: encodeURIComponent(effectiveSiteName),
          customVisitId: customVisitId ? String(customVisitId) : '',
          clientName: encodeURIComponent(effectiveClientName),
          sessionId: sessionId ? String(sessionId) : '',
          plannedId: plannedId,
        },
      });
    } catch (e: any) {
      console.error('Error starting tour:', e);
      Alert.alert(t('error') || 'Error', e?.message || 'Unable to start tour');
    } finally {
      setStartingTourOid(null);
    }
  };

  const darkNavyBg = isDark ? '#0A1128' : '#F4F7FA';
  const cardBg = isDark ? '#131C33' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subTextColor = isDark ? '#94A3B8' : '#64748B';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: darkNavyBg }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header Bar */}
      <View style={[styles.header, { borderBottomColor: cardBorder }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}
          activeOpacity={0.8}
        >
          <ArrowLeft color={textColor} size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: '#3B82F6' }]}>
            {isGlobalTourView ? 'Patrolling Tours' : 'Site Patrolling Tours'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: subTextColor }]}>
            {isGlobalTourView
              ? 'Browse & execute all tours configured in database'
              : 'Select an assigned checkpoint checklist tour'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
        showsVerticalScrollIndicator={false}
      >
        {/* If Specific Site: Show Site Card. If Global: Show Search Bar */}
        {!isGlobalTourView ? (
          <View style={[styles.siteCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.siteCardHeader}>
              <View style={styles.siteIconBox}>
                <Building2 color="#3B82F6" size={22} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.siteNameText, { color: textColor }]} numberOfLines={1}>
                  {siteName}
                </Text>
                {clientName ? (
                  <Text style={[styles.clientNameText, { color: subTextColor }]} numberOfLines={1}>
                    {clientName}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.searchContainer, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Search color={subTextColor} size={18} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: textColor }]}
              placeholder="Search tours, sites, or clients..."
              placeholderTextColor={subTextColor}
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X color={subTextColor} size={16} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Section Title */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>
            {isGlobalTourView ? 'All Database Tours' : 'Available Tours'}
          </Text>
          <Text style={[styles.sectionCount, { color: '#3B82F6' }]}>
            {filteredTours.length} {filteredTours.length === 1 ? 'Tour' : 'Tours'}
          </Text>
        </View>

        {/* Tour Cards */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={[styles.loadingText, { color: subTextColor }]}>
              {isGlobalTourView ? 'Loading database tours...' : 'Loading assigned tours...'}
            </Text>
          </View>
        ) : filteredTours.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Shield color="#64748B" size={40} />
            <Text style={[styles.emptyTitle, { color: textColor }]}>No Tours Found</Text>
            <Text style={[styles.emptyDesc, { color: subTextColor }]}>
              {isGlobalTourView
                ? (searchQuery ? 'No tours match your search query.' : 'There are no patrolling tours present in the database.')
                : `There are no patrolling tours assigned to ${siteName} at this time.`}
            </Text>
          </View>
        ) : (
          filteredTours.map((tour) => {
            const draft = activeDrafts[tour.tour_oid];
            const hasActiveDraft = Boolean(draft && draft.sync_status === 'in_progress');
            const isStarting = startingTourOid === tour.tour_oid;

            return (
              <View
                key={`tour_${tour.tour_oid}`}
                style={[
                  styles.tourCard,
                  {
                    backgroundColor: cardBg,
                    borderColor: hasActiveDraft ? '#3B82F6' : cardBorder,
                  },
                ]}
              >
                <View style={styles.tourCardTopRow}>
                  <View style={styles.tourIconCircle}>
                    <Compass color="#3B82F6" size={24} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.tourTitle, { color: textColor }]}>{tour.title}</Text>
                    {tour.description ? (
                      <Text style={[styles.tourDesc, { color: subTextColor }]}>{tour.description}</Text>
                    ) : null}
                  </View>
                </View>

                {/* Site & Client Tag if viewing globally or assigned */}
                {(tour.site_name || tour.client_name) && (
                  <View style={[styles.tourSiteBadge, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF' }]}>
                    <Building2 color="#3B82F6" size={13} style={{ marginRight: 6 }} />
                    <Text style={[styles.tourSiteBadgeText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]} numberOfLines={1}>
                      {tour.site_name || 'Site'}{tour.client_name ? ` • ${tour.client_name}` : ''}
                    </Text>
                  </View>
                )}

                {/* Tour Meta Info */}
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Layers color="#3B82F6" size={14} />
                    <Text style={[styles.metaText, { color: textColor }]}>
                      {tour.total_checkpoints} {tour.total_checkpoints === 1 ? 'Checkpoint' : 'Checkpoints'}
                    </Text>
                  </View>
                  <View style={styles.metaDivider} />
                  <View style={styles.metaItem}>
                    <Clock color="#F59E0B" size={14} />
                    <Text style={[styles.metaText, { color: textColor }]}>
                      ~{tour.estimated_duration_minutes} mins
                    </Text>
                  </View>
                  {tour.is_mandatory && (
                    <>
                      <View style={styles.metaDivider} />
                      <View style={styles.mandatoryBadge}>
                        <Text style={styles.mandatoryText}>MANDATORY</Text>
                      </View>
                    </>
                  )}
                </View>

                {/* Start / Resume Action Button */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={isStarting}
                  onPress={() => handleStartOrResumeTour(tour)}
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: hasActiveDraft ? '#2563EB' : '#3B82F6',
                    },
                  ]}
                >
                  {isStarting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : hasActiveDraft ? (
                    <>
                      <RotateCcw color="#FFFFFF" size={18} />
                      <Text style={styles.actionBtnText}>Resume Tour In Progress</Text>
                    </>
                  ) : (
                    <>
                      <Play color="#FFFFFF" size={18} />
                      <Text style={styles.actionBtnText}>Start Tour Checklist</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  siteCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  siteCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  siteIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  siteNameText: {
    fontSize: 16,
    fontWeight: '700',
  },
  clientNameText: {
    fontSize: 13,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  tourSiteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 10,
  },
  tourSiteBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyBox: {
    padding: 30,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  tourCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 12,
  },
  tourCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tourIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tourTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  tourDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#64748B',
  },
  mandatoryBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  mandatoryText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    marginTop: 4,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
