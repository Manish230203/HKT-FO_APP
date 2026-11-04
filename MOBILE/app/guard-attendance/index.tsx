import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import {
  ArrowLeft,
  Search,
  ChevronRight,
  Shield,
  Users,
  AlertTriangle,
  CheckCircle2,
  Building2,
  RefreshCw,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  getAssignedSitesAttendance,
  AssignedSiteItem,
  AssignedSitesSummary,
} from '../../services/guardAttendanceService';

export default function AssignedSitesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sites, setSites] = useState<AssignedSiteItem[]>([]);
  const [summary, setSummary] = useState<AssignedSitesSummary>({
    total_sites: 0,
    total_present: 0,
    total_required: 0,
    total_shortage: 0,
    overall_percentage: 0,
  });

  const officerCode = useMemo(() => {
    return (user as any)?.emp_code || (user as any)?.employee_code || (user as any)?.employee_id || `FO-${user?.id || 10208}`;
  }, [user]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getAssignedSitesAttendance(user?.id);
      if (res) {
        setSites(res.sites || []);
        if (res.summary) {
          setSummary(res.summary);
        }
      }
    } catch (err) {
      console.error('Error fetching assigned sites attendance:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Filter sites by search
  const filteredSites = useMemo(() => {
    if (!searchQuery.trim()) return sites;
    const q = searchQuery.toLowerCase().trim();
    return sites.filter(
      (s) =>
        s.site_name.toLowerCase().includes(q) ||
        (s.site_code && s.site_code.toLowerCase().includes(q)) ||
        (s.client_name && s.client_name.toLowerCase().includes(q))
    );
  }, [sites, searchQuery]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isDark ? '#0A1128' : colors.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      {/* Hide Expo Router stack header to eliminate duplicate top bar & second back button */}
      <Stack.Screen options={{ headerShown: false }} />

      {/* TOP NAVIGATION BAR */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.navIconButton}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft color="#FFFFFF" size={22} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Assigned Sites</Text>
          <View style={styles.officerBadgeRow}>
            <Shield color="#00D2FF" size={12} />
            <Text style={styles.officerCodeText}>{officerCode}</Text>
          </View>
        </View>

        <TouchableOpacity onPress={onRefresh} style={styles.navIconButton} activeOpacity={0.7}>
          <RefreshCw color="#94A3B8" size={18} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D2FF" />}
        showsVerticalScrollIndicator={false}
      >
        {/* SEARCH BAR */}
        <View style={styles.searchContainer}>
          <Search color="#64748B" size={18} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search assigned sites by name or code..."
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
        </View>

        {/* AGGREGATE SUMMARY BANNER */}
        <View style={styles.summaryBanner}>
          <View style={styles.summaryBannerLeft}>
            <Text style={styles.summaryCountText}>{summary.total_sites}</Text>
            <Text style={styles.summarySubText}>Assigned Sites Active</Text>
          </View>
          <View style={styles.summaryBannerDivider} />
          <View style={styles.summaryBannerRight}>
            <Text style={styles.summaryDutyText}>
              {summary.total_live_present ?? summary.total_present} / {summary.total_required} Live Present
            </Text>
            <Text style={styles.summaryDutySubText}>
              Deployed: {summary.total_deployed ?? summary.total_present} • ({summary.overall_percentage}% Present)
            </Text>
          </View>
        </View>

        {/* SITES LIST */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00D2FF" />
            <Text style={styles.loadingText}>Loading assigned sites...</Text>
          </View>
        ) : filteredSites.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Building2 color="#475569" size={48} />
            <Text style={styles.emptyTitle}>No Assigned Sites Found</Text>
            <Text style={styles.emptyDesc}>
              {searchQuery ? 'No assigned sites match your search.' : 'No sites are currently assigned to your employee code in the database.'}
            </Text>
          </View>
        ) : (
          filteredSites.map((item) => {
            const livePresent = item.live_present ?? item.present;
            const deployed = item.deployed ?? item.present;
            const isOptimal = item.shortage === 0;
            return (
              <TouchableOpacity
                key={item.site_id}
                style={styles.siteCard}
                activeOpacity={0.85}
                onPress={() => {
                  router.push({
                    pathname: '/guard-attendance/[siteId]',
                    params: {
                      siteId: String(item.site_id),
                      siteName: item.site_name,
                      siteCode: item.site_code,
                      clientName: item.client_name,
                    },
                  });
                }}
              >
                <View style={styles.siteCardLeft}>
                  {/* Site Title */}
                  <Text style={styles.siteNameText} numberOfLines={1}>
                    {item.site_name}
                  </Text>
                  {/* Client Subtitle */}
                  <Text style={styles.siteClientText} numberOfLines={1}>
                    Client: {item.client_name}
                  </Text>

                  {/* Badges Row (Option B: Both Deployed Strength & Live Present) */}
                  <View style={styles.badgeRow}>
                    {/* Live Present Badge */}
                    <View style={[styles.presentBadge, livePresent === 0 && styles.zeroPresentBadge]}>
                      <Text style={[styles.presentBadgeText, livePresent === 0 && styles.zeroPresentBadgeText]}>
                        {livePresent} / {item.required} Live Present
                      </Text>
                    </View>

                    {/* Deployed Roster Strength Badge */}
                    <View style={styles.deployedBadge}>
                      <Text style={styles.deployedBadgeText}>
                        {deployed} Deployed
                      </Text>
                    </View>

                    {/* Shortage or Optimal Badge */}
                    {isOptimal ? (
                      <View style={styles.optimalBadge}>
                        <CheckCircle2 color="#10B981" size={12} />
                        <Text style={styles.optimalBadgeText}>Optimal</Text>
                      </View>
                    ) : (
                      <View style={styles.shortageBadge}>
                        <AlertTriangle color="#F59E0B" size={12} />
                        <Text style={styles.shortageBadgeText}>
                          Shortage: -{item.shortage}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Right Arrow Chevron */}
                <View style={styles.chevronContainer}>
                  <ChevronRight color="#00D2FF" size={22} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  navIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  officerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  officerCodeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1A36',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    height: 46,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1A36',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#06B6D4',
    padding: 14,
    marginBottom: 18,
    shadowColor: '#06B6D4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  summaryBannerLeft: {
    flex: 1,
  },
  summaryCountText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  summarySubText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  summaryBannerDivider: {
    width: 1,
    height: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginHorizontal: 14,
  },
  summaryBannerRight: {
    flex: 2,
  },
  summaryDutyText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
  },
  summaryDutySubText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  loadingContainer: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 12,
  },
  emptyContainer: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyDesc: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 24,
  },
  siteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F1A36',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    marginBottom: 12,
  },
  siteCardLeft: {
    flex: 1,
    marginRight: 10,
  },
  siteNameText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  siteClientText: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  presentBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  presentBadgeText: {
    color: '#22C55E',
    fontSize: 11,
    fontWeight: '700',
  },
  zeroPresentBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  zeroPresentBadgeText: {
    color: '#F87171',
  },
  deployedBadge: {
    backgroundColor: 'rgba(0, 210, 255, 0.12)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 210, 255, 0.35)',
  },
  deployedBadgeText: {
    color: '#00D2FF',
    fontSize: 11,
    fontWeight: '700',
  },
  optimalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  optimalBadgeText: {
    color: '#22C55E',
    fontSize: 11,
    fontWeight: '700',
  },
  shortageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  shortageBadgeText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
  },
  deploymentPctText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  chevronContainer: {
    paddingLeft: 6,
  },
});
