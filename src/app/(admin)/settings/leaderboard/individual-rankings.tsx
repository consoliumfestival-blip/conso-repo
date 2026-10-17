import { ui } from "@/constants/designSystem";
import React, { useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  RefreshCw,
  Search,
  Sparkles,
  User,
  X,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFestival } from '../../../../core/hooks/useFestival';
import { useFestivalCategories } from '../../../../core/hooks/useFestivalCategories';
import { useResultVisibility } from '../../../../core/hooks/useResultVisibility';
import { useAuthStore } from '../../../../core/store/authStore';
import { participantService } from '../../../../services/participantService';

const colors = {
  navy: ui.colors.primaryHover,
  blue: ui.colors.primary,
  cyan: ui.colors.info,
  teal: ui.colors.primary,
  green: ui.colors.success,
  bg: ui.colors.background,
  card: ui.colors.surface,
  border: ui.colors.border,
  text: ui.colors.text,
  muted: ui.colors.textMuted,
  soft: ui.colors.infoSoft,
};

const rankPalette = ['#F59E0B', ui.colors.textSubtle, '#B45309'];

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

const RankBadge = ({ rank }: { rank: number }) => {
  const isTop = rank <= 3;
  return (
    <View
      style={[
        styles.rankBadge,
        isTop && { backgroundColor: `${rankPalette[rank - 1]}18`, borderColor: rankPalette[rank - 1] },
      ]}
    >
      <Text style={[styles.rankBadgeText, isTop && { color: rankPalette[rank - 1] }]}>#{rank}</Text>
    </View>
  );
};

export default function IndividualRankingsPage() {
  const router = useRouter();
  const { tenant_id } = useAuthStore();
  const { width } = useWindowDimensions();
  const isMobile = width < 760;

  // Load active festival ID
  const { useActiveFestival, useItems } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const festivalId = activeFestival?.id;
  const { data: festivalCategories = [] } = useFestivalCategories(festivalId, true);
  const { data: festivalItems = [] } = useItems(festivalId);

  // Load results for aggregation
  const {
    results: festivalResults,
    error: resultsError,
    isLoading: isResultsLoading,
    isRefetching: isResultsRefetching,
    refetch: refetchResults,
  } = useResultVisibility(tenant_id, festivalId);

  // States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'published' | 'all'>('published');
  const [openingProfileKey, setOpeningProfileKey] = useState<string | null>(null);

  const categoryOptions = useMemo(
    () => ['all', ...festivalCategories.map((category) => category.code.toLowerCase())],
    [festivalCategories],
  );

  const itemCategoryCodes = useMemo(() => new Map(
    festivalItems.map((item: any) => [
      item.id,
      (Array.isArray(item.category_codes) ? item.category_codes : []).map((code: string) => code.toLowerCase()),
    ]),
  ), [festivalItems]);

  React.useEffect(() => {
    if (!categoryOptions.includes(selectedCategory)) setSelectedCategory('all');
  }, [categoryOptions, selectedCategory]);

  // Aggregated Individual Rankings
  const participantRankings = useMemo(() => {
    const individualResults = festivalResults.filter(r => {
      // 1. Only individual items
      if (r.is_group) return false;

      // 2. Status check (Published vs All)
      // Ensure "published" means it is visible on the public leaderboard
      if (statusFilter === 'published' && r.public_visible !== true) return false;

      // 3. Category match based on item name/ml prefix
      const categoryMatch = selectedCategory === 'all'
        || itemCategoryCodes.get(r.item_id ?? '')?.includes(selectedCategory) === true;
        
      // 4. Exclude General items from individual rankings
      const itemCodes = itemCategoryCodes.get(r.item_id ?? '') || [];
      const isGeneral = itemCodes.includes('GN') || itemCodes.includes('GENERAL');
      if (isGeneral) return false;

      return categoryMatch;
    });

    const groups: Record<string, {
      participant_id: string | null;
      participant_name: string;
      chest_number: string;
      organisation_name: string;
      total_points: number;
      gradeSummary: Record<string, number>;
      wins: number;
      first_places: number;
      second_places: number;
      third_places: number;
      qualified: boolean;
    }> = {};

    // 1. Strict Deduplication Layer
    // Prevents accidental duplicate result rows from inflating points/grades.
    const dedupedResults = new Map<string, typeof individualResults[0]>();
    
    individualResults.forEach(r => {
      // Key by participant and item for true duplication prevention
      const key = `${r.participant_id || r.chest_number}-${r.item_id}`;
      const existing = dedupedResults.get(key);
      
      // Result version validation: keep the one with higher points if duplicated
      if (!existing || (r.points_awarded || 0) > (existing.points_awarded || 0)) {
        dedupedResults.set(key, r);
      }
    });

    // 2. Aggregation Layer
    dedupedResults.forEach(r => {
      const key = r.chest_number || r.participant_name || r.result_id;
      if (!key) return;

      if (!groups[key]) {
        groups[key] = {
          participant_id: r.participant_id || null,
          participant_name: r.participant_name || `Chest #${r.chest_number}`,
          chest_number: r.chest_number || '—',
          organisation_name: r.organisation_name || 'Unassigned Unit',
          total_points: 0,
          gradeSummary: {},
          wins: 0,
          first_places: 0,
          second_places: 0,
          third_places: 0,
          qualified: false,
        };
      }

      const g = groups[key];
      g.total_points += r.points_awarded || 0;

      if (r.grade) {
        g.gradeSummary[r.grade] = (g.gradeSummary[r.grade] || 0) + 1;
      }

      if (r.rank) {
        g.wins++;
        if (r.rank === 1) {
          g.first_places++;
          g.qualified = true; // Rank 1 qualifies for next level
        } else if (r.rank === 2) {
          g.second_places++;
        } else if (r.rank === 3) {
          g.third_places++;
        }
      }
    });

    const sortedList = Object.values(groups).sort((a, b) => b.total_points - a.total_points);

    return sortedList.filter(p => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return p.participant_name.toLowerCase().includes(query)
        || p.chest_number.toLowerCase().includes(query)
        || p.organisation_name.toLowerCase().includes(query);
    });
  }, [festivalResults, searchQuery, selectedCategory, statusFilter, itemCategoryCodes]);

  const openCandidateProfile = async (participantId: string | null) => {
    if (!participantId) {
      Alert.alert('Profile unavailable', 'This ranking row is not connected to a participant record.');
      return;
    }

    setOpeningProfileKey(participantId);
    try {
      const participant = await participantService.getParticipant<any>(participantId);
      if (!participant?.profile_slug) {
        Alert.alert('Profile unavailable', 'Save this participant once to generate a public profile slug.');
        return;
      }
      router.push(`/candidate/${participant.profile_slug}` as any);
    } catch (error: any) {
      Alert.alert('Profile unavailable', error.message || 'Unable to open candidate profile.');
    } finally {
      setOpeningProfileKey(null);
    }
  };

  const renderGradesSummary = (grades: Record<string, number>) => {
    const list = Object.entries(grades).sort((a, b) => a[0].localeCompare(b[0]));
    if (!list.length) return <Text style={styles.emptyGrades}>—</Text>;
    return (
      <View style={styles.gradesList}>
        {list.map(([grade, count]) => (
          <View key={grade} style={styles.gradeBadge}>
            <Text style={styles.gradeText}>{grade}</Text>
            <View style={styles.gradeCountBox}>
              <Text style={styles.gradeCountText}>{count}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderTable = () => {
    if (isResultsLoading) {
      return (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.teal} />
          <Text style={styles.loadingText}>Calculating individual standings...</Text>
        </View>
      );
    }

    if (resultsError) {
      return (
        <View style={styles.loadingBox}>
          <Text style={styles.errorText}>Unable to load admin rankings.</Text>
          <Text style={styles.loadingText}>{resultsError.message}</Text>
        </View>
      );
    }

    if (participantRankings.length === 0) {
      return (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>No individual rankings found.</Text>
        </View>
      );
    }

    if (isMobile) {
      return (
        <View style={{ gap: 12 }}>
          {participantRankings.map((p, index) => (
            <View key={p.participant_id || `${p.chest_number}:${p.participant_name}`} style={styles.mobileRowCard}>
              <View style={styles.mobileRowHeader}>
                <RankBadge rank={index + 1} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.unitName}>{p.participant_name}</Text>
                  <Text style={styles.unitMeta}>Chest #{p.chest_number} • {p.organisation_name}</Text>
                </View>
                <Text style={styles.pointsValue}>{formatNumber(p.total_points)}</Text>
              </View>

              <View style={styles.mobileRowFooter}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gradesLabel}>Grades Summary</Text>
                  {renderGradesSummary(p.gradeSummary)}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {p.first_places > 0 && <Text style={styles.mobileStat}>🥇 {p.first_places}</Text>}
                    {p.second_places > 0 && <Text style={styles.mobileStat}>🥈 {p.second_places}</Text>}
                    {p.third_places > 0 && <Text style={styles.mobileStat}>🥉 {p.third_places}</Text>}
                  </View>
                  {p.qualified && (
                    <View style={styles.qualifiedBadge}>
                      <Sparkles size={11} color="#047857" />
                      <Text style={styles.qualifiedBadgeText}>Qualified</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => openCandidateProfile(p.participant_id)}
                    disabled={openingProfileKey === p.participant_id}
                    style={styles.profileButton}
                  >
                    <User size={12} color={colors.teal} />
                    <Text style={styles.profileButtonText}>
                      {openingProfileKey === p.participant_id ? 'Opening...' : 'Profile'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>
      );
    }

    return (
      <View>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { flex: 0.6 }]}>Rank</Text>
          <Text style={[styles.th, { flex: 2.2 }]}>Participant</Text>
          <Text style={[styles.th, { flex: 1.8 }]}>Unit / Organisation</Text>
          <Text style={[styles.th, { flex: 1.5 }]}>Grades Summary</Text>
          <Text style={[styles.th, { flex: 1.0, textAlign: 'center' }]}>Places Won</Text>
          <Text style={[styles.th, { flex: 1.1, textAlign: 'right' }]}>Total Points</Text>
          <Text style={[styles.th, { flex: 1.0, textAlign: 'center' }]}>Qualification</Text>
        </View>
        {participantRankings.map((p, index) => (
          <View key={p.participant_id || `${p.chest_number}:${p.participant_name}`} style={styles.tableRow}>
            <View style={{ flex: 0.6 }}>
              <RankBadge rank={index + 1} />
            </View>
            <View style={{ flex: 2.2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.avatar}>
                <User size={15} color={colors.muted} />
              </View>
              <View>
                <Text style={styles.unitName}>{p.participant_name}</Text>
                <Text style={styles.unitMeta}>Chest #{p.chest_number}</Text>
                <TouchableOpacity
                  onPress={() => openCandidateProfile(p.participant_id)}
                  disabled={openingProfileKey === p.participant_id}
                  style={styles.inlineProfileButton}
                >
                  <Text style={styles.profileButtonText}>
                    {openingProfileKey === p.participant_id ? 'Opening profile...' : 'Open candidate profile'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={[styles.td, { flex: 1.8 }]} numberOfLines={1}>{p.organisation_name}</Text>
            <View style={{ flex: 1.5 }}>
              {renderGradesSummary(p.gradeSummary)}
            </View>
            <View style={{ flex: 1.0, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              <View style={styles.placeRow}>
                {p.first_places > 0 && (
                  <View style={[styles.miniPlaceBadge, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={{ fontSize: 10 }}>🥇 {p.first_places}</Text>
                  </View>
                )}
                {p.second_places > 0 && (
                  <View style={[styles.miniPlaceBadge, { backgroundColor: '#F1F5F9' }]}>
                    <Text style={{ fontSize: 10 }}>🥈 {p.second_places}</Text>
                  </View>
                )}
                {p.third_places > 0 && (
                  <View style={[styles.miniPlaceBadge, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={{ fontSize: 10 }}>🥉 {p.third_places}</Text>
                  </View>
                )}
                {p.first_places === 0 && p.second_places === 0 && p.third_places === 0 && (
                  <Text style={styles.emptyGrades}>—</Text>
                )}
              </View>
            </View>
            <Text style={[styles.pointsValue, { flex: 1.1, textAlign: 'right' }]}>
              {formatNumber(p.total_points)}
            </Text>
            <View style={{ flex: 1.0, alignItems: 'center' }}>
              {p.qualified ? (
                <View style={styles.qualifiedBadge}>
                  <Sparkles size={11} color="#047857" style={{ marginRight: 3 }} />
                  <Text style={styles.qualifiedBadgeText}>Qualified</Text>
                </View>
              ) : (
                <Text style={styles.emptyGrades}>—</Text>
              )}
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.tableCard}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Individual Participant Rankings</Text>
          <Text style={styles.cardSubTitle}>
            Detailed points standings for individual participants across all enabled items.
          </Text>
        </View>
        <TouchableOpacity onPress={() => refetchResults()} style={styles.secondaryAction}>
          <RefreshCw size={16} color={colors.teal} />
          <Text style={styles.secondaryActionText}>{isResultsRefetching ? 'Recalculating' : 'Recalculate'}</Text>
        </TouchableOpacity>
      </View>

      {/* Search and Filters */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchBox}>
          <Search size={18} color={colors.muted} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search by participant name, chest number or unit..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters */}
      <View style={styles.resultFilters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <View style={styles.chipRow}>
            {/* Category Chips */}
            {categoryOptions.map(cat => (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, selectedCategory === cat && styles.filterChipTextActive]}>
                  {cat === 'all' ? 'All Categories' : cat.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.filterDivider} />

            {/* Audit Status filter */}
            {(['published', 'all'] as const).map(status => (
              <TouchableOpacity
                key={status}
                onPress={() => setStatusFilter(status)}
                style={[styles.filterChip, statusFilter === status && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, statusFilter === status && styles.filterChipTextActive]}>
                  {status === 'published' ? '✨ Published standings' : '🔍 Include draft/ready'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Rankings Table */}
      {renderTable()}
    </View>
  );
}

const styles = StyleSheet.create({
  tableCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: ui.shadow.shadowColor,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    width: '100%',
  },
  cardHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    color: colors.text,
    fontFamily: 'Poppins_900Black',
    fontSize: 20,
  },
  cardSubTitle: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  secondaryAction: {
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: ui.colors.background,
  },
  secondaryActionText: {
    color: colors.teal,
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
  },
  searchBarContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  searchBox: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: ui.colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: 'Poppins_500Medium',
    fontSize: 13,
    padding: 0,
  },
  resultFilters: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterScroll: {
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChip: {
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: ui.colors.surface,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  filterChipText: {
    color: colors.muted,
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
  },
  filterChipTextActive: {
    color: ui.colors.surface,
  },
  filterDivider: {
    width: 1.5,
    height: 18,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  loadingBox: {
    paddingVertical: 56,
    alignItems: 'center',
  },
  loadingText: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    marginTop: 10,
  },
  errorText: {
    color: ui.colors.destructive,
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
  },
  tableHeader: {
    minHeight: 44,
    backgroundColor: ui.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  th: {
    color: colors.muted,
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  tableRow: {
    minHeight: 74,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: ui.colors.border,
  },
  rankBadge: {
    alignSelf: 'flex-start',
    minWidth: 46,
    height: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    color: colors.navy,
    fontFamily: 'Poppins_900Black',
    fontSize: 13,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unitName: {
    color: colors.text,
    fontFamily: 'Poppins_700Bold',
    fontSize: 14,
  },
  unitMeta: {
    color: colors.muted,
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
    marginTop: 1,
  },
  td: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
  },
  pointsValue: {
    color: colors.blue,
    fontFamily: 'Poppins_900Black',
    fontSize: 18,
  },
  emptyGrades: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
  },
  gradesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gradeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingLeft: 6,
    overflow: 'hidden',
  },
  gradeText: {
    color: colors.text,
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
    marginRight: 4,
  },
  gradeCountBox: {
    backgroundColor: colors.teal,
    paddingHorizontal: 5,
    paddingVertical: 1,
    height: '100%',
    justifyContent: 'center',
  },
  gradeCountText: {
    color: ui.colors.surface,
    fontFamily: 'Poppins_700Bold',
    fontSize: 10,
  },
  placeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  miniPlaceBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qualifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'center',
  },
  qualifiedBadgeText: {
    color: '#065F46',
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
  },
  profileButton: {
    minHeight: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: ui.colors.background,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  inlineProfileButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  profileButtonText: {
    color: colors.teal,
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
  },
  mobileRowCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: ui.colors.surface,
    padding: 14,
  },
  mobileRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mobileRowFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: ui.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mobileStat: {
    color: colors.text,
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
  },
  gradesLabel: {
    color: colors.muted,
    fontFamily: 'Poppins_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
});
