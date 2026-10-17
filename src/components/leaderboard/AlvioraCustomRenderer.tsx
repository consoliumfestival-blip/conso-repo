import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Building2,
  Calendar,
  ChevronDown,
  ClipboardList,
  Clock,
  Crown,
  LogIn,
  MapPin,
  Medal,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
} from 'lucide-react-native';
import { LeaderboardRow, PublicPublishedResultRow, leaderboardService } from '../../services/leaderboardService';
import { usePublicLeaderboard, usePublicPublishedResults } from '../../core/hooks/useLeaderboard';
import { useGetPublicLeaderboardSettings } from '../../core/hooks/useLeaderboardSettings';
import { fetchPublicSchedules, usePublicSchedule } from '../../core/hooks/useSchedule';
import PublicAiChatbot from '../../components/leaderboard/PublicAiChatbot';
import { useAuthStore } from '../../core/store/authStore';
import { Bell } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEADERBOARD_QUERY_KEYS } from '../../constants/leaderboard';
import { supabase } from '../../core/config/supabase';

type ActiveTab = 'organisations' | 'individuals';
type Breakpoint = 'desktop' | 'tablet' | 'mobile';
type PublicLeaderboardPage = 'landing' | 'units' | 'items' | 'schedule';

type RankingViewRow = {
  id: string;
  name: string;
  subtitle: string;
  points: number;
  rank: number;
  badgeLabel: string;
  accent: string;
  profileSlug?: string | null;
};

type ItemResultRow = {
  id: string;
  name: string;
  organisationName: string;
  rank: number | null;
  points: number;
  grade: string | null;
  chestNumber: string;
  accent: string;
  profileSlug?: string | null;
};

type ItemResultSection = {
  id: string;
  name: string;
  categoryLabel: string;
  isGroup: boolean;
  latestPublishedAt: string | null;
  rows: ItemResultRow[];
};

const PAGE_SIZE = 8;

const palette = {
  ink: '#0F172A',
  deep: '#020617',
  surface: '#1E293B',
  page: '#020617', // Deep slate background
  line: 'rgba(255, 255, 255, 0.05)', // Subtle border
  text: '#F8FAFC', // Slate 50
  muted: '#94A3B8', // Slate 400
  pink: '#0F766E', // Teal instead of pink
  magenta: '#0284C7', // Sky blue instead of magenta
  yellow: '#FBBF24',
  orange: '#F59E0B',
  cyan: '#06B6D4',
  green: '#10B981',
  blue: '#3B82F6',
  gold: '#FBBF24',
  silver: '#94A3B8',
  bronze: '#B45309',
};

const titleCase = (value: string | null | undefined) => {
  if (!value) return 'Unit';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const childLabelFromFestivalLevel = (level: string | null | undefined) => {
  const normalized = level?.toLowerCase();
  if (normalized === 'sector') return 'Unit';
  if (normalized === 'division') return 'Sector';
  if (normalized === 'district') return 'Division';
  if (normalized === 'state') return 'District';
  return 'Unit';
};

const formatDateTime = (value: string | null) => {
  if (!value) return 'Waiting for published results';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

const formatTime = (timeStr: string | null) => {
  if (!timeStr) return '';
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(timeStr));
};

const maxDate = (values: (string | null | undefined)[]) => {
  return values.reduce<string | null>((latest, value) => {
    if (!value) return latest;
    if (!latest || new Date(value) > new Date(latest)) return value;
    return latest;
  }, null);
};

const includesQuery = (values: (string | null | undefined)[], query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => value?.toLowerCase().includes(normalized));
};

const accentByRank = (rank: number) => {
  if (rank === 1) return palette.gold;
  if (rank === 2) return palette.silver;
  if (rank === 3) return palette.bronze;
  return [palette.green, palette.blue, palette.cyan, palette.magenta][rank % 4];
};

const toOrganisationRows = (rows: LeaderboardRow[], label: string): RankingViewRow[] =>
  rows.map((row, rowIndex) => {
    const rank = rowIndex + 1;
    const graceText = row.grace_marks_awarded ? ` (+${row.grace_marks_awarded} Grace)` : '';
    return {
      id: row.organisation_id ?? `organisation:${row.organisation_name}`,
      name: row.organisation_name,
      subtitle: `${row.result_count} results - ${row.first_place_count} first places${graceText}`,
      points: row.total_points,
      rank,
      badgeLabel: label,
      accent: accentByRank(rank),
    };
  });

const toIndividualRows = (results: PublicPublishedResultRow[]): RankingViewRow[] => {
  const grouped = new Map<string, {
    id: string;
    name: string;
    organisation: string;
    points: number;
    resultCount: number;
    firstPlaces: number;
    category: string | null;
    profileSlug: string | null;
  }>();

  results.forEach((result) => {
    if (!result.participant_id) return;
    const existing = grouped.get(result.participant_id);
    if (existing) {
      existing.points += result.points_awarded;
      existing.resultCount += 1;
      existing.firstPlaces += result.rank === 1 ? 1 : 0;
      if (!existing.profileSlug && result.participant_profile_slug) existing.profileSlug = result.participant_profile_slug;
      return;
    }
    grouped.set(result.participant_id, {
      id: result.participant_id,
      name: result.participant_name || result.chest_number || 'Published participant',
      organisation: result.organisation_name,
      points: result.points_awarded,
      resultCount: 1,
      firstPlaces: result.rank === 1 ? 1 : 0,
      category: result.participant_category_code,
      profileSlug: result.participant_profile_slug,
    });
  });

  return Array.from(grouped.values())
    .sort((a, b) => b.points - a.points || b.firstPlaces - a.firstPlaces || a.name.localeCompare(b.name))
    .map((row, rowIndex) => {
      const rank = rowIndex + 1;
      return {
        id: row.id,
        name: row.name,
        subtitle: `${row.organisation}${row.category ? ` - ${row.category}` : ''} - ${row.resultCount} results`,
        points: row.points,
        rank,
        badgeLabel: 'Individual',
        accent: accentByRank(rank),
        profileSlug: row.profileSlug,
      };
    });
};

const toItemSections = (results: PublicPublishedResultRow[]): ItemResultSection[] => {
  const grouped = new Map<string, ItemResultSection>();

  results.forEach((result) => {
    const id = result.item_id ?? `result-item:${result.result_id}`;
    const rank = result.rank ?? 99;
    const resultRow: ItemResultRow = {
      id: result.result_id,
      name: result.participant_name || result.chest_number || 'Published participant',
      organisationName: result.organisation_name,
      rank: result.rank,
      points: result.points_awarded,
      grade: result.grade,
      chestNumber: result.chest_number,
      accent: accentByRank(rank),
      profileSlug: result.participant_profile_slug,
    };
    const existing = grouped.get(id);
    if (existing) {
      existing.latestPublishedAt = maxDate([existing.latestPublishedAt, result.published_at]);
      existing.rows.push(resultRow);
      return;
    }
    grouped.set(id, {
      id,
      name: result.item_name_ml || result.item_name || 'Published item',
      categoryLabel: result.item_category_codes.length > 0
        ? result.item_category_codes.join(' / ')
        : result.participant_category_code || 'General',
      isGroup: result.is_group,
      latestPublishedAt: result.published_at,
      rows: [resultRow],
    });
  });

  return Array.from(grouped.values())
    .map((section) => ({
      ...section,
      rows: section.rows.sort((a, b) =>
        (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
        b.points - a.points ||
        a.name.localeCompare(b.name)
      ),
    }))
    .sort((a, b) =>
      new Date(b.latestPublishedAt ?? 0).getTime() - new Date(a.latestPublishedAt ?? 0).getTime() ||
      a.name.localeCompare(b.name)
    );
};

export function AlvioraCustomRenderer({ page = 'landing' }: { page?: PublicLeaderboardPage }) {
  const router = useRouter();
  const { tenant_id: queryTenantId } = useLocalSearchParams<{ tenant_id?: string }>();
  const { width } = useWindowDimensions();
  const viewportWidth = width || 1024;
  const breakpoint: Breakpoint = viewportWidth >= 1120 ? 'desktop' : viewportWidth >= 760 ? 'tablet' : 'mobile';
  const isDesktop = breakpoint === 'desktop';
  const isMobile = breakpoint === 'mobile';

  const [activeTab, setActiveTab] = useState<ActiveTab>('organisations');
  const { tenant_id: authTenantId } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [visibleCounts, setVisibleCounts] = useState<Record<PublicLeaderboardPage, number>>({
    landing: PAGE_SIZE,
    units: PAGE_SIZE,
    items: PAGE_SIZE,
    schedule: PAGE_SIZE,
  });

  const tenantId = (Array.isArray(queryTenantId) ? queryTenantId[0] : queryTenantId) || authTenantId || null;
  const settingsQuery = useGetPublicLeaderboardSettings(tenantId);
  const showIndividuals = settingsQuery.data?.show_individual_rankings === true;
  const festivalId = settingsQuery.data?.festival_id;
  const publicFestivalName = settingsQuery.data?.public_festival_name?.trim() || 'Festival';

  const organisationQuery = usePublicLeaderboard(tenantId, festivalId, !!tenantId && !!festivalId);
  const publishedResultsQuery = usePublicPublishedResults(tenantId, festivalId, !!tenantId && !!festivalId, true);
  const scheduleQuery = usePublicSchedule(festivalId, tenantId);
  const queryClient = useQueryClient();

  // Keep the public board live without broad/global subscriptions. Every
  // channel is scoped to the tenant and active festival, and only invalidates
  // the existing read-only queries; it never writes or bypasses the RPC layer.
  useEffect(() => {
    if (!tenantId || !festivalId) return;

    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: LEADERBOARD_QUERY_KEYS.publicLeaderboard(tenantId, festivalId) });
      queryClient.invalidateQueries({ queryKey: LEADERBOARD_QUERY_KEYS.publicPublishedResults(tenantId, festivalId, true) });
      queryClient.invalidateQueries({ queryKey: ['public-schedules', tenantId, festivalId] });
      queryClient.invalidateQueries({ queryKey: LEADERBOARD_QUERY_KEYS.publicLeaderboardSettings(tenantId, festivalId) });
    };

    const channel = supabase
      .channel(`public-leaderboard:${tenantId}:${festivalId}_${Math.random().toString(36).substring(7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'results', filter: `tenant_id=eq.${tenantId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules', filter: `tenant_id=eq.${tenantId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'festival_leaderboard_settings', filter: `tenant_id=eq.${tenantId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'festival_calendar', filter: `tenant_id=eq.${tenantId}` }, refresh)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [festivalId, queryClient, tenantId]);

  // 1. Asynchronously load cached data from AsyncStorage on mount to populate the React Query cache instantly
  useEffect(() => {
    const initCache = async () => {
      try {
        // Remove cache entries written by the old global public-board flow.
        // Keeping them around could resurrect another tenant's podium after
        // a tenant switch or a hot reload.
        await Promise.all([
          AsyncStorage.removeItem('cache:leaderboard_settings'),
          AsyncStorage.removeItem('cache:public_leaderboard'),
          AsyncStorage.removeItem('cache:public_published_results'),
          AsyncStorage.removeItem('cache:public_schedule'),
        ]);
        queryClient.removeQueries({ queryKey: ['public-leaderboard', 'all', 'active'] });
        queryClient.removeQueries({ queryKey: ['public-published-results', 'all', 'active'] });
        queryClient.removeQueries({ queryKey: ['public-leaderboard-settings', 'all', 'active'] });
        queryClient.removeQueries({ queryKey: ['public-schedules', 'none', 'none'] });

        if (!tenantId) return;

        // First load settings cache to get the festivalId immediately
        const settingsCacheStr = await AsyncStorage.getItem('cache:leaderboard_settings:' + tenantId);
        let cachedFestivalId: string | null = null;
        if (settingsCacheStr) {
          const settingsCache = JSON.parse(settingsCacheStr);
          cachedFestivalId = settingsCache.festival_id;
          queryClient.setQueryData(
            LEADERBOARD_QUERY_KEYS.publicLeaderboardSettings(tenantId, cachedFestivalId),
            settingsCache
          );
        }

        // Use the cached festivalId or the active one
        const activeFestivalId = festivalId || cachedFestivalId;

        // Populate other caches using the festivalId
        const lbCacheStr = await AsyncStorage.getItem('cache:public_leaderboard:' + tenantId);
        if (lbCacheStr) {
          queryClient.setQueryData(
            LEADERBOARD_QUERY_KEYS.publicLeaderboard(tenantId, activeFestivalId),
            JSON.parse(lbCacheStr)
          );
        }

        const resultsCacheStr = await AsyncStorage.getItem('cache:public_published_results:' + tenantId);
        if (resultsCacheStr) {
          queryClient.setQueryData(
            LEADERBOARD_QUERY_KEYS.publicPublishedResults(tenantId, activeFestivalId, true),
            JSON.parse(resultsCacheStr)
          );
        }

        const scheduleCacheStr = await AsyncStorage.getItem('cache:public_schedule:' + tenantId);
        if (scheduleCacheStr) {
          queryClient.setQueryData(
            ['public-schedules', tenantId, activeFestivalId],
            JSON.parse(scheduleCacheStr)
          );
        }

      } catch (err) {
        console.warn('Failed to restore leaderboard local cache:', err);
      }
    };
    initCache();
  }, [queryClient, festivalId, tenantId]);

  // 2. Silently sync fresh results to AsyncStorage when queries complete
  useEffect(() => {
    if (settingsQuery.data) {
      AsyncStorage.setItem('cache:leaderboard_settings:' + tenantId, JSON.stringify(settingsQuery.data)).catch(() => {});
    }
  }, [settingsQuery.data, tenantId]);

  useEffect(() => {
    if (organisationQuery.data && festivalId) {
      AsyncStorage.setItem('cache:public_leaderboard:' + tenantId, JSON.stringify(organisationQuery.data)).catch(() => {});
    }
  }, [organisationQuery.data, festivalId, tenantId]);

  useEffect(() => {
    if (publishedResultsQuery.data && festivalId) {
      AsyncStorage.setItem('cache:public_published_results:' + tenantId, JSON.stringify(publishedResultsQuery.data)).catch(() => {});
    }
  }, [publishedResultsQuery.data, festivalId, tenantId]);

  useEffect(() => {
    if (scheduleQuery.data && festivalId) {
      AsyncStorage.setItem('cache:public_schedule:' + tenantId, JSON.stringify(scheduleQuery.data)).catch(() => {});
    }
  }, [scheduleQuery.data, festivalId, tenantId]);

  // 3. Background prefetching of all other tabs' data to ensure instant transitions
  useEffect(() => {
    if (festivalId) {
      // Prefetch leaderboard (Unit Standings)
      queryClient.prefetchQuery({
        queryKey: LEADERBOARD_QUERY_KEYS.publicLeaderboard(tenantId, festivalId),
        queryFn: () => leaderboardService.listPublicLeaderboard(tenantId, festivalId),
        staleTime: 300000,
      });

      // Prefetch published results (Item Results)
      queryClient.prefetchQuery({
        queryKey: LEADERBOARD_QUERY_KEYS.publicPublishedResults(tenantId, festivalId, true),
        queryFn: () => leaderboardService.listPublicPublishedResults(tenantId, festivalId, true),
        staleTime: 300000,
      });

      // Prefetch schedules
      queryClient.prefetchQuery({
        queryKey: ['public-schedules', tenantId, festivalId],
        queryFn: () => fetchPublicSchedules(festivalId),
        staleTime: 300000,
      });

    }
  }, [festivalId, queryClient, tenantId]);

  const organisationData = useMemo(() => organisationQuery.data ?? [], [organisationQuery.data]);
  const publishedResults = useMemo(() => publishedResultsQuery.data ?? [], [publishedResultsQuery.data]);
  const schedules = useMemo(() => scheduleQuery.data ?? [], [scheduleQuery.data]);
  const categoryOptions = useMemo(() => {
    const codes = new Set<string>();
    publishedResults.forEach((result) => {
      result.item_category_codes.forEach((code) => codes.add(code));
      if (result.participant_category_code) codes.add(result.participant_category_code);
    });
    schedules.forEach((schedule) => {
      (schedule.items?.category_codes ?? []).forEach((code: string) => codes.add(code));
    });
    return ['All', ...Array.from(codes).sort((a, b) => a.localeCompare(b))];
  }, [publishedResults, schedules]);

  useEffect(() => {
    if (!categoryOptions.includes(categoryFilter)) setCategoryFilter('All');
  }, [categoryFilter, categoryOptions]);

  const latestUpdate = useMemo(() => maxDate([
    ...organisationData.map((row) => row.latest_published_at),
    ...publishedResults.map((row) => row.published_at),
  ]), [organisationData, publishedResults]);

  const hierarchyLabel = useMemo(() => {
    const rowType = organisationData.find((row) => row.organisation_type)?.organisation_type;
    if (rowType) return titleCase(rowType);
    const festivalLevel = publishedResults.find((row) => row.festival_level)?.festival_level;
    return childLabelFromFestivalLevel(festivalLevel);
  }, [organisationData, publishedResults]);

  useEffect(() => {
    if (!showIndividuals && activeTab === 'individuals') setActiveTab('organisations');
  }, [activeTab, showIndividuals]);

  const categoryMatches = useCallback((result: PublicPublishedResultRow) => {
    if (categoryFilter === 'All') return true;
    return result.participant_category_code === categoryFilter || result.item_category_codes.includes(categoryFilter);
  }, [categoryFilter]);

  const filteredPublishedResults = useMemo(() => {
    return publishedResults.filter((result) =>
      categoryMatches(result) &&
      includesQuery([
        result.participant_name,
        result.chest_number,
        result.organisation_name,
        result.item_name,
        result.item_name_ml,
      ], searchQuery)
    );
  }, [publishedResults, searchQuery, categoryMatches]);

  const organisationRows = useMemo(() => toOrganisationRows(organisationData, hierarchyLabel), [organisationData, hierarchyLabel]);
  const filteredOrganisationRows = useMemo(() => {
    return organisationRows.filter((row) => includesQuery([row.name, row.subtitle], searchQuery));
  }, [organisationRows, searchQuery]);
  const individualRows = useMemo(() => toIndividualRows(filteredPublishedResults), [filteredPublishedResults]);
  const itemSections = useMemo(() => toItemSections(filteredPublishedResults), [filteredPublishedResults]);

  const activeRows = activeTab === 'organisations' ? filteredOrganisationRows : individualRows;
  const tableRows = activeRows.slice(3, visibleCounts.units);
  const visibleItemSections = itemSections.slice(0, visibleCounts.items);

  const displayRows = useMemo(() => {
    const rows = [...organisationRows];
    while (rows.length < 3) {
      const idx = rows.length;
      const rank = idx + 1;
      rows.push({
        id: `placeholder:${idx}`,
        name: rank === 1 ? '1st Unit Pending' : rank === 2 ? '2nd Unit Pending' : '3rd Unit Pending',
        subtitle: 'Awaiting points',
        points: 0,
        rank,
        badgeLabel: 'Unit',
        accent: accentByRank(rank),
      });
    }
    return rows;
  }, [organisationRows]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      const itemName = s.items?.item_name_ml || s.items?.item_name_en || s.items?.item_code || 'Scheduled Event';
      const venueName = s.venues?.name || 'Stage';
      const matchesSearch = searchQuery ? (
        itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.items?.item_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        venueName.toLowerCase().includes(searchQuery.toLowerCase())
      ) : true;

      const matchesCategory = categoryFilter === 'All' ? true : (
        s.items?.category_codes?.includes(categoryFilter) || false
      );

      return matchesSearch && matchesCategory;
    });
  }, [schedules, searchQuery, categoryFilter]);

  const groupedSchedules = useMemo(() => {
    const groups: Record<string, typeof filteredSchedules> = {};
    filteredSchedules.forEach(item => {
      if (!item.start_time) {
        const key = 'Time TBA';
        groups[key] = groups[key] || [];
        groups[key].push(item);
        return;
      }
      const dateKey = new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'long',
        weekday: 'long',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(item.start_time));
      groups[dateKey] = groups[dateKey] || [];
      groups[dateKey].push(item);
    });
    return Object.keys(groups).map(date => ({
      date,
      items: groups[date],
    }));
  }, [filteredSchedules]);

  const visibleGroupedSchedules = useMemo(() => {
    let count = 0;
    const result: typeof groupedSchedules = [];
    for (const group of groupedSchedules) {
      if (count >= visibleCounts.schedule) break;
      const slicedItems = group.items.slice(0, visibleCounts.schedule - count);
      result.push({
        date: group.date,
        items: slicedItems,
      });
      count += slicedItems.length;
    }
    return result;
  }, [groupedSchedules, visibleCounts.schedule]);

  const hasMore = useMemo(() => {
    if (page === 'units') {
      return activeRows.length > visibleCounts.units;
    }
    if (page === 'items') {
      return itemSections.length > visibleCounts.items;
    }
    if (page === 'schedule') {
      return filteredSchedules.length > visibleCounts.schedule;
    }
    return false;
  }, [page, activeRows.length, itemSections.length, filteredSchedules.length, visibleCounts]);

  const refreshAll = () => {
    organisationQuery.refetch();
    publishedResultsQuery.refetch();
    settingsQuery.refetch();
    scheduleQuery.refetch();
  };

  const openCandidateProfile = (profileSlug?: string | null) => {
    if (profileSlug) router.push(`/candidate/${profileSlug}` as any);
  };

  const viewMore = () => {
    setVisibleCounts((current) => ({
      ...current,
      [page]: current[page] + PAGE_SIZE,
    }));
  };

  const liveResultsCount = publishedResults.length;
  const runningStagesCount = schedules.filter(s => s.status === 'live').length;
  const publishedItemsCount = itemSections.length;
  const activeVenuesCount = [...new Set(schedules.map(s => s.venue_id))].filter(Boolean).length;

  const renderNav = () => (
    <View style={styles.navBarGlass}>
      <Text style={styles.navBarText}>{publicFestivalName}</Text>
      <TouchableOpacity
        onPress={() => router.push('/notifications' as any)}
        style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 }}
      >
        <Bell size={18} color="#FFF" />
      </TouchableOpacity>
    </View>
  );

  const renderCompactHeader = (title: string) => (
    <View style={styles.compactHeaderContent}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => router.replace('/(public)/leaderboard' as never)}
        style={styles.backButton}
      >
        <ArrowLeft size={16} color="rgba(255,255,255,0.76)" />
        <Text style={styles.backButtonText}>Back to Portal</Text>
      </TouchableOpacity>
      <Text style={styles.compactHeaderTitle}>{title}</Text>
      <Text style={styles.compactHeaderSubtitle}>{publicFestivalName} · Official public results</Text>
    </View>
  );

  const renderHero = () => (
    <View style={styles.heroContent}>
      <View style={styles.heroCopy}>
        <Text style={[styles.heroTitle, isMobile && styles.heroTitleMobile]}>{publicFestivalName}</Text>
        <View style={styles.kicker}>
          <Award size={16} color={palette.gold} />
          <Text style={styles.kickerText}>Official public results board</Text>
        </View>
        {settingsQuery.data?.ranking_mode === 'LIMITED' && settingsQuery.data?.item_limit && (
          <View style={[styles.kicker, { marginTop: 8, backgroundColor: 'rgba(217, 119, 6, 0.15)', borderColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1 }]}>
            <Sparkles size={14} color={palette.orange} />
            <Text style={[styles.kickerText, { color: palette.orange }]}>
              Unit Ranking Based On First {settingsQuery.data.item_limit} Published Items
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderLiveStatus = () => (
    <View style={[styles.liveStatusCardGlass, isMobile && styles.liveStatusCardGlassMobile]}>
      <Text style={styles.liveStatusTitle}>Live Status</Text>
      {!isMobile && <View style={styles.liveStatusDivider} />}
      <View style={styles.liveStatusStatItem}>
        <Award size={15} color={palette.cyan} />
        <Text style={styles.liveStatusLabelText}>Published Results: </Text>
        <Text style={styles.liveStatusValueText}>{liveResultsCount}</Text>
      </View>
      {!isMobile && <View style={styles.liveStatusDivider} />}
      <View style={styles.liveStatusStatItem}>
        <View style={styles.pulseGreenDot} />
        <Text style={styles.liveStatusLabelText}>Stages Live: </Text>
        <Text style={styles.liveStatusValueText}>{runningStagesCount}</Text>
      </View>
      {!isMobile && <View style={styles.liveStatusDivider} />}
      <View style={styles.liveStatusStatItem}>
        <MapPin size={15} color={palette.orange} />
        <Text style={styles.liveStatusLabelText}>Active Venues: </Text>
        <Text style={styles.liveStatusValueText}>{activeVenuesCount}</Text>
      </View>
    </View>
  );

  const renderQuickNavAndPodium = () => (
    <View style={[styles.mainSectionRow, !isDesktop && styles.mainSectionRowMobile]}>
      {/* Quick Navigation Panel */}
      <View style={styles.quickNavPanel}>
        <Text style={styles.sectionTitleLabel}>Quick Navigation</Text>
        <View style={styles.quickNavRow}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/(public)/leaderboard/unit-rankings' as never)} style={styles.quickNavCardGlass}>
            <View style={styles.quickNavIconBox}><Trophy size={18} color="#10B981" /></View>
            <Text style={styles.quickNavTitleText}>Unit Rankings</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/(public)/leaderboard/item-results' as never)} style={styles.quickNavCardGlass}>
            <View style={styles.quickNavIconBox}><ClipboardList size={18} color="#FBBF24" /></View>
            <Text style={styles.quickNavTitleText}>Item Results</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/(public)/leaderboard/schedule' as never)} style={styles.quickNavCardGlass}>
            <View style={styles.quickNavIconBox}><Calendar size={18} color="#0EA5E9" /></View>
            <Text style={styles.quickNavTitleText}>Festival Schedule</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Flat Glass Podium Panel */}
      <View style={styles.podiumPanel}>
        <View style={styles.flatPodiumContainer}>
          {/* 2nd Place */}
          <View style={[styles.flatPodiumCard, { height: 160, backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255,255,255,0.05)' }]}>
            <Text style={styles.flatPodiumRankText}>2</Text>
            <Text style={[styles.podiumNameText, { color: '#94A3B8' }]} numberOfLines={1}>{displayRows[1].name}</Text>
            <Text style={[styles.podiumPointsText, { color: '#F8FAFC' }]}>{displayRows[1].points} pts</Text>
          </View>
          {/* 1st Place */}
          <View style={[styles.flatPodiumCard, { height: 200, backgroundColor: 'rgba(251, 191, 36, 0.05)', borderColor: 'rgba(251, 191, 36, 0.2)' }]}>
            <Crown size={24} color="#FBBF24" style={{ marginBottom: 8 }} />
            <Text style={[styles.flatPodiumRankText, { color: '#FBBF24' }]}>1</Text>
            <Text style={[styles.podiumNameText, { color: '#FBBF24' }]} numberOfLines={1}>{displayRows[0].name}</Text>
            <Text style={[styles.podiumPointsText, { color: '#F8FAFC' }]}>{displayRows[0].points} pts</Text>
          </View>
          {/* 3rd Place */}
          <View style={[styles.flatPodiumCard, { height: 140, backgroundColor: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255,255,255,0.05)' }]}>
            <Text style={styles.flatPodiumRankText}>3</Text>
            <Text style={[styles.podiumNameText, { color: '#B45309' }]} numberOfLines={1}>{displayRows[2].name}</Text>
            <Text style={[styles.podiumPointsText, { color: '#F8FAFC' }]}>{displayRows[2].points} pts</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderFooter = () => (
    <View style={styles.footerContainer}>
      <TouchableOpacity
        onPress={() => router.push('/(auth)/login' as never)}
        style={styles.staffLoginButton}
        activeOpacity={0.75}
      >
        <Text style={styles.staffLoginText}>Staff Login</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSearch = () => (
    <View style={[styles.controls, isMobile && styles.controlsMobile]}>
      <View style={styles.searchBox}>
        <Search size={18} color="rgba(255, 255, 255, 0.4)" />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={
            page === 'items'
              ? 'Search item or participant'
              : page === 'schedule'
              ? 'Search item or stage'
              : 'Search name or unit'
          }
          placeholderTextColor="rgba(255, 255, 255, 0.36)"
          style={styles.searchInput}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {categoryOptions.map((option) => {
          const active = categoryFilter === option;
          return (
            <TouchableOpacity
              key={option}
              onPress={() => setCategoryFilter(option)}
              style={[styles.categoryChip, active && styles.categoryChipActive]}
            >
              <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderUnitRankingsTable = () => {
    const isLBQueryLoading = organisationQuery.isLoading || publishedResultsQuery.isLoading;
    if (isLBQueryLoading) return <LoadingState label="Loading standings" />;
    if (activeRows.length === 0) {
      return <EmptyState title="No rankings yet" message="Published results will appear here as soon as they are released." />;
    }

    return (
      <View style={styles.subPageWrapper}>
        {showIndividuals && (
          <View style={styles.tabs}>
            <TouchableOpacity
              onPress={() => setActiveTab('organisations')}
              style={[styles.tabButton, activeTab === 'organisations' && styles.tabButtonActive]}
            >
              <Building2 size={17} color={activeTab === 'organisations' ? palette.text : 'rgba(255,255,255,0.7)'} />
              <Text style={[styles.tabText, activeTab === 'organisations' && styles.tabTextActive]}>Units</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('individuals')}
              style={[styles.tabButton, activeTab === 'individuals' && styles.tabButtonActive]}
            >
              <UserRound size={17} color={activeTab === 'individuals' ? palette.text : 'rgba(255,255,255,0.7)'} />
              <Text style={[styles.tabText, activeTab === 'individuals' && styles.tabTextActive]}>Individuals</Text>
            </TouchableOpacity>
          </View>
        )}
        {settingsQuery.data?.team_point_status && (
          <View style={styles.teamPointBannerContainer}>
            <LinearGradient
              colors={['rgba(251, 191, 36, 0.15)', 'rgba(217, 119, 6, 0.05)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.teamPointBannerGlow}
            />
            <View style={styles.teamPointBannerContent}>
              <View style={styles.teamPointBannerIconBox}>
                <Trophy size={18} color="#FBBF24" />
              </View>
              <View style={styles.teamPointBannerTextCol}>
                <Text style={styles.teamPointBannerTitle}>Official Team Point Status</Text>
                <Text style={styles.teamPointBannerValue}>{settingsQuery.data.team_point_status}</Text>
              </View>
            </View>
          </View>
        )}
        {renderSearch()}
        <View style={styles.listCard}>
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderText}>Rank</Text>
            <Text style={[styles.listHeaderText, styles.nameHeader]}>{activeTab === 'organisations' ? hierarchyLabel : 'Name'}</Text>
            <Text style={styles.listHeaderText}>Points</Text>
          </View>
          {activeRows.slice(0, visibleCounts.units).map((row) => (
            <TouchableOpacity
              key={row.id}
              activeOpacity={activeTab === 'individuals' && row.profileSlug ? 0.82 : 1}
              onPress={() => activeTab === 'individuals' && openCandidateProfile(row.profileSlug)}
              style={styles.rankRow}
            >
              <Text style={styles.rankNumber}>{row.rank}</Text>
              <View style={[styles.rowIcon, { backgroundColor: `${row.accent}24` }]}>
                {activeTab === 'individuals' ? <UserRound size={17} color={row.accent} /> : <Building2 size={17} color={row.accent} />}
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.rowName} numberOfLines={1}>{row.name}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{row.subtitle}</Text>
              </View>
              <View style={styles.rowPoints}>
                <Text style={styles.rowPointsValue}>{row.points}</Text>
                <Text style={styles.rowPointsLabel}>pts</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderItemResultsTable = () => {
    const isResultsLoading = publishedResultsQuery.isLoading;
    if (isResultsLoading) return <LoadingState label="Loading results" />;
    if (itemSections.length === 0) {
      return <EmptyState title="No item results yet" message="Published item-wise results will be listed here." />;
    }

    return (
      <View style={styles.subPageWrapper}>
        {renderSearch()}
        <View style={styles.itemSections}>
          {visibleItemSections.map((section) => (
            <View key={section.id} style={styles.itemSectionCard}>
              <View style={[styles.itemSectionHeader, isMobile && styles.itemSectionHeaderMobile]}>
                <View style={styles.itemSectionTitleBlock}>
                  <Text style={styles.itemSectionTitle} numberOfLines={2}>{section.name}</Text>
                  <Text style={styles.itemSectionMeta}>
                    {section.categoryLabel} - {section.isGroup ? 'Group' : 'Single'} - {formatDateTime(section.latestPublishedAt)}
                  </Text>
                </View>
                <View style={styles.publishedPill}>
                  <Award size={14} color="#10B981" />
                  <Text style={styles.publishedPillText}>Published</Text>
                </View>
              </View>
              {section.rows.map((row) => (
                <TouchableOpacity
                  key={row.id}
                  activeOpacity={row.profileSlug ? 0.82 : 1}
                  onPress={() => openCandidateProfile(row.profileSlug)}
                  style={styles.itemRow}
                >
                  <View style={[styles.itemRankBadge, { backgroundColor: `${row.accent}24`, borderColor: `${row.accent}55` }]}>
                    <Text style={[styles.itemRankText, { color: row.accent }]}>{row.rank ?? '-'}</Text>
                  </View>
                  <View style={styles.itemMain}>
                    <Text style={styles.itemName} numberOfLines={1}>{row.name}</Text>
                    <Text style={styles.itemSub} numberOfLines={1}>
                      {row.organisationName}{row.chestNumber ? ` - Chest ${row.chestNumber}` : ''}
                    </Text>
                  </View>
                  {row.grade ? (
                    <View style={styles.gradePill}>
                      <Text style={styles.gradeText}>{row.grade}</Text>
                    </View>
                  ) : null}
                  <View style={styles.rowPoints}>
                    <Text style={styles.rowPointsValue}>{row.points}</Text>
                    <Text style={styles.rowPointsLabel}>pts</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderScheduleTimeline = () => {
    const isScheduleLoading = scheduleQuery.isLoading;
    if (isScheduleLoading) return <LoadingState label="Loading schedule" />;
    if (filteredSchedules.length === 0) {
      return <EmptyState title="No schedules scheduled" message="Event schedules will appear here." />;
    }

    return (
      <View style={styles.subPageWrapper}>
        {renderSearch()}
        <View style={styles.timelineWrapper}>
          {visibleGroupedSchedules.map((group) => (
            <View key={group.date} style={styles.timelineGroup}>
              <View style={styles.timelineHeader}>
                <Calendar size={16} color="#A78BFA" />
                <Text style={styles.timelineDateText}>{group.date}</Text>
              </View>
              <View style={styles.timelineItemsList}>
                {group.items.map((item) => {
                  let normalizedStatus = String(item.status || '').toLowerCase();
                  let isLive = ['live', 'ongoing', 'in_progress'].includes(normalizedStatus);
                  let isCompleted = ['completed', 'complete', 'finished'].includes(normalizedStatus);

                  // Dynamically upgrade status if it was just 'scheduled'
                  if (!isCompleted && (item.is_published || item.has_results)) {
                    isCompleted = true;
                    isLive = false;
                    normalizedStatus = 'completed';
                  } else if (!isCompleted && !isLive && (item.has_marks || item.has_codes)) {
                    isLive = true;
                    normalizedStatus = 'ongoing';
                  }

                  let statusText = titleCase(normalizedStatus || 'scheduled');
                  let badgeStyle: any = [];
                  let textStyle: any = [];
                  let showGreenDot = isLive;

                  if (isCompleted) {
                    statusText = 'Completed';
                    badgeStyle = [styles.statusBadgeCompleted];
                    textStyle = [styles.statusBadgeTextCompleted];
                  } else if (isLive) {
                    statusText = 'Ongoing';
                    badgeStyle = [styles.statusBadgeLive];
                    textStyle = [styles.statusBadgeTextLive];
                  } else {
                    statusText = 'Scheduled';
                    badgeStyle = [];
                    textStyle = [];
                  }
                  
                  let eventName = 'Scheduled Event';
                  let itemType = 'Stage Item';
                  let categoryLabel = 'General';
                  if (item.items) {
                    eventName = item.items.item_name_ml || item.items.item_name_en || item.items.item_code;
                    itemType = item.items.item_type === 'stage' ? 'Stage Item' : 'Off-Stage Item';
                    if (item.items.category_codes && item.items.category_codes.length > 0) {
                      categoryLabel = item.items.category_codes.join(' / ');
                    }
                  } else if (item.item_id) {
                    eventName = `Event Code: ${item.item_id.substring(0, 8).toUpperCase()}`;
                  }

                  return (
                    <View key={item.id} style={[styles.timelineCard, isLive && styles.timelineCardLive]}>
                      {isLive && <View style={styles.timelineCardLiveIndicator} />}
                      <View style={styles.timelineCardMain}>
                        <View style={styles.timelineCardTimeRow}>
                          <Clock size={14} color="rgba(255, 255, 255, 0.4)" />
                          <Text style={styles.timelineCardTimeText}>
                            {formatTimeRange(item.start_time, item.end_time)}
                          </Text>
                          <View style={[
                            styles.statusBadge,
                            ...badgeStyle
                          ]}>
                            {showGreenDot && <View style={styles.pulseGreenDot} />}
                            <Text style={[
                              styles.statusBadgeText,
                              ...textStyle
                            ]}>
                              {statusText}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.timelineCardEventName} numberOfLines={2}>
                          {eventName}
                        </Text>
                        <View style={styles.timelineCardMetaRow}>
                          <View style={styles.timelineCardMetaBadge}>
                            <Text style={styles.timelineCardMetaBadgeText}>{categoryLabel}</Text>
                          </View>
                          <View style={styles.timelineCardMetaBadge}>
                            <Text style={styles.timelineCardMetaBadgeText}>{itemType}</Text>
                          </View>
                          {item.venues?.name && (
                            <View style={styles.timelineCardVenue}>
                              <MapPin size={13} color="#F59E0B" />
                              <Text style={styles.timelineCardVenueText} numberOfLines={1}>
                                {item.venues.name}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const formatTimeRange = (startTime: string | null, endTime: string | null) => {
    if (!startTime) return 'Time TBA';
    const start = formatTime(startTime);
    const end = endTime ? formatTime(endTime) : '';
    return end ? `${start} - ${end}` : start;
  };

  const isLandingPage = page === 'landing';
  const isRefreshing = organisationQuery.isRefetching || publishedResultsQuery.isRefetching || scheduleQuery.isRefetching;

  if (!tenantId) {
    return (
      <View style={styles.screen}>
        <LinearGradient
          colors={['#030F26', '#021E1B', '#02241F']}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={[styles.gradientBg, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}
        >
          <View style={{ maxWidth: 520, width: '100%', backgroundColor: 'rgba(15, 31, 51, 0.92)', borderRadius: 20, padding: 28, borderWidth: 1, borderColor: palette.line }}>
            <Text style={[styles.heroTitle, { fontSize: isMobile ? 28 : 36, textAlign: 'center' }]}>Tenant-specific public results</Text>
            <Text style={[styles.kickerText, { textAlign: 'center', marginTop: 14 }]}>
              Open the public leaderboard from a tenant-specific link, or sign in to view that tenant&apos;s festival.
            </Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#020617', '#0F172A', '#020617']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBg}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshAll} tintColor="#10B981" />}
        >
          <View style={[styles.contentShell, isMobile && styles.contentShellMobile]}>
            {isLandingPage ? (
              <View style={[styles.landingCard, isMobile && styles.landingCardMobile]}>
                {renderNav()}
                {renderHero()}
                {renderLiveStatus()}
                {renderQuickNavAndPodium()}
              </View>
            ) : (
              <>
                {page === 'units' && renderCompactHeader('Unit Standings')}
                {page === 'items' && renderCompactHeader('Published Results')}
                {page === 'schedule' && renderCompactHeader('Festival Schedule')}
                
                <View style={styles.subpageContentArea}>
                  {page === 'units' && renderUnitRankingsTable()}
                  {page === 'items' && renderItemResultsTable()}
                  {page === 'schedule' && renderScheduleTimeline()}
                  
                  {hasMore && (
                    <TouchableOpacity onPress={viewMore} style={styles.viewMoreButton}>
                      <ChevronDown size={17} color={palette.text} />
                      <Text style={styles.viewMoreText}>View more</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
            {renderFooter()}
          </View>
        </ScrollView>
      </LinearGradient>
      {isLandingPage && <PublicAiChatbot festivalId={festivalId} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#030E21',
  },
  gradientBg: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  contentShell: {
    width: '100%',
    maxWidth: 1000,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  contentShellMobile: {
    paddingHorizontal: 12,
  },
  subpageContentArea: {
    paddingTop: 16,
  },
  subPageWrapper: {
    width: '100%',
  },
  navBarGlass: {
    height: 52,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 28,
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)' },
      default: {},
    }),
  },
  navBarText: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
  },
  heroContent: {
    marginBottom: 24,
  },
  heroCopy: {
    alignItems: 'flex-start',
  },
  landingCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    padding: 40,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 20,
    shadowOpacity: 0.2,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(32px)',
      },
      default: {},
    }),
  },
  landingCardMobile: {
    padding: 16,
    borderRadius: 10,
  },
  heroTitle: {
    fontFamily: Platform.OS === 'web' ? 'Georgia, serif' : 'serif',
    color: '#FFFFFF',
    fontSize: 40,
    lineHeight: 48,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  heroTitleMobile: {
    fontSize: 30,
    lineHeight: 38,
  },
  kicker: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(154, 107, 36, 0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  kickerText: {
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12.5,
  },
  liveStatusCardGlass: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 16,
    marginBottom: 32,
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)' },
      default: {},
    }),
  },
  liveStatusCardGlassMobile: {
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 12,
  },
  liveStatusTitle: {
    fontFamily: 'Poppins_900Black',
    color: '#FFFFFF',
    fontSize: 14.5,
    marginRight: 6,
  },
  liveStatusDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  liveStatusStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveStatusLabelText: {
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
  },
  liveStatusValueText: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 13,
  },
  pulseGreenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  pulseGoldDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
  },
  mainSectionRow: {
    flexDirection: 'row',
    gap: 32,
    alignItems: 'flex-start',
    marginBottom: 28,
  },
  mainSectionRowMobile: {
    flexDirection: 'column',
    gap: 32,
  },
  quickNavPanel: {
    flex: 1,
    width: '100%',
  },
  sectionTitleLabel: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    marginBottom: 16,
  },
  quickNavRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  quickNavCardGlass: {
    flex: 1,
    minHeight: 120,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      web: { backdropFilter: 'blur(16px)' },
      default: {},
    }),
  },
  quickNavCardGlassMobile: {
    minHeight: 90,
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 6,
    borderRadius: 10,
  },
  quickNavIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  quickNavIconBoxMobile: {
    width: 36,
    height: 36,
    borderRadius: 9,
  },
  cardGlowGreen: {
    shadowColor: '#000000',
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
  },
  cardGlowGold: {
    shadowColor: '#000000',
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
  },
  cardGlowPurple: {
    shadowColor: '#000000',
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
  },
  quickNavTitleText: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  quickNavTitleTextMobile: {
    fontSize: 10.5,
    lineHeight: 13,
  },
  flatPodiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 16,
    height: 220,
    width: '100%',
  },
  flatPodiumCard: {
    flex: 1,
    maxWidth: 140,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  flatPodiumRankText: {
    fontFamily: 'Poppins_900Black',
    color: '#F8FAFC',
    fontSize: 28,
    marginBottom: 4,
  },
  podiumPanel: {
    position: 'absolute',
    bottom: 20,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#0F5448',
    opacity: 0.28,
    zIndex: 0,
    ...Platform.select({
      web: {
        filter: 'blur(50px)' as any,
      },
      default: {
        shadowColor: '#000000',
        shadowRadius: 40,
        shadowOpacity: 0.4,
      },
    }),
  },
  podiumBgGlowMobile: {
    width: 180,
    height: 180,
    borderRadius: 90,
    bottom: 10,
    opacity: 0.25,
  },
  podium3DWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 240,
    width: '100%',
    maxWidth: 380,
    gap: 10,
    zIndex: 1,
  },
  podium3DWrapperMobile: {
    height: 190,
    gap: 8,
  },
  podium3DColContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  podiumTopLabelBlock: {
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
  },
  podiumNameText: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 12,
    textAlign: 'center',
    width: '100%',
  },
  podiumNameTextMobile: {
    fontSize: 10,
  },
  podiumPointsText: {
    fontFamily: 'Poppins_700Bold',
    color: '#FBBF24',
    fontSize: 14,
    marginTop: 2,
    textShadowColor: 'rgba(251, 191, 36, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  podiumPointsTextMobile: {
    fontSize: 11.5,
  },
  podiumCrownWrapper: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -4,
    zIndex: 3,
  },
  podiumCrownWrapperMobile: {
    width: 24,
    height: 24,
    marginBottom: -6,
  },
  spotlightGlow: {
    position: 'absolute',
    borderRadius: 30,
    opacity: 0.2,
  },
  spotlightGold: {
    width: 50,
    height: 50,
    backgroundColor: '#FBBF24',
    shadowColor: '#000000',
    shadowRadius: 15,
    shadowOpacity: 0.6,
  },
  spotlightGoldMobile: {
    width: 36,
    height: 36,
  },
  spotlightSilver: {
    width: 44,
    height: 44,
    backgroundColor: '#D1D5DB',
    shadowColor: '#000000',
    shadowRadius: 12,
    shadowOpacity: 0.5,
  },
  spotlightSilverMobile: {
    width: 32,
    height: 32,
  },
  spotlightBronze: {
    width: 40,
    height: 40,
    backgroundColor: '#D97706',
    shadowColor: '#000000',
    shadowRadius: 10,
    shadowOpacity: 0.5,
  },
  spotlightBronzeMobile: {
    width: 28,
    height: 28,
  },
  column3DWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  podium3DCap: {
    height: 14,
    borderRadius: 7,
    width: '100%',
    marginBottom: -7,
    zIndex: 2,
  },
  podium3DCapMobile: {
    height: 10,
    borderRadius: 5,
    marginBottom: -5,
  },
  podium3DCapGold: {
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
  },
  podium3DCapSilver: {
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
  },
  podium3DCapBronze: {
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
  },
  podium3DBody: {
    width: '100%',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    alignItems: 'center',
    paddingTop: 12,
    zIndex: 1,
  },
  podium3DBodyGold: {
    height: 120,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
    borderTopWidth: 0,
  },
  podium3DBodyGoldMobile: {
    height: 95,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  podium3DBodySilver: {
    height: 90,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
    borderTopWidth: 0,
  },
  podium3DBodySilverMobile: {
    height: 70,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  podium3DBodyBronze: {
    height: 70,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
    borderTopWidth: 0,
  },
  podium3DBodyBronzeMobile: {
    height: 50,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  badge3D: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: 'rgba(3, 15, 38, 0.75)',
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    shadowOpacity: 0.4,
  },
  badge3DMobile: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    marginTop: 6,
  },
  badge3DGold: {
    borderColor: 'rgba(255, 255, 255, 0.05)',
    shadowColor: '#000000',
    shadowRadius: 8,
    shadowOpacity: 0.3,
  },
  badge3DGoldMobile: {},
  badge3DSilver: {
    borderColor: 'rgba(255, 255, 255, 0.05)',
    shadowColor: '#000000',
    shadowRadius: 6,
    shadowOpacity: 0.2,
  },
  badge3DSilverMobile: {},
  badge3DBronze: {
    borderColor: 'rgba(255, 255, 255, 0.05)',
    shadowColor: '#000000',
    shadowRadius: 6,
    shadowOpacity: 0.2,
  },
  badge3DBronzeMobile: {},
  badge3DRankText: {
    fontFamily: 'Poppins_900Black',
    color: '#FFFFFF',
    fontSize: 15,
  },
  badge3DRankTextMobile: {
    fontSize: 12,
  },
  badge3DSuffixText: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 9,
    top: -3,
  },
  badge3DSuffixTextMobile: {
    fontSize: 7,
    top: -2,
  },
  podiumBaseStageWrapper: {
    width: '108%',
    alignItems: 'center',
    marginTop: -8,
    zIndex: 3,
  },
  podiumBaseStageWrapperMobile: {
    marginTop: -6,
  },
  podiumBaseStageCap: {
    width: '100%',
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: -7,
    zIndex: 4,
  },
  podiumBaseStageCapMobile: {
    height: 10,
    borderRadius: 5,
    marginBottom: -5,
  },
  podiumBaseStageFrontGlow: {
    width: '100%',
    height: 2,
    zIndex: 5,
  },
  podiumBaseStageFront: {
    width: '100%',
    height: 12,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: '#030F0D',
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    zIndex: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 15,
    shadowOpacity: 0.5,
  },
  podiumBaseStageFrontMobile: {
    height: 8,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  compactHeaderContent: {
    gap: 4,
    marginBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginBottom: 8,
  },
  backButtonText: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
  },
  compactHeaderTitle: {
    fontFamily: 'Poppins_900Black',
    color: '#FFFFFF',
    fontSize: 26,
  },
  compactHeaderSubtitle: {
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12.5,
  },
  footerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 32,
    paddingBottom: 8,
    marginTop: 24,
  },
  staffLoginButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  staffLoginText: {
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 11.5,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  controlsMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  searchBox: {
    flex: 1,
    minHeight: 46,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    color: '#FFFFFF',
    fontSize: 13.5,
    ...Platform.select({
      web: { outlineStyle: 'none' as any },
      default: {},
    }),
  },
  categoryRow: {
    gap: 8,
  },
  categoryChip: {
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  categoryText: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
  },
  categoryTextActive: {
    color: '#10B981',
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 16,
  },
  tabButton: {
    minHeight: 40,
    minWidth: 104,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 7,
  },
  tabButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  tabText: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11.5,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  listCard: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    overflow: 'hidden',
    ...Platform.select({
      web: { backdropFilter: 'blur(16px)' },
      default: {},
    }),
  },
  listHeader: {
    minHeight: 46,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  listHeaderText: {
    width: 58,
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10.5,
    textTransform: 'uppercase',
  },
  nameHeader: {
    flex: 1,
    width: undefined,
  },
  rankRow: {
    minHeight: 70,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 11,
  },
  rankNumber: {
    width: 36,
    fontFamily: 'Poppins_900Black',
    color: '#FFFFFF',
    fontSize: 18,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 14,
  },
  rowSub: {
    marginTop: 2,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11.5,
  },
  rowPoints: {
    width: 58,
    alignItems: 'flex-end',
  },
  rowPointsValue: {
    fontFamily: 'Poppins_900Black',
    color: '#10B981',
    fontSize: 18,
    lineHeight: 20,
  },
  rowPointsLabel: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 9,
    textTransform: 'uppercase',
  },
  itemSections: {
    gap: 14,
  },
  itemSectionCard: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    overflow: 'hidden',
    ...Platform.select({
      web: { backdropFilter: 'blur(16px)' },
      default: {},
    }),
  },
  itemSectionHeader: {
    minHeight: 72,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  itemSectionHeaderMobile: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  itemSectionTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  itemSectionTitle: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
  },
  itemSectionMeta: {
    marginTop: 3,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11.5,
  },
  publishedPill: {
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 5,
  },
  publishedPillText: {
    fontFamily: 'Poppins_700Bold',
    color: '#10B981',
    fontSize: 9.5,
    textTransform: 'uppercase',
  },
  itemRow: {
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 11,
  },
  itemRankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemRankText: {
    fontFamily: 'Poppins_900Black',
    fontSize: 13.5,
  },
  itemMain: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 13.5,
  },
  itemSub: {
    marginTop: 2,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11.5,
  },
  gradePill: {
    minWidth: 32,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  gradeText: {
    fontFamily: 'Poppins_700Bold',
    color: '#3B82F6',
    fontSize: 10.5,
  },
  viewMoreButton: {
    minWidth: 138,
    height: 42,
    alignSelf: 'center',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  viewMoreText: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 12.5,
  },
  stateCard: {
    minHeight: 168,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    marginBottom: 16,
  },
  stateTitle: {
    marginTop: 12,
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 16,
  },
  stateMessage: {
    marginTop: 8,
    maxWidth: 380,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorCard: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.04)',
    padding: 20,
    marginBottom: 16,
  },
  errorTitle: {
    fontFamily: 'Poppins_700Bold',
    color: '#EF4444',
    fontSize: 15,
  },
  errorMessage: {
    marginTop: 6,
    fontFamily: 'Poppins_400Regular',
    color: '#FCA5A5',
    fontSize: 12.5,
  },
  retryButton: {
    marginTop: 14,
    height: 36,
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  retryText: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 11.5,
  },
  timelineWrapper: {
    gap: 20,
  },
  timelineGroup: {
    gap: 12,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  timelineDateText: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 14.5,
  },
  timelineItemsList: {
    gap: 10,
  },
  timelineCard: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    overflow: 'hidden',
    ...Platform.select({
      web: { backdropFilter: 'blur(16px)' },
      default: {},
    }),
  },
  timelineCardLive: {
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  timelineCardLiveIndicator: {
    height: 4,
    backgroundColor: '#10B981',
  },
  timelineCardMain: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  timelineCardTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timelineCardTimeText: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11.5,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusBadgeLive: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  statusBadgeCompleted: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  statusBadgeReporting: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  statusBadgeShuffled: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  statusBadgeText: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 9,
    textTransform: 'uppercase',
  },
  statusBadgeTextLive: {
    color: '#10B981',
  },
  statusBadgeTextCompleted: {
    color: '#3B82F6',
  },
  statusBadgeTextReporting: {
    color: '#F59E0B',
  },
  statusBadgeTextShuffled: {
    color: '#A78BFA',
  },
  timelineCardEventName: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 21,
  },
  timelineCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  timelineCardMetaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  timelineCardMetaBadgeText: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9.5,
  },
  timelineCardVenue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 4,
  },
  timelineCardVenueText: {
    fontFamily: 'Poppins_700Bold',
    color: '#FBBF24',
    fontSize: 11,
  },
  teamPointBannerContainer: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
    position: 'relative',
  },
  teamPointBannerGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  teamPointBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  teamPointBannerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamPointBannerTextCol: {
    flex: 1,
  },
  teamPointBannerTitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  teamPointBannerValue: {
    color: '#FBBF24',
    fontFamily: 'Poppins_900Black',
    fontSize: 16,
    marginTop: 2,
  },
});

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.stateCard}>
      <ShieldCheck size={28} color="#10B981" />
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
    </View>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <View style={styles.stateCard}>
      <ActivityIndicator color="#10B981" />
      <Text style={styles.stateMessage}>{label}</Text>
    </View>
  );
}
