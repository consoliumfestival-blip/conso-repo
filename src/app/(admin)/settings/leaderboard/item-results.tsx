import { coreColor } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import { ui } from "@/constants/designSystem";
import React, { useContext, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  LayoutGrid,
  RefreshCw,
  Search,
  Table2,
  X,
} from 'lucide-react-native';
import { SsfSelectMenu, type SsfSelectOption } from '@/components/ui/SsfSelectMenu';
import { ItemResultsViewContext } from '@/core/contexts/itemResultsViewContext';
import { useFestival } from '../../../../core/hooks/useFestival';
import { useFestivalCategories } from '../../../../core/hooks/useFestivalCategories';
import { useResultVisibility } from '../../../../core/hooks/useResultVisibility';
import { useAuthStore } from '../../../../core/store/authStore';
import { FestivalResult, ResultStatus } from '../../../../services/resultVisibilityService';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../core/config/supabase';

const resultDisplayName = (result: FestivalResult) => result.is_group
  ? (result.organisation_name && result.organisation_name !== 'Unassigned' ? result.organisation_name : 'Group entry')
  : result.result_status === 'published' && result.participant_name
    ? result.participant_name
    : result.chest_number ? `Chest #${result.chest_number}` : '?';

function GroupMembers({ registrationId, festivalId, tenantId }: { registrationId: string; festivalId: string; tenantId: string }) {
  const membersQuery = useQuery({
    queryKey: ['admin-item-result-group-members', tenantId, festivalId, registrationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('group_members')
        .select('participant_id, member_order, registration:registrations!inner(festival_id,tenant_id), participant:participants!inner(name,chest_number,festival_id,tenant_id)')
        .eq('registration_id', registrationId)
        .eq('registration.festival_id', festivalId)
        .eq('registration.tenant_id', tenantId)
        .eq('participant.festival_id', festivalId)
        .eq('participant.tenant_id', tenantId)
        .order('member_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as { participant_id: string; participant: { name: string; chest_number: string | null } }[];
    },
  });
  if (membersQuery.isLoading) return <ActivityIndicator size="small" color={colors.teal} />;
  if (membersQuery.isError) return <TouchableOpacity accessibilityRole="button" onPress={() => void membersQuery.refetch()}><Text style={styles.nestedMeta}>Could not load members. Retry</Text></TouchableOpacity>;
  if (!membersQuery.data?.length) return <Text style={styles.nestedMeta}>No members found for this group.</Text>;
  return <View style={{ gap: 4, paddingLeft: 16, paddingVertical: 5 }}>
    {membersQuery.data.map(({ participant_id, participant }) => <Text key={participant_id} style={styles.nestedMeta}>• {participant.name}{participant.chest_number ? ` · #${participant.chest_number}` : ''}</Text>)}
  </View>;
}

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
  draft:     { label: 'Draft',     bg: coreColor('#F1F5F9', 'background'), text: ui.colors.textMuted },
  ready:     { label: 'Ready',     bg: coreColor('#EFF6FF', 'background'), text: ui.colors.info },
  published: { label: 'Published', bg: ui.colors.successSoft, text: coreColor('#15803D', 'text') },
  hidden:    { label: 'Hidden',    bg: ui.colors.dangerSoft, text: ui.colors.danger },
  archived:  { label: 'Archived',  bg: ui.colors.surfaceMuted, text: coreColor('#374151', 'text') },
};

const ResultStatusBadge = ({ status }: { status: ResultStatus }) => {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <View style={{ backgroundColor: cfg.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: cfg.text, fontFamily: "Outfit_700Bold", fontSize: 11 }}>{cfg.label}</Text>
    </View>
  );
};

const PublicVisibilityBadge = ({ visible }: { visible: boolean }) => (
  <View style={{
    backgroundColor: visible ? ui.colors.successSoft : coreColor('#F1F5F9', 'surface'),
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  }}>
    <Text style={{
      color: visible ? coreColor('#15803D', 'success') : ui.colors.textMuted,
      fontFamily: "Outfit_700Bold",
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
  const { tenant_id, user } = useAuthStore();
  const queryClient = useQueryClient();

  // Load active festival ID
  const { useActiveFestival, useItems } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const festivalId = activeFestival?.id;
  const { data: festivalCategories = [] } = useFestivalCategories(festivalId, true);
  const { data: festivalItems = [] } = useItems(festivalId);

  // Load results
  const {
    updateVisibility,
    bulkUpdateVisibility,
  } = useResultVisibility(tenant_id, festivalId, { enabled: false });

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [resultTypeFilter, setResultTypeFilter] = useState<'all' | 'individual' | 'group'>('all');
  const [resultStatusFilter, setResultStatusFilter] = useState<'all' | 'unpublished' | ResultStatus>('all');
  const [previewGroup, setPreviewGroup] = useState<ItemGroup | null>(null);
  const { view: resultView, setView: setResultView } = useContext(ItemResultsViewContext);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [expandedGroupResultId, setExpandedGroupResultId] = useState<string | null>(null);
  React.useEffect(() => setExpandedItemId(null), [resultView]);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  const filteredQueryKey = ['admin-item-results-filtered', user?.id, tenant_id, festivalId];
  const filteredQuery = useQuery({
    queryKey: [...filteredQueryKey, debouncedSearch, selectedCategory, resultTypeFilter, resultStatusFilter],
    enabled: !!user?.id && !!tenant_id && !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_item_results_filtered', {
        p_tenant_id: tenant_id, p_festival_id: festivalId, p_search: debouncedSearch,
        p_category: selectedCategory, p_type: resultTypeFilter, p_status: resultStatusFilter,
      });
      if (error) throw error;
      if (!data || !Array.isArray(data.rows) || !data.items || typeof data.items !== 'object') throw new Error('Invalid results response');
      return data as { rows: FestivalResult[]; items: Record<string, { result_ids: string[]; all_public: boolean; all_hidden: boolean; public_order: number | null }> };
    },
  });
  const filteredResults = useMemo(() => filteredQuery.data?.rows ?? [], [filteredQuery.data]);
  const itemStats = useMemo(() => filteredQuery.data?.items ?? {}, [filteredQuery.data]);
  const resultsError = filteredQuery.error;
  const isResultsLoading = filteredQuery.isLoading;
  const isResultsRefetching = filteredQuery.isRefetching;
  const refetchResults = filteredQuery.refetch;

  const categoryOptions = useMemo(
    () => ['all', ...festivalCategories.map((category) => category.code.toLowerCase())],
    [festivalCategories],
  );
  const categorySelectOptions = useMemo<SsfSelectOption[]>(() => categoryOptions.map((code) => ({
    value: code,
    label: code === 'all' ? 'All Categories' : code.toUpperCase(),
  })), [categoryOptions]);
  const typeSelectOptions: SsfSelectOption[] = [
    { value: 'all', label: 'All Types' },
    { value: 'individual', label: 'Individual' },
    { value: 'group', label: 'Group' },
  ];
  const statusSelectOptions: SsfSelectOption[] = [
    { value: 'all', label: 'All Status' },
    { value: 'published', label: 'Public' },
    { value: 'unpublished', label: 'Not Public' },
    { value: 'ready', label: 'Ready' },
    { value: 'draft', label: 'Draft' },
    { value: 'hidden', label: 'Hidden' },
  ];

  const itemDetailsMap = useMemo(() => new Map(festivalItems.map((item) => [item.id, item])), [festivalItems]);

  const publicOrderMap = useMemo(() => new Map(Object.entries(itemStats)
    .filter(([, stats]) => stats.public_order != null)
    .map(([id, stats]) => [id, stats.public_order as number])), [itemStats]);

  React.useEffect(() => {
    if (!categoryOptions.includes(selectedCategory)) setSelectedCategory('all');
  }, [categoryOptions, selectedCategory]);

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
    // Group contents can be narrowed by participant/search filters; an item
    // action must use the complete loaded item, not just the visible rows.
    const ids = itemStats[group.item_id]?.result_ids ?? [];
    if (!ids.length) return;
    try {
      await bulkUpdateVisibility.mutateAsync({ resultIds: ids, status });
      await queryClient.invalidateQueries({ queryKey: filteredQueryKey });
    } catch (err: any) {
      alert('Error updating results: ' + err.message);
    }
  };

  const handleSingleVisibility = async (resultId: string, status: ResultStatus) => {
    try {
      await updateVisibility.mutateAsync({ resultId, status });
      await queryClient.invalidateQueries({ queryKey: filteredQueryKey });
    } catch (err: any) {
      alert('Error updating result: ' + err.message);
    }
  };

  const renderItemActions = (group: ItemGroup, isAllPublic: boolean, isAllPublicHidden: boolean) => (
    <View style={styles.itemGroupActions}>
      <TouchableOpacity onPress={() => setPreviewGroup(group)} style={styles.bulkActionBtn} accessibilityRole="button" accessibilityLabel={`Preview ${group.item_name}`}>
        <Eye size={14} color={coreColor(colors.navy, 'primaryText')} />
        <Text style={styles.bulkActionBtnText}>Preview</Text>
      </TouchableOpacity>
      {!isAllPublic && (
        <TouchableOpacity onPress={() => handleItemBulkAction(group, 'published')} style={[styles.bulkActionBtn, styles.publicAction]}>
          <CheckCircle2 size={14} color={coreColor('#15803D', 'success')} />
          <Text style={[styles.bulkActionBtnText, { color: coreColor('#15803D', 'success') }]}>Show</Text>
        </TouchableOpacity>
      )}
      {!isAllPublicHidden && (
        <TouchableOpacity onPress={() => handleItemBulkAction(group, 'hidden')} style={[styles.bulkActionBtn, styles.hideAction]}>
          <EyeOff size={14} color={ui.colors.danger} />
          <Text style={[styles.bulkActionBtnText, { color: ui.colors.danger }]}>Hide</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.tableCard}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Result Visibility Management</Text>
          <Text style={styles.cardSubTitle}>Results with points above zero are listed. Item actions affect all published results for that item.</Text>
        </View>
        <TouchableOpacity onPress={() => refetchResults()} style={styles.secondaryAction}>
          <RefreshCw size={16} color={coreColor(colors.teal, 'primaryText')} />
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
        <View style={styles.filterSelectRow}>
          <SsfSelectMenu value={selectedCategory} options={categorySelectOptions} onValueChange={setSelectedCategory} accessibilityLabel="Category filter" compact keepInViewport style={styles.filterSelect} />
          <SsfSelectMenu value={resultTypeFilter} options={typeSelectOptions} onValueChange={(value) => setResultTypeFilter(value as typeof resultTypeFilter)} accessibilityLabel="Result type filter" compact keepInViewport style={styles.filterSelect} />
          <SsfSelectMenu value={resultStatusFilter} options={statusSelectOptions} onValueChange={(value) => setResultStatusFilter(value as typeof resultStatusFilter)} accessibilityLabel="Result status filter" compact keepInViewport style={styles.filterSelect} />
        </View>
        <View style={styles.viewSwitcher} accessibilityRole="tablist">
          <TouchableOpacity onPress={() => setResultView('cards')} style={[styles.viewButton, resultView === 'cards' && styles.viewButtonActive]} accessibilityRole="tab" accessibilityState={{ selected: resultView === 'cards' }}>
            <LayoutGrid size={14} color={resultView === 'cards' ? ui.colors.onPrimary : colors.muted} />
            <Text style={[styles.viewButtonText, resultView === 'cards' && styles.viewButtonTextActive]}>Cards</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setResultView('table')} style={[styles.viewButton, resultView === 'table' && styles.viewButtonActive]} accessibilityRole="tab" accessibilityState={{ selected: resultView === 'table' }}>
            <Table2 size={14} color={resultView === 'table' ? ui.colors.onPrimary : colors.muted} />
            <Text style={[styles.viewButtonText, resultView === 'table' && styles.viewButtonTextActive]}>Table</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Item Groups */}
      {isResultsLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={coreColor(colors.teal, 'primaryText')} />
          <Text style={styles.loadingText}>Loading item results...</Text>
        </View>
      ) : resultsError && !filteredQuery.data ? (
        <View style={styles.loadingBox}>
          <Text style={styles.errorText}>Could not load complete results.</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => void refetchResults()}>
            <Text style={styles.loadingText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : groupedResults.length === 0 ? (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>No results found for selected filters.</Text>
        </View>
      ) : resultView === 'table' ? (
        <ScrollView horizontal style={styles.tableScroll} contentContainerStyle={styles.tableScrollContent}>
          <View style={styles.resultsTable}>
            {groupedResults.map(group => {
              const isAllPublic = itemStats[group.item_id]?.all_public === true;
              const isAllPublicHidden = itemStats[group.item_id]?.all_hidden === true;
              const expanded = expandedItemId === group.item_id;
              return (
                <React.Fragment key={group.item_id}>
                  <View style={styles.tableItemHeading}>
                    <TouchableOpacity
                      style={styles.tableItemToggle}
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      accessibilityLabel={`${group.item_name_ml || group.item_name}, ${group.results.length} results`}
                      onPress={() => setExpandedItemId(expanded ? null : group.item_id)}
                    >
                      <Text style={styles.itemGroupTitle} numberOfLines={1}>{group.item_name_ml || group.item_name}</Text>
                      {!!itemDetailsMap.get(group.item_id)?.item_code && <Text style={styles.tableItemCode}>{itemDetailsMap.get(group.item_id)?.item_code}</Text>}
                      <Text style={styles.tableItemCount}>{group.results.length} results</Text>
                      <ChevronDown size={15} color={colors.muted} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
                    </TouchableOpacity>
                  </View>
                  {expanded && <>
                    <View style={styles.expandedActionRow}>{renderItemActions(group, isAllPublic, isAllPublicHidden)}</View>
                    <View style={styles.resultsTableHeader}>
                      <Text style={[styles.tableHeading, styles.rankColumn]}>Rank</Text>
                      <Text style={[styles.tableHeading, styles.participantColumn]}>Team / Participant</Text>
                      <Text style={[styles.tableHeading, styles.organisationColumn]}>Organisation</Text>
                      <Text style={[styles.tableHeading, styles.gradeColumn]}>Grade</Text>
                      <Text style={[styles.tableHeading, styles.pointsColumn]}>Points</Text>
                      <Text style={[styles.tableHeading, styles.statusColumn]}>Status</Text>
                      <Text style={[styles.tableHeading, styles.rowActionsColumn]}>Actions</Text>
                    </View>
                    {[...group.results].sort((a, b) => (a.rank || 99) - (b.rank || 99)).map((result) => {
                    const status = (result.result_status ?? 'draft') as ResultStatus;
                    return (
                      <React.Fragment key={result.result_id}>
                      <View style={styles.resultsTableRow}>
                        <Text style={[styles.tableCell, styles.rankColumn]}>{result.rank ? `#${result.rank}` : '—'}</Text>
                        <View style={styles.participantColumn}>
                          {result.is_group && result.registration_id ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Show members of ${resultDisplayName(result)}`} accessibilityState={{ expanded: expandedGroupResultId === result.result_id }} onPress={() => setExpandedGroupResultId(expandedGroupResultId === result.result_id ? null : result.result_id)}><Text style={styles.tableParticipantName} numberOfLines={1}>{resultDisplayName(result)} ▾</Text></TouchableOpacity> : <Text style={styles.tableParticipantName} numberOfLines={1}>{resultDisplayName(result)}</Text>}
                        </View>
                        <Text style={[styles.tableCell, styles.organisationColumn]} numberOfLines={1}>{result.organisation_name || '—'}</Text>
                        <Text style={[styles.tableCell, styles.gradeColumn]}>{result.grade || '—'}</Text>
                        <Text style={[styles.tableCell, styles.pointsColumn]}>{result.points_awarded} pts</Text>
                        <View style={styles.statusColumn}><ResultStatusBadge status={status} /><PublicVisibilityBadge visible={result.public_visible === true} /></View>
                        <View style={[styles.rowActionsColumn, styles.resultRowActions]}>
                          {result.public_visible !== true && <TouchableOpacity onPress={() => handleSingleVisibility(result.result_id, 'published')} style={[styles.nestedActionBtn, { backgroundColor: ui.colors.successSoft }]} accessibilityRole="button" accessibilityLabel="Show result publicly"><CheckCircle2 size={14} color={coreColor('#15803D', 'success')} /></TouchableOpacity>}
                          {status !== 'ready' && status !== 'published' && <TouchableOpacity onPress={() => handleSingleVisibility(result.result_id, 'ready')} style={[styles.nestedActionBtn, { backgroundColor: ui.colors.infoSoft }]} accessibilityRole="button" accessibilityLabel="Mark result ready"><Eye size={14} color={ui.colors.info} /></TouchableOpacity>}
                          {result.public_visible === true && <TouchableOpacity onPress={() => handleSingleVisibility(result.result_id, 'hidden')} style={[styles.nestedActionBtn, { backgroundColor: ui.colors.dangerSoft }]} accessibilityRole="button" accessibilityLabel="Hide result publicly"><EyeOff size={14} color={ui.colors.danger} /></TouchableOpacity>}
                        </View>
                      </View>
                      {result.is_group && result.registration_id && expandedGroupResultId === result.result_id && festivalId && tenant_id ? <View style={[styles.resultsTableRow, { paddingLeft: 42 }]}><GroupMembers registrationId={result.registration_id} festivalId={festivalId} tenantId={tenant_id} /></View> : null}
                      </React.Fragment>
                    );
                  })}
                  </>}
                </React.Fragment>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.cardsList}>
          {groupedResults.map(group => {
            const isAllPublic = itemStats[group.item_id]?.all_public === true;
            const isAllPublicHidden = itemStats[group.item_id]?.all_hidden === true;

            return (
              <View key={group.item_id} style={styles.itemGroupCard}>
                <TouchableOpacity
                  style={styles.itemGroupHeader}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: expandedItemId === group.item_id }}
                  accessibilityLabel={`${group.item_name_ml || group.item_name}, ${group.results.length} results`}
                  onPress={() => setExpandedItemId(expandedItemId === group.item_id ? null : group.item_id)}
                >
                  <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {publicOrderMap.has(group.item_id) && (
                      <View style={{ backgroundColor: coreColor('#0F766E', 'primary'), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minWidth: 32, alignItems: 'center' }}>
                        <Text style={{ color: coreColor('#FFFFFF', 'onPrimary'), fontFamily: "Outfit_700Bold", fontSize: 12 }}>#{publicOrderMap.get(group.item_id)}</Text>
                      </View>
                    )}
                    <Text style={styles.itemGroupTitle} numberOfLines={1}>{group.item_name_ml || group.item_name}</Text>
                      {itemDetailsMap.get(group.item_id)?.item_code && (
                        <View style={[styles.itemTypeBadge, { backgroundColor: coreColor('#f3f4f6', 'surface'), borderColor: coreColor('#e5e7eb', 'border'), borderWidth: 1 }]}>
                          <Text style={[styles.itemTypeBadgeText, { color: coreColor('#4b5563', 'text') }]}>{itemDetailsMap.get(group.item_id).item_code}</Text>
                        </View>
                      )}
                  </View>
                  <Text style={styles.itemGroupCount}>{group.results.length}</Text>
                  <ChevronDown size={15} color={colors.muted} style={{ transform: [{ rotate: expandedItemId === group.item_id ? '180deg' : '0deg' }] }} />
                </TouchableOpacity>
                {expandedItemId === group.item_id && <>
                  <View style={styles.expandedActionRow}>{renderItemActions(group, isAllPublic, isAllPublicHidden)}</View>
                  <View style={styles.itemGroupParticipants}>
                  {[...group.results].sort((a, b) => (a.rank || 99) - (b.rank || 99)).map((r, i) => {
                    const status = (r.result_status ?? 'draft') as ResultStatus;
                    const isLast = i === group.results.length - 1;
                    return (
                        <View key={r.result_id} style={[styles.nestedResultRow, !isLast && { borderBottomWidth: 1, borderBottomColor: coreColor('#F1F5F9', 'border') }]}>
                          <View style={{ flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                            <View style={{ width: 28, alignItems: 'center', marginTop: 2 }}>
                              {r.rank ? <Text style={styles.nestedRankText}>#{r.rank}</Text> : <Text style={styles.nestedRankText}>-</Text>}
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                {r.is_group && r.registration_id ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Show members of ${resultDisplayName(r)}`} accessibilityState={{ expanded: expandedGroupResultId === r.result_id }} onPress={() => setExpandedGroupResultId(expandedGroupResultId === r.result_id ? null : r.result_id)}><Text style={styles.nestedParticipantName}>{resultDisplayName(r)} ▾</Text></TouchableOpacity> : <Text style={styles.nestedParticipantName}>{resultDisplayName(r)}</Text>}
                                <ResultStatusBadge status={status} />
                                <PublicVisibilityBadge visible={r.public_visible === true} />
                              </View>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                <Text style={styles.nestedMeta}>{r.organisation_name}</Text>
                                {r.grade && <Text style={[styles.nestedMeta, { color: coreColor('#0F172A', 'overlay'), fontWeight: '700' }]}>• Grade {r.grade}</Text>}
                                <Text style={[styles.nestedMeta, { color: coreColor('#0F766E', 'primaryText'), fontWeight: '700' }]}>• {r.points_awarded} pts</Text>
                              </View>
                              {r.is_group && r.registration_id && expandedGroupResultId === r.result_id && festivalId && tenant_id ? <GroupMembers registrationId={r.registration_id} festivalId={festivalId} tenantId={tenant_id} /> : null}
                            </View>
                          </View>
                          {/* Individual Overrides */}
                          <View style={[styles.nestedActions, { flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 4 }]}>
                           {r.public_visible !== true && (
                              <TouchableOpacity onPress={() => handleSingleVisibility(r.result_id, 'published')} style={[styles.nestedActionBtn, { backgroundColor: ui.colors.successSoft }]}>
                                <CheckCircle2 size={14} color={coreColor("#15803D", 'success')} />
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
                </>}
              </View>
            );
          })}
        </View>
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
                        <View style={[styles.itemTypeBadge, { backgroundColor: coreColor('#f3f4f6', 'surface'), borderColor: coreColor('#e5e7eb', 'border'), borderWidth: 1 }]}>
                          <Text style={[styles.itemTypeBadgeText, { color: coreColor('#4b5563', 'text') }]}>{itemDetailsMap.get(previewGroup.item_id).item_code}</Text>
                        </View>
                     )}
                     {(itemDetailsMap.get(previewGroup.item_id)?.category_codes || []).map((code: string) => {
                        const cat = festivalCategories.find(c => c.code.toLowerCase() === code.toLowerCase());
                        const catName = cat ? cat.name : (code.charAt(0).toUpperCase() + code.slice(1));
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
                         <Text style={{ fontFamily: "Outfit_700Bold", fontSize: 13, color: coreColor(colors.navy, 'primaryText') }}>
                           {r.rank ? `#${r.rank}` : '-'}
                         </Text>
                       </View>
                       <View style={{ flex: 1, minWidth: 150 }}>
                         {r.is_group && r.registration_id ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Show members of ${resultDisplayName(r)}`} accessibilityState={{ expanded: expandedGroupResultId === r.result_id }} onPress={() => setExpandedGroupResultId(expandedGroupResultId === r.result_id ? null : r.result_id)}><Text style={{ fontFamily: "Outfit_700Bold", fontSize: 13, color: colors.text }}>{resultDisplayName(r)} ▾</Text></TouchableOpacity> : <Text style={{ fontFamily: "Outfit_700Bold", fontSize: 13, color: colors.text }}>{resultDisplayName(r)}</Text>}
                         <Text style={{ fontFamily: "Outfit_400Regular", fontSize: 11, color: colors.muted }}>
                           {r.organisation_name}
                         </Text>
                         {r.is_group && r.registration_id && expandedGroupResultId === r.result_id && festivalId && tenant_id ? <GroupMembers registrationId={r.registration_id} festivalId={festivalId} tenantId={tenant_id} /> : null}
                       </View>
                       <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                         {r.grade && <Text style={{ fontFamily: "Outfit_700Bold", fontSize: 12, color: coreColor(colors.navy, 'primaryText') }}>Grade {r.grade}</Text>}
                         <Text style={{ fontFamily: "Outfit_700Bold", fontSize: 13, color: coreColor(colors.teal, 'primaryText') }}>• {r.points_awarded} pts</Text>
                       </View>
                    </View>
                  ))}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.primaryAction, { flex: 1 }]}
                    onPress={() => { handleItemBulkAction(previewGroup, 'published'); setPreviewGroup(null); }}
                  >
                    <CheckCircle2 size={16} color={ui.colors.onPrimary} />
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
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
  },
  cardSubTitle: {
    color: colors.muted,
    fontFamily: "Outfit_400Regular",
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
    color: coreColor(colors.teal, 'primaryText'),
    fontFamily: "Outfit_700Bold",
    fontSize: 12,
  },
  searchBarContainer: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
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
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    padding: 0,
  },
  resultFilters: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterSelectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  filterSelect: {
    minWidth: 135,
    flexGrow: 1,
    flexBasis: 155,
    maxWidth: 220,
  },
  viewSwitcher: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 4,
    marginTop: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: ui.colors.background,
  },
  viewButton: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 7,
  },
  viewButtonActive: {
    backgroundColor: colors.teal,
  },
  viewButtonText: {
    color: colors.muted,
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
  },
  viewButtonTextActive: {
    color: ui.colors.onPrimary,
  },
  loadingBox: {
    paddingVertical: 56,
    alignItems: 'center',
  },
  loadingText: {
    color: colors.muted,
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    marginTop: 10,
  },
  errorText: {
    color: ui.colors.danger,
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
  },
  cardsList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 7,
  },
  itemGroupCard: {
    backgroundColor: ui.colors.surface,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: coreColor('#E2E8F0', 'border'),
    overflow: 'hidden',
  },
  itemGroupHeader: {
    backgroundColor: ui.colors.background,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: coreColor('#E2E8F0', 'border'),
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 6,
  },
  itemGroupTitle: {
    flexShrink: 1,
    color: coreColor(colors.navy, 'primaryText'),
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
  },
  itemGroupCount: {
    color: colors.muted,
    fontFamily: "Outfit_700Bold",
    fontSize: 12,
  },
  itemTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: coreColor('#F1F5F9', 'surface'),
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: coreColor('#E2E8F0', 'border'),
  },
  itemTypeBadgeText: {
    color: coreColor(colors.navy, 'primaryText'),
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
  },
  itemGroupStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  itemGroupStatusText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
  },
  itemGroupActions: {
    flexDirection: 'row',
    gap: 5,
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginLeft: 'auto',
  },
  expandedActionRow: {
    minHeight: 32,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: coreColor('#E2E8F0', 'border'),
  },
  bulkActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: coreColor('#E2E8F0', 'border'),
  },
  publicAction: {
    backgroundColor: ui.colors.successSoft,
    borderColor: coreColor('#BBF7D0', 'border'),
  },
  hideAction: {
    backgroundColor: ui.colors.dangerSoft,
    borderColor: coreColor('#FECACA', 'border'),
  },
  bulkActionBtnText: {
    color: coreColor(colors.navy, 'primaryText'),
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
  },
  itemGroupParticipants: {
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  nestedResultRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 2,
    gap: 7,
  },
  nestedRankText: {
    color: colors.muted,
    fontFamily: "Outfit_700Bold",
    fontSize: 12,
  },
  nestedParticipantName: {
    color: colors.text,
    fontFamily: "Outfit_700Bold",
    fontSize: 12,
  },
  nestedMeta: {
    color: colors.muted,
    fontFamily: "Outfit_500Medium",
    fontSize: 10,
  },
  nestedActions: {
    flexDirection: 'row',
    gap: 6,
  },
  nestedActionBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tableScroll: {
    width: '100%',
  },
  tableScrollContent: {
    minWidth: '100%',
  },
  resultsTable: {
    minWidth: 920,
    width: '100%',
  },
  resultsTableHeader: {
    minHeight: 34,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ui.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultsTableRow: {
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableItemHeading: {
    minHeight: 38,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: coreColor('#F8FAFC', 'surface'),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableItemToggle: {
    minHeight: 36,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tableHeading: {
    color: colors.muted,
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  tableCell: {
    color: colors.text,
    fontFamily: 'Outfit_500Medium',
    fontSize: 11,
  },
  rankColumn: {
    width: 48,
  },
  participantColumn: {
    width: 190,
  },
  organisationColumn: {
    width: 170,
  },
  gradeColumn: {
    width: 60,
  },
  pointsColumn: {
    width: 70,
  },
  statusColumn: {
    width: 130,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  rowActionsColumn: {
    width: 100,
  },
  tableItemCode: {
    color: colors.muted,
    fontFamily: 'Outfit_500Medium',
    fontSize: 10,
  },
  tableItemCount: {
    color: colors.muted,
    fontFamily: 'Outfit_500Medium',
    fontSize: 10,
    marginRight: 4,
  },
  tableParticipantName: {
    color: colors.text,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 11,
  },
  resultRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    backgroundColor: coreColor('#F8FAFC', 'surface'),
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: coreColor('#E2E8F0', 'border'),
  },
  previewItemName: {
    color: coreColor(colors.navy, 'primaryText'),
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
  },
  previewItemMeta: {
    color: colors.muted,
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    marginTop: 2,
  },
  previewResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: coreColor('#F1F5F9', 'border'),
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
    color: ui.colors.onPrimary,
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
  },
  outlineAction: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: coreColor('#FECACA', 'border'),
    backgroundColor: coreColor('#FEF2F2', 'dangerSoft'),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  outlineActionText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
  },
});
