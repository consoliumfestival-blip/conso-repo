import { ui } from "@/constants/designSystem";
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  X,
  Users,
  User as UserIcon,
} from 'lucide-react-native';
import { useFestival } from '../../../../core/hooks/useFestival';
import { useFestivalCategories } from '../../../../core/hooks/useFestivalCategories';
import { useResultVisibility } from '../../../../core/hooks/useResultVisibility';
import { useAuthStore } from '../../../../core/store/authStore';
import { FestivalResult, ResultStatus } from '../../../../services/resultVisibilityService';

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

const STATUS_CONFIG: Record<ResultStatus, { label: string; bg: string; text: string }> = {
  draft:     { label: 'Draft',     bg: '#F1F5F9', text: ui.colors.textMuted },
  ready:     { label: 'Ready',     bg: '#EFF6FF', text: ui.colors.info },
  published: { label: 'Published', bg: ui.colors.successSoft, text: '#15803D' },
  hidden:    { label: 'Hidden',    bg: ui.colors.dangerSoft, text: ui.colors.danger },
  archived:  { label: 'Archived',  bg: ui.colors.surfaceMuted, text: '#374151' },
};

const ResultStatusBadge = ({ status }: { status: ResultStatus }) => {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <View style={{ backgroundColor: cfg.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: cfg.text, fontFamily: 'Montserrat_700Bold', fontSize: 11 }}>{cfg.label}</Text>
    </View>
  );
};

const PublicVisibilityBadge = ({ visible }: { visible: boolean }) => (
  <View style={{
    backgroundColor: visible ? ui.colors.successSoft : '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  }}>
    <Text style={{
      color: visible ? '#15803D' : ui.colors.textMuted,
      fontFamily: 'Montserrat_700Bold',
      fontSize: 11,
    }}>
      {visible ? 'Public' : 'Public Hidden'}
    </Text>
  </View>
);

export interface ItemGroup {
  item_id: string;
  item_name: string;
  item_name_ml: string;
  is_group: boolean;
  results: FestivalResult[];
  status_summary: {
    published: number;
    ready: number;
    draft: number;
    hidden: number;
    archived: number;
    total: number;
  };
}

export default function ItemResultsPage() {
  const { tenant_id } = useAuthStore();

  // Load active festival ID
  const { useActiveFestival, useItems } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const festivalId = activeFestival?.id;
  const { data: festivalCategories = [] } = useFestivalCategories(festivalId, true);
  const { data: festivalItems = [] } = useItems(festivalId);

  // Load results
  const {
    results: festivalResults,
    error: resultsError,
    isLoading: isResultsLoading,
    isRefetching: isResultsRefetching,
    refetch: refetchResults,
    updateVisibility,
    bulkUpdateVisibility,
  } = useResultVisibility(tenant_id, festivalId);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [resultTypeFilter, setResultTypeFilter] = useState<'all' | 'individual' | 'group'>('all');
  const [resultStatusFilter, setResultStatusFilter] = useState<'all' | 'unpublished' | ResultStatus>('all');
  const [previewGroup, setPreviewGroup] = useState<ItemGroup | null>(null);

  const categoryOptions = useMemo(
    () => ['all', ...festivalCategories.map((category) => category.code.toLowerCase())],
    [festivalCategories],
  );

  const itemDetailsMap = useMemo(() => new Map(festivalItems.map((item) => [item.id, item])), [festivalItems]);

  const itemCategoryCodes = useMemo(() => new Map(
    festivalItems.map((item: any) => [
      item.id,
      (Array.isArray(item.category_codes) ? item.category_codes : []).map((code: string) => code.toLowerCase()),
    ]),
  ), [festivalItems]);

  // Compute public publish order: item_id → sequence number (#1, #2, ...)
  const publicOrderMap = useMemo(() => {
    const itemEarliestPublic = new Map<string, string>();
    festivalResults.forEach(r => {
      if (r.public_visible === true && r.published_at) {
        const itemId = r.item_id ?? '';
        const existing = itemEarliestPublic.get(itemId);
        if (!existing || r.published_at < existing) {
          itemEarliestPublic.set(itemId, r.published_at);
        }
      }
    });
    const sorted = Array.from(itemEarliestPublic.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    const orderMap = new Map<string, number>();
    sorted.forEach(([itemId], idx) => orderMap.set(itemId, idx + 1));
    return orderMap;
  }, [festivalResults]);

  React.useEffect(() => {
    if (!categoryOptions.includes(selectedCategory)) setSelectedCategory('all');
  }, [categoryOptions, selectedCategory]);

  // Filtered results
  const filteredResults = useMemo(() => {
    return festivalResults.filter(r => {
      // 1. Type filter
      const typeMatch = resultTypeFilter === 'all'
        || (resultTypeFilter === 'individual' && !r.is_group)
        || (resultTypeFilter === 'group' && r.is_group);

      // 2. Status filter — Published/Unpublished means public_visible
      const statusMatch = resultStatusFilter === 'all'
        || (resultStatusFilter === 'published' && r.public_visible === true)
        || (resultStatusFilter === 'unpublished' && r.public_visible !== true)
        || (resultStatusFilter !== 'published' && resultStatusFilter !== 'unpublished' && r.result_status === resultStatusFilter);

      // 3. Category filter
      const categoryMatch = selectedCategory === 'all'
        || itemCategoryCodes.get(r.item_id ?? '')?.includes(selectedCategory) === true;

      // 4. Search query match
      const query = searchQuery.trim().toLowerCase();
      const searchMatch = !query
        || (r.item_name && r.item_name.toLowerCase().includes(query))
        || (r.item_name_ml && r.item_name_ml.toLowerCase().includes(query))
        || (r.organisation_name && r.organisation_name.toLowerCase().includes(query))
        || (r.participant_name && r.participant_name.toLowerCase().includes(query))
        || (r.chest_number && r.chest_number.toLowerCase().includes(query));

      return typeMatch && statusMatch && categoryMatch && searchMatch;
    });
  }, [festivalResults, resultTypeFilter, resultStatusFilter, selectedCategory, searchQuery, itemCategoryCodes]);

  // Grouped Results
  const groupedResults = useMemo(() => {
    const groups = new Map<string, ItemGroup>();
    filteredResults.forEach(r => {
      const groupId = r.item_id ?? `result:${r.result_id}`;
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          item_id: groupId,
          item_name: r.item_name,
          item_name_ml: r.item_name_ml,
          is_group: r.is_group,
          results: [],
          status_summary: { published: 0, ready: 0, draft: 0, hidden: 0, archived: 0, total: 0 }
        });
      }
      const g = groups.get(groupId)!;
      g.results.push(r);
      const status = (r.result_status || 'draft') as ResultStatus;
      g.status_summary[status]++;
      g.status_summary.total++;
    });
    
    // Sort groups: items with public order numbers first, then alphabetically
    return Array.from(groups.values()).sort((a, b) => {
      const orderA = publicOrderMap.get(a.item_id);
      const orderB = publicOrderMap.get(b.item_id);

      if (orderA !== undefined && orderB !== undefined) {
        return orderA - orderB;
      }
      if (orderA !== undefined) return -1;
      if (orderB !== undefined) return 1;

      const nameA = a.item_name_ml || a.item_name;
      const nameB = b.item_name_ml || b.item_name;
      return nameA.localeCompare(nameB);
    });
  }, [filteredResults, publicOrderMap]);

  const handleItemBulkAction = async (group: ItemGroup, status: ResultStatus) => {
    const ids = group.results.map(r => r.result_id);
    if (!ids.length) return;
    try {
      await bulkUpdateVisibility.mutateAsync({ resultIds: ids, status });
    } catch (err: any) {
      alert('Error updating results: ' + err.message);
    }
  };

  const handleSingleVisibility = async (resultId: string, status: ResultStatus) => {
    try {
      await updateVisibility.mutateAsync({ resultId, status });
    } catch (err: any) {
      alert('Error updating result: ' + err.message);
    }
  };

  return (
    <View style={styles.tableCard}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Result Visibility Management</Text>
          <Text style={styles.cardSubTitle}>Manage public visibility of results grouped by item.</Text>
        </View>
        <TouchableOpacity onPress={() => refetchResults()} style={styles.secondaryAction}>
          <RefreshCw size={16} color={colors.teal} />
          <Text style={styles.secondaryActionText}>{isResultsRefetching ? 'Refreshing' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {/* Advanced Search & Filtering Bar */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchBox}>
          <Search size={18} color={colors.muted} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search by item, participant, unit or chest no..."
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
            {/* Categories */}
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

            {/* Type filter */}
            {(['all', 'individual', 'group'] as const).map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => setResultTypeFilter(t)}
                style={[styles.filterChip, resultTypeFilter === t && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, resultTypeFilter === t && styles.filterChipTextActive]}>
                  {t === 'all' ? 'All Types' : t === 'individual' ? '👤 Individual' : '👥 Group'}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.filterDivider} />

            {/* Status filter */}
            {(['all', 'published', 'unpublished', 'ready', 'draft', 'hidden'] as const).map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => setResultStatusFilter(s)}
                style={[styles.filterChip, resultStatusFilter === s && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, resultStatusFilter === s && styles.filterChipTextActive]}>
                  {s === 'all' ? 'All Status' : s === 'unpublished' ? '🔒 Not Public' : s === 'published' ? '🌐 Public' : STATUS_CONFIG[s as ResultStatus]?.label ?? s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Item Groups */}
      {isResultsLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.teal} />
          <Text style={styles.loadingText}>Loading item results...</Text>
        </View>
      ) : resultsError ? (
        <View style={styles.loadingBox}>
          <Text style={styles.errorText}>Unable to load admin results.</Text>
          <Text style={styles.loadingText}>{resultsError.message}</Text>
        </View>
      ) : groupedResults.length === 0 ? (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>No results found for selected filters.</Text>
        </View>
      ) : (
        <ScrollView style={styles.rowsScrollContainer}>
          {groupedResults.map(group => {
            const isAllPublished = group.status_summary.published === group.status_summary.total;
            const isAllPublic = group.results.every(r => r.public_visible === true);
            const isAllPublicHidden = group.results.every(r => r.public_visible !== true);
            const isAllReady = group.status_summary.ready === group.status_summary.total;
            
            let groupStatusText = 'Mixed Status';
            let groupStatusColor = '#F59E0B'; // Amber
            let groupStatusBg = '#FEF3C7';
            
            if (isAllPublished && isAllPublic) { groupStatusText = 'Public'; groupStatusColor = '#15803D'; groupStatusBg = ui.colors.successSoft; }
            else if (isAllPublished && isAllPublicHidden) { groupStatusText = 'Admin Published'; groupStatusColor = ui.colors.info; groupStatusBg = ui.colors.infoSoft; }
            else if (isAllReady) { groupStatusText = 'All Ready'; groupStatusColor = ui.colors.info; groupStatusBg = ui.colors.infoSoft; }
            else if (group.status_summary.draft === group.status_summary.total) { groupStatusText = 'All Draft'; groupStatusColor = ui.colors.textMuted; groupStatusBg = '#F1F5F9'; }

            return (
              <View key={group.item_id} style={styles.itemGroupCard}>
                {/* Item Group Header */}
                <View style={styles.itemGroupHeader}>
                  <View style={{ flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    {publicOrderMap.has(group.item_id) && (
                      <View style={{ backgroundColor: '#0F766E', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minWidth: 32, alignItems: 'center' }}>
                        <Text style={{ color: '#FFFFFF', fontFamily: 'Montserrat_700Bold', fontSize: 12 }}>#{publicOrderMap.get(group.item_id)}</Text>
                      </View>
                    )}
                    <Text style={styles.itemGroupTitle}>{group.item_name_ml || group.item_name}</Text>
                      {itemDetailsMap.get(group.item_id)?.item_code && (
                        <View style={[styles.itemTypeBadge, { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb', borderWidth: 1 }]}>
                          <Text style={[styles.itemTypeBadgeText, { color: '#4b5563' }]}>{itemDetailsMap.get(group.item_id).item_code}</Text>
                        </View>
                      )}
                      {(itemDetailsMap.get(group.item_id)?.category_codes || []).map((code: string) => {
                        const cat = festivalCategories.find(c => c.code.toLowerCase() === code.toLowerCase());
                        const catName = cat ? cat.name_en : (code.charAt(0).toUpperCase() + code.slice(1));
                        return (
                          <View key={code} style={styles.itemTypeBadge}>
                            <Text style={styles.itemTypeBadgeText}>{catName}</Text>
                          </View>
                        );
                      })}
                    
                    <View style={styles.itemTypeBadge}>
                      {group.is_group ? <Users size={12} color={colors.navy} style={{ marginRight: 4 }} /> : <UserIcon size={12} color={colors.navy} style={{ marginRight: 4 }} />}
                      <Text style={styles.itemTypeBadgeText}>{group.is_group ? 'Group' : 'Individual'}</Text>
                    </View>
                    <View style={[styles.itemGroupStatusBadge, { backgroundColor: groupStatusBg }]}>
                      <Text style={[styles.itemGroupStatusText, { color: groupStatusColor }]}>{groupStatusText}</Text>
                    </View>
                  </View>
                  
                  {/* Bulk Actions for Item */}
                  <View style={styles.itemGroupActions}>
                    <TouchableOpacity onPress={() => setPreviewGroup(group)} style={styles.bulkActionBtn}>
                      <Eye size={16} color={colors.navy} />
                      <Text style={styles.bulkActionBtnText}>Preview</Text>
                    </TouchableOpacity>
                    
                    {!isAllPublic && (
                      <TouchableOpacity onPress={() => handleItemBulkAction(group, 'published')} style={[styles.bulkActionBtn, { backgroundColor: ui.colors.successSoft, borderColor: '#BBF7D0' }]}>
                        <CheckCircle2 size={16} color="#15803D" />
                        <Text style={[styles.bulkActionBtnText, { color: '#15803D' }]}>Show Public</Text>
                      </TouchableOpacity>
                    )}
                    {!isAllPublicHidden && (
                      <TouchableOpacity onPress={() => handleItemBulkAction(group, 'hidden')} style={[styles.bulkActionBtn, { backgroundColor: ui.colors.dangerSoft, borderColor: '#FECACA' }]}>
                        <EyeOff size={16} color={ui.colors.danger} />
                        <Text style={[styles.bulkActionBtnText, { color: ui.colors.danger }]}>Hide Public</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* nested participants */}
                <View style={styles.itemGroupParticipants}>
                  {group.results.sort((a, b) => (a.rank || 99) - (b.rank || 99)).map((r, i) => {
                    const status = (r.result_status ?? 'draft') as ResultStatus;
                    const isLast = i === group.results.length - 1;
                    return (
                        <View key={r.result_id} style={[styles.nestedResultRow, !isLast && { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }]}>
                          <View style={{ flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                            <View style={{ width: 28, alignItems: 'center', marginTop: 2 }}>
                              {r.rank ? <Text style={styles.nestedRankText}>#{r.rank}</Text> : <Text style={styles.nestedRankText}>-</Text>}
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <Text style={styles.nestedParticipantName}>
                                  {status === 'published' && r.participant_name ? r.participant_name : r.chest_number ? `Chest #${r.chest_number}` : '?' }
                                </Text>
                                <ResultStatusBadge status={status} />
                                <PublicVisibilityBadge visible={r.public_visible === true} />
                              </View>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                <Text style={styles.nestedMeta}>{r.organisation_name}</Text>
                                {r.grade && <Text style={[styles.nestedMeta, { color: '#0F172A', fontWeight: '700' }]}>• Grade {r.grade}</Text>}
                                <Text style={[styles.nestedMeta, { color: '#0F766E', fontWeight: '700' }]}>• {r.points_awarded} pts</Text>
                              </View>
                            </View>
                          </View>
                          {/* Individual Overrides */}
                          <View style={[styles.nestedActions, { flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 4 }]}>
                           {r.public_visible !== true && (
                              <TouchableOpacity onPress={() => handleSingleVisibility(r.result_id, 'published')} style={[styles.nestedActionBtn, { backgroundColor: ui.colors.successSoft }]}>
                                <CheckCircle2 size={14} color="#15803D" />
                              </TouchableOpacity>
                            )}
                            {status !== 'ready' && status !== 'published' && (
                              <TouchableOpacity onPress={() => handleSingleVisibility(r.result_id, 'ready')} style={[styles.nestedActionBtn, { backgroundColor: ui.colors.infoSoft }]}>
                                <Eye size={14} color={ui.colors.info} />
                              </TouchableOpacity>
                            )}
                            {r.public_visible === true && (
                              <TouchableOpacity onPress={() => handleSingleVisibility(r.result_id, 'hidden')} style={[styles.nestedActionBtn, { backgroundColor: ui.colors.dangerSoft }]}>
                                <EyeOff size={14} color={ui.colors.danger} />
                              </TouchableOpacity>
                            )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Preview Modal */}
      <Modal
        visible={!!previewGroup}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewGroup(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPreviewGroup(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {previewGroup && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={[styles.cardTitle, { fontSize: 18 }]}>Item Preview</Text>
                  <TouchableOpacity onPress={() => setPreviewGroup(null)}><X size={20} color={colors.muted} /></TouchableOpacity>
                </View>

                <View style={styles.previewHeaderCard}>
                   <Text style={styles.previewItemName}>{previewGroup.item_name_ml || previewGroup.item_name}</Text>
                   <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                     {itemDetailsMap.get(previewGroup.item_id)?.item_code && (
                        <View style={[styles.itemTypeBadge, { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb', borderWidth: 1 }]}>
                          <Text style={[styles.itemTypeBadgeText, { color: '#4b5563' }]}>{itemDetailsMap.get(previewGroup.item_id).item_code}</Text>
                        </View>
                     )}
                     {(itemDetailsMap.get(previewGroup.item_id)?.category_codes || []).map((code: string) => {
                        const cat = festivalCategories.find(c => c.code.toLowerCase() === code.toLowerCase());
                        const catName = cat ? cat.name_en : (code.charAt(0).toUpperCase() + code.slice(1));
                        return (
                          <View key={code} style={styles.itemTypeBadge}>
                            <Text style={styles.itemTypeBadgeText}>{catName}</Text>
                          </View>
                        );
                     })}
                   </View>
                   <Text style={styles.previewItemMeta}>{previewGroup.is_group ? 'Group Item' : 'Individual Item'} • {previewGroup.results.length} Results</Text>
                </View>

                <ScrollView style={{ maxHeight: 300, marginVertical: 16 }}>
                  {previewGroup.results.sort((a,b) => (a.rank||99) - (b.rank||99)).map(r => (
                    <View key={r.result_id} style={[styles.previewResultRow, { flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }]}>
                       <View style={{ width: 28, alignItems: 'center', marginTop: 2 }}>
                         <Text style={{ fontFamily: 'Montserrat_700Bold', fontSize: 13, color: colors.navy }}>
                           {r.rank ? `#${r.rank}` : '-'}
                         </Text>
                       </View>
                       <View style={{ flex: 1, minWidth: 150 }}>
                         <Text style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: colors.text }}>
                           {r.result_status === 'published' && r.participant_name ? r.participant_name : r.chest_number ? `Chest #${r.chest_number}` : '?' }
                         </Text>
                         <Text style={{ fontFamily: 'Montserrat_400Regular', fontSize: 11, color: colors.muted }}>
                           {r.organisation_name}
                         </Text>
                       </View>
                       <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                         {r.grade && <Text style={{ fontFamily: 'Montserrat_700Bold', fontSize: 12, color: colors.navy }}>Grade {r.grade}</Text>}
                         <Text style={{ fontFamily: 'Montserrat_700Bold', fontSize: 13, color: colors.teal }}>• {r.points_awarded} pts</Text>
                       </View>
                    </View>
                  ))}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.primaryAction, { flex: 1 }]}
                    onPress={() => { handleItemBulkAction(previewGroup, 'published'); setPreviewGroup(null); }}
                  >
                    <CheckCircle2 size={16} color={ui.colors.surface} />
                    <Text style={styles.primaryActionText}>Show Public</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.outlineAction, { flex: 1 }]}
                    onPress={() => { handleItemBulkAction(previewGroup, 'hidden'); setPreviewGroup(null); }}
                  >
                    <EyeOff size={16} color={ui.colors.danger} />
                    <Text style={[styles.outlineActionText, { color: ui.colors.danger }]}>Hide Public</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
    fontFamily: 'Montserrat_700Bold',
    fontSize: 20,
  },
  cardSubTitle: {
    color: colors.muted,
    fontFamily: 'Montserrat_400Regular',
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
    fontFamily: 'Montserrat_700Bold',
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
    fontFamily: 'Montserrat_500Medium',
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
    fontFamily: 'Montserrat_700Bold',
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
    fontFamily: 'Montserrat_400Regular',
    fontSize: 13,
    marginTop: 10,
  },
  errorText: {
    color: ui.colors.danger,
    fontFamily: 'Montserrat_700Bold',
    fontSize: 13,
  },
  rowsScrollContainer: {
    maxHeight: 600,
  },
  itemGroupCard: {
    marginHorizontal: 20,
    marginVertical: 10,
    backgroundColor: ui.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  itemGroupHeader: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  itemGroupTitle: {
    color: colors.navy,
    fontFamily: 'Montserrat_700Bold',
    fontSize: 16,
  },
  itemTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemTypeBadgeText: {
    color: colors.navy,
    fontFamily: 'Montserrat_600SemiBold',
    fontSize: 11,
  },
  itemGroupStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  itemGroupStatusText: {
    fontFamily: 'Montserrat_700Bold',
    fontSize: 11,
  },
  itemGroupActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  bulkActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bulkActionBtnText: {
    color: colors.navy,
    fontFamily: 'Montserrat_600SemiBold',
    fontSize: 12,
  },
  itemGroupParticipants: {
    padding: 12,
  },
  nestedResultRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 12,
  },
  nestedRankText: {
    color: colors.muted,
    fontFamily: 'Montserrat_700Bold',
    fontSize: 14,
  },
  nestedParticipantName: {
    color: colors.text,
    fontFamily: 'Montserrat_600SemiBold',
    fontSize: 13,
  },
  nestedMeta: {
    color: colors.muted,
    fontFamily: 'Montserrat_500Medium',
    fontSize: 11,
  },
  nestedActions: {
    flexDirection: 'row',
    gap: 6,
  },
  nestedActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: ui.colors.surfaceStrong,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: ui.colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    shadowColor: ui.shadow.shadowColor,
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
  },
  previewHeaderCard: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  previewItemName: {
    color: colors.navy,
    fontFamily: 'Montserrat_700Bold',
    fontSize: 16,
  },
  previewItemMeta: {
    color: colors.muted,
    fontFamily: 'Montserrat_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
  previewResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  primaryAction: {
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.teal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionText: {
    color: ui.colors.surface,
    fontFamily: 'Montserrat_700Bold',
    fontSize: 13,
  },
  outlineAction: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  outlineActionText: {
    fontFamily: 'Montserrat_700Bold',
    fontSize: 13,
  },
});
