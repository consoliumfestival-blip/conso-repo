import React, { useMemo, useState, useCallback } from 'react';
import { isNewerResult } from '../../../core/utils/currentResult';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Medal, Search, Trophy, UserRound, X, ChevronDown } from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { useGetPublicLeaderboardSettings } from '../../../core/hooks/useLeaderboardSettings';
import { usePublicPublishedResults } from '../../../core/hooks/useLeaderboard';

// ── Palette (same tokens as leaderboard.tsx) ─────────────────────────────────
const P = {
  page:    '#030E21',
  line:    'rgba(255,255,255,0.08)',
  text:    '#FFFFFF',
  muted:   'rgba(255,255,255,0.5)',
  muted2:  'rgba(255,255,255,0.3)',
  gold:    '#FBBF24',
  silver:  '#9CA3AF',
  bronze:  '#D97706',
  green:   '#10B981',
  blue:    '#3B82F6',
  cyan:    '#06B6D4',
  magenta: '#8B5CF6',
  glass:   'rgba(255,255,255,0.04)',
  glassBorder: 'rgba(255,255,255,0.08)',
};

const PAGE_SIZE = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────
const accentByRank = (rank: number) => {
  if (rank === 1) return P.gold;
  if (rank === 2) return P.silver;
  if (rank === 3) return P.bronze;
  return [P.green, P.blue, P.cyan, P.magenta][rank % 4];
};

type IndividualRow = {
  id: string;
  name: string;
  organisation: string;
  category: string | null;
  chest: string;
  profileSlug: string | null;
  points: number;
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaces: number;
  resultCount: number;
  rank: number;
  accent: string;
};

// ── Aggregation (matches IndividualRankingsPage + toIndividualRows logic) ─────
function aggregateIndividuals(results: any[]): IndividualRow[] {
  const grouped = new Map<string, {
    id: string; name: string; organisation: string;
    category: string | null; chest: string; profileSlug: string | null;
    points: number; firstPlaces: number; secondPlaces: number;
    thirdPlaces: number; resultCount: number;
  }>();

  // Dedup per participant+item by publication version, not award magnitude.
  const dedup = new Map<string, any>();
  results.forEach((r) => {
    if (r.is_group || !r.participant_id) return;
    const key = `${r.participant_id}-${r.item_id}`;
    const existing = dedup.get(key);
    if (!existing || isNewerResult(r, existing)) {
      dedup.set(key, r);
    }
  });

  dedup.forEach((r) => {
    const pid = r.participant_id!;
    const g = grouped.get(pid);
    if (g) {
      g.points     += r.points_awarded || 0;
      g.resultCount++;
      if (r.rank === 1) g.firstPlaces++;
      else if (r.rank === 2) g.secondPlaces++;
      else if (r.rank === 3) g.thirdPlaces++;
      if (!g.profileSlug && r.participant_profile_slug) g.profileSlug = r.participant_profile_slug;
    } else {
      grouped.set(pid, {
        id:           pid,
        name:         r.participant_name || `Chest #${r.chest_number}` || 'Participant',
        organisation: r.organisation_name || '',
        category:     r.participant_category_code || null,
        chest:        r.chest_number || '',
        profileSlug:  r.participant_profile_slug || null,
        points:       r.points_awarded || 0,
        firstPlaces:  r.rank === 1 ? 1 : 0,
        secondPlaces: r.rank === 2 ? 1 : 0,
        thirdPlaces:  r.rank === 3 ? 1 : 0,
        resultCount:  1,
      });
    }
  });

  return Array.from(grouped.values())
    .sort((a, b) => b.points - a.points || b.firstPlaces - a.firstPlaces || a.name.localeCompare(b.name))
    .map((row, i) => ({
      ...row,
      rank:   i + 1,
      accent: accentByRank(i + 1),
    }));
}

// ── Rank Medal Badge ──────────────────────────────────────────────────────────
function RankBadge({ rank, accent, size = 'md' }: { rank: number; accent: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 32 : 40;
  const fs  = size === 'sm' ? 13 : 17;
  return (
    <View style={[
      { width: dim, height: dim, borderRadius: dim / 2, borderWidth: 1.5,
        borderColor: accent, backgroundColor: `${accent}18`,
        alignItems: 'center', justifyContent: 'center' },
    ]}>
      <Text style={{ fontFamily: 'Poppins_900Black', color: accent, fontSize: fs, lineHeight: fs + 2 }}>
        {rank}
      </Text>
    </View>
  );
}

// ── Mobile Card Row ───────────────────────────────────────────────────────────
function MobileRow({ row, onPress }: { row: IndividualRow; onPress: () => void }) {
  const isTop3 = row.rank <= 3;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.mobileRow,
        isTop3 && { borderColor: `${row.accent}30` },
        pressed && { opacity: 0.82 },
      ]}
    >
      {/* Left: rank + icon */}
      <View style={styles.mobileRowLeft}>
        <RankBadge rank={row.rank} accent={row.accent} size="sm" />
      </View>

      {/* Center: name + meta */}
      <View style={styles.mobileRowCenter}>
        <Text style={[styles.mobileRowName, isTop3 && { color: row.accent }]} numberOfLines={1}>
          {row.name}
        </Text>
        <View style={styles.mobileRowMeta}>
          {row.category ? (
            <View style={styles.mobileChip}>
              <Text style={styles.mobileChipText}>{row.category.toUpperCase()}</Text>
            </View>
          ) : null}
          <Text style={styles.mobileRowSub} numberOfLines={1}>{row.organisation}</Text>
        </View>
        <Text style={styles.openProfileText}>Open candidate profile</Text>
        {/* Win badges */}
        <View style={styles.mobileBadgeRow}>
          {row.firstPlaces > 0 && (
            <View style={[styles.winBadge, { backgroundColor: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.25)' }]}>
              <Text style={[styles.winBadgeText, { color: P.gold }]}>🥇 {row.firstPlaces}</Text>
            </View>
          )}
          {row.secondPlaces > 0 && (
            <View style={[styles.winBadge, { backgroundColor: 'rgba(156,163,175,0.12)', borderColor: 'rgba(156,163,175,0.25)' }]}>
              <Text style={[styles.winBadgeText, { color: P.silver }]}>🥈 {row.secondPlaces}</Text>
            </View>
          )}
          {row.thirdPlaces > 0 && (
            <View style={[styles.winBadge, { backgroundColor: 'rgba(217,119,6,0.12)', borderColor: 'rgba(217,119,6,0.25)' }]}>
              <Text style={[styles.winBadgeText, { color: P.bronze }]}>🥉 {row.thirdPlaces}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Right: points */}
      <View style={styles.mobileRowRight}>
        <Text style={[styles.mobilePoints, { color: isTop3 ? row.accent : P.green }]}>{row.points}</Text>
        <Text style={styles.mobilePointsLabel}>pts</Text>
      </View>
    </Pressable>
  );
}

// ── Desktop Table Row ─────────────────────────────────────────────────────────
function DesktopRow({ row, onPress }: { row: IndividualRow; onPress: () => void }) {
  const isTop3 = row.rank <= 3;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.desktopRow,
        isTop3 && { borderLeftColor: row.accent, borderLeftWidth: 3 },
        pressed && { opacity: 0.82 },
      ]}
    >
      {/* Rank */}
      <View style={styles.desktopRankCol}>
        <RankBadge rank={row.rank} accent={row.accent} />
      </View>
      {/* Icon + Name */}
      <View style={styles.desktopIconCol}>
        <View style={[styles.desktopIcon, { backgroundColor: `${row.accent}20` }]}>
          <UserRound size={17} color={row.accent} />
        </View>
      </View>
      <View style={styles.desktopNameCol}>
        <Text style={[styles.desktopName, isTop3 && { color: row.accent }]} numberOfLines={1}>{row.name}</Text>
        <Text style={styles.desktopSub} numberOfLines={1}>Chest #{row.chest}</Text>
        <Text style={styles.openProfileText}>Open candidate profile</Text>
      </View>
      {/* Unit */}
      <View style={styles.desktopChestCol}>
        <Text style={styles.desktopSub} numberOfLines={2}>{row.organisation}</Text>
      </View>
      {/* Win counts */}
      <View style={styles.desktopWinsCol}>
        <View style={styles.desktopWinsRow}>
          <Text style={[styles.desktopWinVal, { color: P.gold }]}>{row.firstPlaces}</Text>
          <Text style={[styles.desktopWinVal, { color: P.silver }]}>{row.secondPlaces}</Text>
          <Text style={[styles.desktopWinVal, { color: P.bronze }]}>{row.thirdPlaces}</Text>
        </View>
      </View>
      {/* Points */}
      <View style={styles.desktopPtsCol}>
        <Text style={[styles.desktopPoints, { color: isTop3 ? row.accent : P.green }]}>{row.points}</Text>
        <Text style={styles.desktopPtsLabel}>pts</Text>
      </View>
    </Pressable>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function IndividualRankingsPublicPage() {
  const router = useRouter();
  const { tenant_id: qTenantId } = useLocalSearchParams<{ tenant_id?: string }>();
  const { tenant_id: authTenantId } = useAuthStore();
  const { width } = useWindowDimensions();
  const isMobile = width < 760;
  const isDesktop = width >= 1120;

  const tenantId = (Array.isArray(qTenantId) ? qTenantId[0] : qTenantId) || authTenantId || null;
  const settingsQ = useGetPublicLeaderboardSettings(tenantId);
  const festivalId = settingsQ.data?.festival_id;
  const festivalName = settingsQ.data?.public_festival_name?.trim() || 'Festival';

  const resultsQ = usePublicPublishedResults(tenantId, festivalId, !!tenantId && !!festivalId, true);

  const [search, setSearch]     = useState('');
  const [catFilter, setCat]     = useState('All');
  const [visible, setVisible]   = useState(PAGE_SIZE);

  // Category options
  const catOptions = useMemo(() => {
    const codes = new Set<string>();
    (resultsQ.data ?? []).forEach((r: any) => {
      if (r.participant_category_code) codes.add(r.participant_category_code);
    });
    return ['All', ...Array.from(codes).sort()];
  }, [resultsQ.data]);

  // Filter + aggregate
  const allRows = useMemo(() => {
    const data = resultsQ.data ?? [];
    const filtered = data.filter((r: any) => {
      if (catFilter !== 'All' && r.participant_category_code !== catFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (r.participant_name?.toLowerCase().includes(q) ||
                r.chest_number?.toLowerCase().includes(q) ||
                r.organisation_name?.toLowerCase().includes(q));
      }
      return true;
    });
    return aggregateIndividuals(filtered);
  }, [resultsQ.data, catFilter, search]);

  const visibleRows = allRows.slice(0, visible);
  const hasMore = allRows.length > visible;

  const openProfile = useCallback((row: IndividualRow) => {
    if (row.profileSlug) router.push(`/candidate/${row.profileSlug}` as any);
  }, [router]);

  const isLoading = resultsQ.isLoading || settingsQ.isLoading;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.scrollContentDesktop,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={[styles.header, isDesktop && styles.headerDesktop]}>
          <TouchableOpacity
            onPress={() => router.replace('/(public)/leaderboard' as never)}
            style={styles.backBtn}
            activeOpacity={0.8}
          >
            <ArrowLeft size={14} color="rgba(255,255,255,0.75)" />
            <Text style={styles.backBtnText}>Back to Portal</Text>
          </TouchableOpacity>

          <View style={[styles.headerTitleRow, isDesktop && styles.headerTitleRowDesktop]}>
            <View style={styles.headerIconBox}>
              <Trophy size={isMobile ? 20 : 26} color={P.gold} />
            </View>
            <View>
              <Text style={[styles.pageTitle, isMobile && styles.pageTitleMobile]}>
                Individual Rankings
              </Text>
              <Text style={styles.pageSubtitle}>{festivalName} · Official public results</Text>
            </View>
          </View>
        </View>

        {/* ── Search + Category ── */}
        <View style={[styles.controls, isMobile && styles.controlsMobile]}>
          <View style={styles.searchBox}>
            <Search size={16} color="rgba(255,255,255,0.4)" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, chest no. or unit…"
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={styles.searchInput}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <X size={15} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            {catOptions.map((opt) => {
              const active = catFilter === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  onPress={() => setCat(opt)}
                  style={[styles.catChip, active && styles.catChipActive]}
                >
                  <Text style={[styles.catChipText, active && styles.catChipTextActive]}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Content ── */}
        {isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color={P.green} size="large" />
            <Text style={styles.stateText}>Loading rankings…</Text>
          </View>
        ) : allRows.length === 0 ? (
          <View style={styles.stateBox}>
            <Medal size={42} color="rgba(255,255,255,0.15)" />
            <Text style={styles.stateTitle}>No rankings yet</Text>
            <Text style={styles.stateText}>Individual rankings will appear here once results are published.</Text>
          </View>
        ) : isMobile ? (
          /* ── MOBILE LAYOUT ── */
          <View style={styles.mobileList}>
            {/* Summary strip */}
            <View style={styles.mobileSummaryStrip}>
              <View style={styles.mobileStat}>
                <Text style={styles.mobileStatVal}>{allRows.length}</Text>
                <Text style={styles.mobileStatLabel}>Ranked</Text>
              </View>
              <View style={styles.mobileStatDivider} />
              <View style={[styles.mobileStat, { flex: 2 }]}>
                <Text 
                  style={[styles.mobileStatVal, { color: P.gold, paddingHorizontal: 4, fontSize: 14, textAlign: 'center' }]} 
                >
                  {allRows[0]?.name || '—'}
                </Text>
                <Text style={styles.mobileStatLabel}>Leader</Text>
              </View>
              <View style={styles.mobileStatDivider} />
              <View style={styles.mobileStat}>
                <Text style={[styles.mobileStatVal, { color: P.green }]}>{allRows[0]?.points ?? 0}</Text>
                <Text style={styles.mobileStatLabel}>Top Score</Text>
              </View>
            </View>

            {/* Card list */}
            {visibleRows.map((row) => (
              <MobileRow
                key={row.id}
                row={row}
                onPress={() => openProfile(row)}
              />
            ))}
          </View>
        ) : (
          /* ── DESKTOP LAYOUT ── */
          <View style={styles.desktopCard}>
            {/* Table header */}
            <View style={styles.desktopTableHead}>
              <View style={styles.desktopRankCol}>
                <Text style={styles.desktopHeadText}>Rank</Text>
              </View>
              <View style={[styles.desktopIconCol, { width: 48 }]} />
              <View style={styles.desktopNameCol}>
                <Text style={styles.desktopHeadText}>Participant</Text>
              </View>
              <View style={styles.desktopChestCol}>
                <Text style={styles.desktopHeadText}>Unit</Text>
              </View>
              <View style={styles.desktopWinsCol}>
                <Text style={styles.desktopHeadText}>🥇  🥈  🥉</Text>
              </View>
              <View style={styles.desktopPtsCol}>
                <Text style={[styles.desktopHeadText, { textAlign: 'right' }]}>Points</Text>
              </View>
            </View>

            {/* Rows */}
            {visibleRows.map((row) => (
              <DesktopRow key={row.id} row={row} onPress={() => openProfile(row)} />
            ))}
          </View>
        )}

        {/* Load More */}
        {hasMore && (
          <TouchableOpacity
            onPress={() => setVisible((v) => v + PAGE_SIZE)}
            style={styles.loadMoreBtn}
            activeOpacity={0.8}
          >
            <ChevronDown size={16} color={P.text} />
            <Text style={styles.loadMoreText}>
              Show more ({allRows.length - visible} remaining)
            </Text>
          </TouchableOpacity>
        )}

        {/* Footer spacer */}
        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: P.page,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  scrollContentDesktop: {
    paddingHorizontal: 64,
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },

  // ── Header ──
  header: {
    marginBottom: 24,
    gap: 12,
  },
  headerDesktop: {
    marginBottom: 32,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: P.glassBorder,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  backBtnText: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitleRowDesktop: {
    gap: 16,
  },
  headerIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontFamily: 'Poppins_900Black',
    color: P.text,
    fontSize: 24,
    lineHeight: 30,
  },
  pageTitleMobile: {
    fontSize: 20,
    lineHeight: 26,
  },
  pageSubtitle: {
    fontFamily: 'Poppins_400Regular',
    color: P.muted,
    fontSize: 12,
  },

  // ── Controls ──
  controls: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    alignItems: 'center',
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
    borderColor: P.glassBorder,
    backgroundColor: P.glass,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    color: P.text,
    fontSize: 13.5,
    ...Platform.select({ web: { outlineStyle: 'none' as any }, default: {} }),
  },
  catRow: {
    gap: 8,
  },
  catChip: {
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: P.glassBorder,
    backgroundColor: P.glass,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catChipActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: 'rgba(16,185,129,0.35)',
  },
  catChipText: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
  catChipTextActive: {
    color: P.green,
  },

  // ── State boxes ──
  stateBox: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: P.glassBorder,
    borderRadius: 12,
    backgroundColor: P.glass,
    padding: 24,
  },
  stateTitle: {
    fontFamily: 'Poppins_700Bold',
    color: P.text,
    fontSize: 16,
  },
  stateText: {
    fontFamily: 'Poppins_400Regular',
    color: P.muted,
    fontSize: 13,
    textAlign: 'center',
  },

  // ── Mobile layout ──
  mobileList: {
    gap: 8,
  },
  mobileSummaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: P.glassBorder,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 4,
    gap: 0,
  },
  mobileStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  mobileStatVal: {
    fontFamily: 'Poppins_900Black',
    color: P.text,
    fontSize: 18,
    lineHeight: 22,
  },
  mobileStatLabel: {
    fontFamily: 'Poppins_400Regular',
    color: P.muted,
    fontSize: 10,
  },
  mobileStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: P.glassBorder,
  },

  // Mobile row card
  mobileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: P.glass,
    borderWidth: 1,
    borderColor: P.glassBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...Platform.select({ web: { backdropFilter: 'blur(16px)' }, default: {} }),
  },
  mobileRowLeft: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileRowCenter: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  mobileRowName: {
    fontFamily: 'Poppins_700Bold',
    color: P.text,
    fontSize: 14,
    lineHeight: 18,
  },
  mobileRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mobileChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mobileChipText: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
  },
  mobileRowSub: {
    fontFamily: 'Poppins_400Regular',
    color: P.muted,
    fontSize: 11.5,
    flex: 1,
  },
  openProfileText: {
    fontFamily: 'Poppins_700Bold',
    color: P.green,
    fontSize: 10,
    marginTop: 2,
    marginBottom: 4,
  },
  mobileBadgeRow: {
    flexDirection: 'row',
    gap: 5,
    flexWrap: 'wrap',
  },
  winBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  winBadgeText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 10,
  },
  mobileRowRight: {
    alignItems: 'flex-end',
    minWidth: 52,
  },
  mobilePoints: {
    fontFamily: 'Poppins_900Black',
    fontSize: 22,
    lineHeight: 26,
  },
  mobilePointsLabel: {
    fontFamily: 'Poppins_700Bold',
    color: P.muted2,
    fontSize: 9,
    textTransform: 'uppercase',
  },

  // ── Desktop layout ──
  desktopCard: {
    borderWidth: 1,
    borderColor: P.glassBorder,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
    ...Platform.select({ web: { backdropFilter: 'blur(16px)' }, default: {} }),
  },
  desktopTableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: P.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.02)',
    gap: 12,
  },
  desktopHeadText: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10.5,
    textTransform: 'uppercase',
  },
  desktopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    gap: 12,
    borderLeftWidth: 0,
    borderLeftColor: 'transparent',
  },
  desktopRankCol: {
    width: 52,
    alignItems: 'center',
  },
  desktopIconCol: {
    width: 48,
    alignItems: 'center',
  },
  desktopIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopNameCol: {
    flex: 1,
    minWidth: 0,
  },
  desktopName: {
    fontFamily: 'Poppins_700Bold',
    color: P.text,
    fontSize: 14.5,
  },
  desktopSub: {
    fontFamily: 'Poppins_400Regular',
    color: P.muted,
    fontSize: 11.5,
    marginTop: 2,
  },
  desktopChestCol: {
    width: 80,
    alignItems: 'center',
  },
  desktopChest: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  desktopWinsCol: {
    width: 120,
  },
  desktopWinsRow: {
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'center',
  },
  desktopWinVal: {
    fontFamily: 'Poppins_900Black',
    fontSize: 15,
    width: 20,
    textAlign: 'center',
  },
  desktopPtsCol: {
    width: 72,
    alignItems: 'flex-end',
  },
  desktopPoints: {
    fontFamily: 'Poppins_900Black',
    fontSize: 20,
    lineHeight: 24,
  },
  desktopPtsLabel: {
    fontFamily: 'Poppins_700Bold',
    color: P.muted2,
    fontSize: 9,
    textTransform: 'uppercase',
  },

  // ── Load more ──
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: P.glassBorder,
    backgroundColor: P.glass,
    marginTop: 16,
  },
  loadMoreText: {
    fontFamily: 'Poppins_700Bold',
    color: P.text,
    fontSize: 12.5,
  },
});
