import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Building, Shield, ChevronRight, ChevronDown } from 'lucide-react-native';
import { getSites, Site } from '../../services/siteService';
import { useLanguage } from '../../context/LanguageContext';
import { THEME } from '../../constants/theme';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { SwipeableBackWrapper } from '../../components/SwipeableBackWrapper';

export default function SitesScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchSitesData();
  }, []);

  const fetchSitesData = async () => {
    setLoading(true);
    try {
      const data = await getSites();
      setSites(data || []);
      const initialExpanded: Record<string, boolean> = {};
      data.forEach((item) => {
        const client = item.client_name || 'Assigned Client';
        initialExpanded[client] = true;
      });
      setExpandedClients(initialExpanded);
    } catch (e) {
      console.error('Error fetching sites', e);
    } finally {
      setLoading(false);
    }
  };

  const groupedSites = useMemo(() => {
    const groups: Record<string, Site[]> = {};
    sites.forEach((site) => {
      const client = site.client_name || 'Assigned Client';
      if (!groups[client]) groups[client] = [];
      groups[client].push(site);
    });
    return groups;
  }, [sites]);

  const filteredGroupedSites = useMemo(() => {
    if (!searchQuery) return groupedSites;
    const query = searchQuery.toLowerCase();
    const result: Record<string, Site[]> = {};

    Object.keys(groupedSites).forEach((clientName) => {
      const matched = groupedSites[clientName].filter(
        (s) =>
          s.name?.toLowerCase().includes(query) ||
          clientName.toLowerCase().includes(query) ||
          s.branch_name?.toLowerCase().includes(query)
      );
      if (matched.length > 0) {
        result[clientName] = matched;
      }
    });
    return result;
  }, [groupedSites, searchQuery]);

  const toggleExpand = (clientName: string) => {
    setExpandedClients((prev) => ({
      ...prev,
      [clientName]: !prev[clientName],
    }));
  };

  return (
    <SwipeableBackWrapper>
      <View style={styles.container}>
        <View style={styles.searchBar}>
          <Input
            placeholder={t('search_sites')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchSitesData} tintColor="#FFFFFF" />}
        >
          {Object.keys(filteredGroupedSites).length === 0 ? (
            <Card style={styles.emptyCard}>
              <Building color={THEME.textVariant} size={32} />
              <Text style={styles.emptyText}>No assigned sites found.</Text>
            </Card>
          ) : (
            Object.keys(filteredGroupedSites).map((clientName) => {
              const clientSites = filteredGroupedSites[clientName];
              const isExpanded = !!expandedClients[clientName];

              return (
                <View key={clientName} style={styles.clientGroup}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => toggleExpand(clientName)}
                    style={styles.clientHeader}
                  >
                    <View style={styles.clientHeaderLeft}>
                      <Building color={THEME.primary} size={20} />
                      <Text style={styles.clientTitle}>{clientName}</Text>
                      <Badge label={`${clientSites.length}`} variant="info" />
                    </View>
                    {isExpanded ? (
                      <ChevronDown color={THEME.textVariant} size={20} />
                    ) : (
                      <ChevronRight color={THEME.textVariant} size={20} />
                    )}
                  </TouchableOpacity>

                  {isExpanded &&
                    clientSites.map((site) => (
                      <Card
                        key={site.id}
                        onPress={() =>
                          router.push(
                            `/visits/select-type?clientId=${site.client_id || ''}&siteId=${site.id}`
                          )
                        }
                        style={styles.siteCard}
                      >
                        <View style={styles.siteRow}>
                          <View style={styles.shieldBox}>
                            <Shield color={THEME.secondary} size={18} />
                          </View>
                          <View style={styles.siteInfo}>
                            <Text style={styles.siteTitle}>{site.name}</Text>
                            {site.branch_name ? (
                              <Text style={styles.branchText}>{site.branch_name}</Text>
                            ) : null}
                          </View>
                          <ChevronRight color={THEME.textVariant} size={18} />
                        </View>
                      </Card>
                    ))}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </SwipeableBackWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  searchBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  searchInput: {
    height: 44,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: THEME.textVariant,
    fontSize: THEME.typography.xs,
    marginTop: 8,
  },
  clientGroup: {
    marginBottom: 16,
  },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    marginBottom: 8,
  },
  clientHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clientTitle: {
    fontSize: THEME.typography.sm,
    fontWeight: '700',
    color: THEME.text,
    textTransform: 'uppercase',
  },
  siteCard: {
    marginVertical: 4,
    marginLeft: 12,
    padding: 12,
  },
  siteRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shieldBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  siteInfo: {
    flex: 1,
  },
  siteTitle: {
    fontSize: THEME.typography.sm,
    fontWeight: '600',
    color: THEME.text,
  },
  branchText: {
    fontSize: THEME.typography.xs,
    color: THEME.textVariant,
    marginTop: 2,
  },
});
