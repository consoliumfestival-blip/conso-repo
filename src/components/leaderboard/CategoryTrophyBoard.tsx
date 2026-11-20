import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Crown, Trophy } from 'lucide-react-native';
import { useAdminCategoryTrophy, useCategoryTrophyMode, usePublicCategoryTrophy } from '@/core/hooks/useCategoryTrophy';

type Props = {
  tenantId?: string | null;
  festivalId?: string | null;
  audience: 'public' | 'admin';
};

const colors = {
  card: '#FFFFFF',
  border: '#DCE5E4',
  text: '#173331',
  muted: '#607573',
  primary: '#0F766E',
  gold: '#B7791F',
  soft: '#F4FBF9',
};

export function CategoryTrophyBoard({ tenantId, festivalId, audience }: Props) {
  const mode = useCategoryTrophyMode(tenantId, festivalId);
  const publicRows = usePublicCategoryTrophy(tenantId, festivalId, audience === 'public' && mode.data?.enabled === true && mode.data.public_visible === true);
  const adminRows = useAdminCategoryTrophy(tenantId, festivalId, audience === 'admin' && mode.data?.enabled === true);
  const loading = mode.isLoading || (audience === 'public' ? publicRows.isLoading : adminRows.isLoading);
  const error = mode.error || (audience === 'public' ? publicRows.error : adminRows.error);
  const groups = useMemo(() => {
    const rows = audience === 'public' ? publicRows.data ?? [] : adminRows.data ?? [];
    const map = new Map<string, typeof rows>();
    rows.forEach((row) => map.set(row.category_code, [...(map.get(row.category_code) ?? []), row]));
    return Array.from(map.values()).sort((a, b) => (a[0]?.category_sort_order ?? 0) - (b[0]?.category_sort_order ?? 0));
  }, [audience, publicRows.data, adminRows.data]);

  if (!tenantId || !festivalId || mode.data?.enabled !== true) return null;
  if (audience === 'public' && mode.data.public_visible !== true) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.icon}><Trophy size={18} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Category Trophies</Text>
          <Text style={styles.subtitle}>Teams compete inside each category. General is counted only in Overall Champion.</Text>
        </View>
      </View>
      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Loading category standings…</Text></View>
        : error ? <Text style={styles.error}>{error.message}</Text>
          : !groups.length ? <Text style={styles.muted}>No eligible category results yet.</Text>
            : <View style={styles.grid}>{groups.map((group) => <View key={group[0].category_code} style={styles.categoryCard}>
              <Text style={styles.categoryTitle}>{group[0].category_name}</Text>
              {group.map((row) => <View key={`${row.category_code}-${row.organisation_id}`} style={[styles.row, row.is_winner && styles.winnerRow]}>
                <Text style={styles.rank}>#{row.rank_position}</Text>
                <View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.team}>{row.organisation_name}</Text><Text style={styles.stats}>{row.result_count} results · {row.first_place_count} wins</Text></View>
                <View style={styles.points}><Text style={styles.pointsText}>{row.total_points}</Text>{row.is_winner ? <Crown size={13} color={colors.gold} /> : null}</View>
              </View>)}
            </View>)}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryCard: { flexGrow: 1, flexBasis: 280, borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 10, backgroundColor: '#FBFDFC' },
  categoryTitle: { color: colors.primary, fontSize: 13, fontWeight: '800', marginBottom: 5 },
  row: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: '#EDF1F1', paddingVertical: 6 },
  winnerRow: { backgroundColor: '#FFF9EB' },
  rank: { width: 28, color: colors.muted, fontSize: 11, fontWeight: '800' },
  team: { color: colors.text, fontSize: 12, fontWeight: '700' },
  stats: { color: colors.muted, fontSize: 10, marginTop: 2 },
  points: { minWidth: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  pointsText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 12 },
  error: { color: '#B42318', fontSize: 12 },
  loading: { minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 8 },
});
