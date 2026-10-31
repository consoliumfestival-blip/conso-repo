import { coreColor } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ChevronDown, Plus, Search, Trash2, X } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { GroupRosterEditor } from '../../../components/participants/GroupRosterEditor';
import { GroupEntryDeleteDialog } from '../../../components/participants/GroupEntryDeleteDialog';
import { TeamProgramProgressModal } from '../../../components/participants/TeamProgramProgressModal';
import { useFestival } from '../../../core/hooks/useFestival';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { useCodeLetterUpdates } from '../../../core/hooks/useCodeLetterUpdates';
import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../core/config/supabase';
import { formatGeneralEntryError, GeneralTeamEntry, generalEntryService, getGeneralTeamSelectionError } from '../../../services/generalEntryService';
import { invalidateGeneralMembership } from '../../../core/utils/invalidateGeneralMembership';
import { invalidateCodeLetters } from '../../../core/utils/invalidateCodeLetters';
import { matchesCompetitionCategory } from '../../../core/utils/groupParticipation';
import { programReadService, programCacheOptions, programDetailCacheOptions, type ProgramItem, type ProgramCard } from '../../../services/programReadService';
import { isGeneralCategoryCode } from '../../../core/utils/generalCategory';


function normalizedCategory(code: string) {
  const normalized = code.trim().toUpperCase();
  return isGeneralCategoryCode(normalized) ? 'GENERAL' : normalized;
}


export default function ProgramsScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const openedEditRef = useRef<string | null>(null);
  const { width, height } = useWindowDimensions();
  const queryClient = useQueryClient();
  const { role, is_superadmin, tenant_id, user } = useAuthStore();
  const { useActiveFestival, useApplyItemChanges } = useFestival();
  const { data: festival, isLoading: festivalLoading } = useActiveFestival();
  const visibilityTenantId = tenant_id ?? festival?.tenant_id ?? null;
  const applyItemChanges = useApplyItemChanges(festival?.id);
  const { registerParticipant, deleteRegistration } = useParticipants(undefined, { loadList: false, loadRegistrations: false });
  const [section, setSection] = useState<'individual' | 'group'>(typeof edit === 'string' ? 'group' : 'individual');
  const [cardsWidth, setCardsWidth] = useState(0);
  const [editingEntry, setEditingEntry] = useState<GeneralTeamEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<GeneralTeamEntry | null>(null);
  const [activeCard, setActiveCard] = useState<ProgramCard | null>(null);
  const [cardModalMode, setCardModalMode] = useState<'details' | 'assign'>('assign');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [programSearch, setProgramSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [participantCategoryFilter, setParticipantCategoryFilter] = useState('All categories');
  const [typeFilter, setTypeFilter] = useState('All types');
  const [stageFilter, setStageFilter] = useState('All stages');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [filterPicker, setFilterPicker] = useState<'type' | 'stage' | 'status' | 'category' | null>(null);
  const [itemToDeactivate, setItemToDeactivate] = useState<ProgramItem | null>(null);
  const [showTeamProgress, setShowTeamProgress] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeselect, setConfirmDeselect] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { if (typeof edit === 'string') setSection('group'); }, [edit]);
  useEffect(() => {
    setPage(1); setActiveCard(null); setEditingEntry(null); setDeletingEntry(null); setSelectedIds([]);
  }, [visibilityTenantId, festival?.id, user?.id]);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(programSearch.trim()); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [programSearch]);
  const hasAccess = !!user?.id && (role === 'admin' || is_superadmin);
  const pageQuery = useQuery({
    queryKey: ['program-cards', visibilityTenantId, festival?.id, user?.id, section, debouncedSearch, typeFilter, stageFilter, statusFilter, categoryFilter, page],
    queryFn: ({ signal }) => programReadService.page({ tenantId: visibilityTenantId!, festivalId: festival!.id, section, search: debouncedSearch, type: typeFilter, stage: stageFilter, status: statusFilter, category: categoryFilter, page }, signal),
    enabled: hasAccess && !!visibilityTenantId && !!festival?.id && programSearch.trim() === debouncedSearch,
    ...programCacheOptions,
  });
  const programCards = pageQuery.data?.cards ?? [];
  const sectionCards = { length: pageQuery.data?.section_total ?? 0 };
  const doneCount = pageQuery.data?.completed ?? 0;
  const itemsError = pageQuery.error;
  const retryItems = pageQuery.refetch;
  // Completion flags and filter options are part of the same backend snapshot.
  const statuses = pageQuery;
  const filterOptions = {
    type: ['All types', ...(pageQuery.data?.options.type ?? [])],
    stage: ['All stages', ...(pageQuery.data?.options.stage ?? [])],
    status: ['All statuses', 'Complete', 'Open'],
    category: ['All categories', ...(pageQuery.data?.options.category ?? [])],
  };
  const entryItemId = activeCard?.kind === 'general_team' && cardModalMode === 'details' ? activeCard.item.id : undefined;
  const entries = useQuery({
    queryKey: ['general-team-entries', festival?.id, visibilityTenantId, user?.id, entryItemId ?? null, edit ?? null],
    enabled: hasAccess && !!festival?.id && (!!entryItemId || (typeof edit === 'string' && openedEditRef.current !== edit)),
    queryFn: ({ signal }) => generalEntryService.list(festival!.id, entryItemId ? { itemId: entryItemId } : { entryId: edit }, signal),
    ...programDetailCacheOptions,
  });
  useEffect(() => {
    if (typeof edit !== 'string' || openedEditRef.current === edit || !entries.data) return;
    const entry = entries.data.find(row => row.id === edit);
    if (entry) { openedEditRef.current = edit; setSection('group'); setEditingEntry(entry); }
  }, [edit, entries.data]);
  const detailItemId = activeCard?.item.id ?? editingEntry?.item?.id;
  const detailCategory = activeCard?.category ?? editingEntry?.item?.category_codes?.[0];
  const includeEligible = !!editingEntry || (cardModalMode === 'assign' && !!activeCard);
  const shouldLoadProgramDetail = activeCard?.kind !== 'general_team' || cardModalMode === 'assign';
  const detailQuery = useQuery({
    queryKey: ['program-detail', visibilityTenantId, festival?.id, user?.id, detailItemId, detailCategory, includeEligible],
    queryFn: ({ signal }) => programReadService.detail(visibilityTenantId!, festival!.id, detailItemId!, detailCategory!, includeEligible, signal),
    enabled: hasAccess && !!visibilityTenantId && !!festival?.id && !!detailItemId && !!detailCategory && shouldLoadProgramDetail,
    ...programDetailCacheOptions,
  });
  const participants = useMemo(() => detailQuery.data?.participants ?? [], [detailQuery.data]);
  const festivalRegistrations = useMemo(() => detailQuery.data?.registrations ?? [], [detailQuery.data]);
  const participantsError = detailQuery.error;
  const registrationsError = detailQuery.error;
  const registrationsUnavailable = !detailQuery.isSuccess || detailQuery.isFetching;
  const retryParticipants = detailQuery.refetch;
  const retryRegistrations = detailQuery.refetch;
  const visibleOrganisations = detailQuery;
  const visibleOrganisationIds = useMemo(() => new Set(detailQuery.data?.organisation_ids ?? []), [detailQuery.data]);
  const invalidateProgramReads = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['program-cards', visibilityTenantId, festival?.id] }),
      queryClient.invalidateQueries({ queryKey: ['program-detail', visibilityTenantId, festival?.id] }),
    ]);
  };
  useCodeLetterUpdates(festival?.id ? `festival:${festival.id}` : null, () => Promise.all([
    invalidateCodeLetters(queryClient, { festivalId: festival?.id }),
    queryClient.invalidateQueries({ queryKey: ['program-detail', visibilityTenantId, festival?.id] }),
  ]));
  const refreshPrograms = async () => {
    await pageQuery.refetch();
    if (detailItemId && shouldLoadProgramDetail) await detailQuery.refetch();
    if (entryItemId) await entries.refetch();
  };
  useEffect(() => {
    if (pageQuery.data && page > Math.max(1, Math.ceil(pageQuery.data.total / 20))) {
      setPage(Math.max(1, Math.ceil(pageQuery.data.total / 20)));
    }
  }, [pageQuery.data, page]);

  const eligibleParticipants = useMemo(() => (participants as any[]).filter(person =>
    person.festival_id === festival?.id && !!person.organisation_id && visibleOrganisationIds.has(person.organisation_id) && person.status !== 'rejected'
      && matchesCompetitionCategory(String(person.category_code || ''), activeCard?.category || '', person.is_post_hs_religious === true)
      && (!activeCard?.item.gender || activeCard.item.gender === 'both' || activeCard.item.gender === person.gender)
  ), [participants, festival?.id, visibleOrganisationIds, activeCard?.category, activeCard?.item.gender]);
  const currentRegistrations = entries.data ?? [];
  const participantById = useMemo(() => new Map((participants as any[]).map(person => [person.id, person])), [participants]);
  const itemAssignmentsByTeam = useMemo(() => {
    const counts = new Map<string, Map<string, number>>();
    festivalRegistrations.forEach((row: any) => {
      if (!row.item_id || !row.participant_id || row.entry_kind !== 'participant' || row.status === 'rejected' || row.status === 'cancelled') return;
      const organisationId = row.organisation_id || participantById.get(row.participant_id)?.organisation_id;
      if (!organisationId) return;
      const byTeam = counts.get(row.item_id) ?? new Map<string, number>();
      byTeam.set(organisationId, (byTeam.get(organisationId) || 0) + 1);
      counts.set(row.item_id, byTeam);
    });
    return counts;
  }, [festivalRegistrations, participantById]);
  const activeAssignedRegistrations = useMemo(() => festivalRegistrations.filter((row: any) =>
    activeCard?.kind === 'participant' && row.item_id === activeCard.item.id && row.participant_id && row.status !== 'rejected'
      && matchesCompetitionCategory(String(participantById.get(row.participant_id)?.category_code || ''), activeCard.category)
  ), [festivalRegistrations, activeCard, participantById]);
  const activeItemAssignmentsByTeam = activeCard?.kind === 'participant'
    ? itemAssignmentsByTeam.get(activeCard.item.id) ?? new Map<string, number>()
    : new Map<string, number>();
  const activeAssignedIds = useMemo(() => new Set(activeAssignedRegistrations.map((row: any) => row.participant_id)), [activeAssignedRegistrations]);
  const activeItemAssignedIds = useMemo(() => new Set(festivalRegistrations
    .filter((row: any) => activeCard?.kind === 'participant' && row.item_id === activeCard.item.id
      && row.participant_id && row.status !== 'rejected' && row.status !== 'cancelled')
    .map((row: any) => row.participant_id)), [festivalRegistrations, activeCard]);
  const activeAssignedParticipants = useMemo(() => Array.from(activeAssignedIds)
    .map(id => participantById.get(id)).filter(Boolean), [activeAssignedIds, participantById]);
  const chosenParticipants = eligibleParticipants.filter(person => selectedIds.includes(person.id));
  const selectedCountsByTeam = new Map<string, number>();
  chosenParticipants.forEach(person => {
    if (person.organisation_id) selectedCountsByTeam.set(person.organisation_id, (selectedCountsByTeam.get(person.organisation_id) || 0) + 1);
  });
  const activeParticipantLimit = activeCard?.kind === 'participant' ? activeCard.item.max_participants_per_team ?? null : null;
  const hasSelectionOverLimit = activeParticipantLimit != null && Array.from(selectedCountsByTeam.entries()).some(([organisationId, count]) =>
    (activeItemAssignmentsByTeam.get(organisationId) || 0) + count > activeParticipantLimit
  );
  const overLimitTeamCount = activeParticipantLimit == null ? 0 : Array.from(activeItemAssignmentsByTeam.values())
    .filter(count => count > activeParticipantLimit).length;
  const orgIds = new Set(chosenParticipants.map(person => person.organisation_id).filter(Boolean));
  const requiredMin = Number(activeCard?.item.group_min_members ?? 0);
  const requiredMax = Number(activeCard?.item.group_max_members ?? 0);
  const generalSelectionError = activeCard?.kind === 'general_team' ? getGeneralTeamSelectionError({
    selectedCount: chosenParticipants.length,
    organisationCount: orgIds.size,
    minMembers: requiredMin,
    maxMembers: requiredMax,
  }) : null;
  const generalSizeValid = activeCard?.kind === 'general_team' && !generalSelectionError;

  const selectAllEligibleWithoutLimit = () => {
    if (activeParticipantLimit != null) return;
    setSelectedIds(eligibleParticipants.filter(person => !activeItemAssignedIds.has(person.id)).map(person => person.id));
    setError('');
  };
  const toggleSelectedParticipant = (person: any) => {
    const selected = selectedIds.includes(person.id);
    if (selected) {
      setSelectedIds(selectedIds.filter(id => id !== person.id));
      setError('');
      return;
    }
    const organisationId = person.organisation_id;
    const currentCount = organisationId
      ? (activeItemAssignmentsByTeam.get(organisationId) || 0)
        + (selectedCountsByTeam.get(organisationId) || 0)
      : 0;
    if (activeParticipantLimit != null && currentCount >= activeParticipantLimit) {
      setError('This team has reached the participant limit for this item. Remove an existing assignment before adding another.');
      return;
    }
    setSelectedIds([...selectedIds, person.id]);
    setError('');
  };

  const cardComplete = (itemId: string, category: string, kind: string) => (programCards.find(card => card.item.id === itemId && card.category === category && card.kind === kind) ?? activeCard)?.is_complete ?? false;
  const setComplete = async (complete: boolean) => {
    if (!festival || !activeCard || saving || itemsError || statuses.error) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const { error: rpcError } = await supabase.rpc('set_program_intake_status', {
        p_festival_id: festival.id, p_item_id: activeCard.item.id, p_category_code: activeCard.category,
        p_entry_kind: activeCard.kind, p_is_complete: complete,
      });
      if (rpcError) throw new Error(rpcError.message);
      setActiveCard(card => card ? { ...card, is_complete: complete } : null);
      await invalidateProgramReads();
      await queryClient.invalidateQueries({ queryKey: ['program-intake-statuses', festival.id] });
      setNotice(complete ? 'Program marked complete.' : 'Program reopened.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update program status.'); }
    finally { setSaving(false); }
  };

  const addSelected = async () => {
    if (!festival || !activeCard || saving || selectedIds.length === 0 || registrationsUnavailable) return;
    if (itemsError || participantsError) return;
    if (activeCard.kind === 'participant' && registrationsUnavailable) return;
    let attemptedWrite = false;
    setSaving(true); setError(''); setNotice('');
    try {
      if (activeCard.kind === 'general_team') {
        if (generalSelectionError) throw new Error(generalSelectionError);
        attemptedWrite = true;
        const created = await generalEntryService.create(festival.id, activeCard.item.id, selectedIds);
        setNotice(`Group entry created using leader chest ${created.entry_chest_number}.`);
        await invalidateGeneralMembership(queryClient, festival.id, selectedIds);
        await queryClient.invalidateQueries({ queryKey: ['scheduleRegistrations'] });
      } else {
        if (hasSelectionOverLimit) throw new Error('The selected students exceed the participant limit for one or more teams.');
        const failures: string[] = [];
        let added = 0;
        for (const person of eligibleParticipants.filter(candidate => selectedIds.includes(candidate.id))) {
          attemptedWrite = true;
          const result = await registerParticipant({ participant: person, item: activeCard.item, festivalConfig: festival });
          if (result.errors?.length) failures.push(`${person.name}: ${result.errors.map(entry => entry.message).join(', ')}`);
          else added += 1;
        }
        setNotice(`${added} participant(s) added.${failures.length ? ` ${failures.length} could not be added: ${failures.join('; ')}` : ''}`);
        await queryClient.invalidateQueries({ queryKey: ['festivalRegistrations', festival.id] });
        await queryClient.invalidateQueries({ queryKey: ['participantRegistrations'] });
      }
      setSelectedIds([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add selected participants.'); }
    finally {
      if (attemptedWrite) {
        await Promise.allSettled([
          invalidateProgramReads(),
          queryClient.invalidateQueries({ queryKey: ['program-intake-statuses', festival.id] }),
        ]);
      }
      setSaving(false);
    }
  };

  const deselectSelected = async () => {
    if (!festival || !activeCard || activeCard.kind !== 'participant' || saving || selectedIds.length === 0) return;
    if (registrationsUnavailable) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const selectedRows = activeAssignedRegistrations.filter((row: any) => selectedIds.includes(row.participant_id));
      let removed = 0;
      const failures: string[] = [];
      for (const row of selectedRows as any[]) {
        try {
          const result = await deleteRegistration({
            registrationId: row.id,
            itemId: activeCard.item.id,
            reason: 'Deselected from Programs page',
          });
          if (result.status === 'removed') removed += 1;
          else failures.push(result.message || 'An assignment could not be deselected because it has dependent competition data.');
        } catch (cause) {
          failures.push(cause instanceof Error ? cause.message : 'An assignment could not be deselected.');
        }
      }
      setSelectedIds([]);
      setConfirmDeselect(false);
      await invalidateProgramReads();
      setNotice(`${removed} participant assignment(s) deselected.${failures.length ? ` ${failures.join(' ')}` : ''}`);
      await queryClient.invalidateQueries({ queryKey: ['festivalRegistrations', festival.id] });
      await queryClient.invalidateQueries({ queryKey: ['participantRegistrations'] });
      await queryClient.invalidateQueries({ queryKey: ['program-intake-statuses', festival.id] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not deselect the selected participants.');
    } finally {
      setSaving(false);
    }
  };

  const openCard = (card: typeof programCards[number], mode: 'details' | 'assign') => {
    setActiveCard(card); setCardModalMode(mode); setSelectedIds([]); setConfirmDeselect(false); setSearch(''); setParticipantCategoryFilter('All categories'); setError(''); setNotice('');
  };
  const visibleParticipants = (cardModalMode === 'details'
    ? activeAssignedParticipants
    : [...activeAssignedParticipants, ...eligibleParticipants.filter(person => !activeAssignedIds.has(person.id))])
    .filter(person =>
    (participantCategoryFilter === 'All categories' || normalizedCategory(String(person.category_code || '')) === participantCategoryFilter)
      && `${person.name ?? ''} ${person.chest_number ?? ''} ${person.organisations?.name ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const participantCategoryOptions = Array.from(new Set(eligibleParticipants
    .map(person => normalizedCategory(String(person.category_code || ''))).filter(Boolean))).sort();
  const deactivateItem = async () => {
    const target = itemToDeactivate;
    if (!festival || !target || deactivating) return;
    setDeactivating(true);
    try {
      await applyItemChanges.mutateAsync({
        activateCodes: [],
        deactivateCodes: [target.item_code],
        itemRecords: [],
      });
      await queryClient.invalidateQueries({ queryKey: ['items', festival.id] });
      await invalidateProgramReads();
      setNotice('');
      setItemToDeactivate(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not deactivate this program.';
      setNotice(`Could not deactivate ${target.item_name_en || target.item_code}: ${message}`);
    } finally {
      setDeactivating(false);
    }
  };

  if (role !== 'admin' && !is_superadmin) return <View className="flex-1 p-5"><Text>Administrator access is required.</Text></View>;
  if (festivalLoading) return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  if (!festival) return <View className="flex-1 p-5"><Text className="font-poppins text-ui-text">Select or activate a festival first.</Text></View>;

  const sectionLabel = section === 'individual' ? 'Individual' : 'Group items';
  const isPhone = width < 600;
  const hasActiveFilters = typeFilter !== 'All types' || stageFilter !== 'All stages' || statusFilter !== 'All statuses' || categoryFilter !== 'All categories';
  const cardsAvailableWidth = cardsWidth || width - 32;
  // Keep at least 210px for readable cards, and use every column that fits on wider screens.
  const cardColumns = isPhone ? 1 : Math.max(2, Math.floor((cardsAvailableWidth + 12) / 222));
  const cardWidth = isPhone ? '100%' : (cardsAvailableWidth - (cardColumns - 1) * 12) / cardColumns;
  const pickerOptions = filterPicker ? filterOptions[filterPicker] : [];
  const pickerValue = filterPicker === 'type' ? typeFilter : filterPicker === 'stage' ? stageFilter : filterPicker === 'status' ? statusFilter : categoryFilter;
  const setPickerValue = (value: string) => {
    setPage(1);
    if (filterPicker === 'type') setTypeFilter(value);
    if (filterPicker === 'stage') setStageFilter(value);
    if (filterPicker === 'status') setStatusFilter(value);
    if (filterPicker === 'category') setCategoryFilter(value);
    setFilterPicker(null);
  };

  return <View className="flex-1 bg-ssf-bg">
    <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 28 }}>
      <View className="mb-4 flex-row flex-wrap items-end justify-between gap-3">
        <View>
          <Text className="font-poppins-bold text-[10px] uppercase tracking-widest text-ui-text-muted">Festival · {festival.custom_name || festival.level} {festival.festival_year}</Text>
          <Text className="mt-1 font-poppins-black text-2xl text-ui-text">Programs</Text>
          <Text className="mt-1 font-poppins text-xs text-ui-text-muted">{itemsError ? 'Programs unavailable' : `${sectionCards.length} programs`} · {itemsError || statuses.error ? 'Completion unavailable' : `${doneCount} completed`}</Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          {(['individual', 'group'] as const).map(value => <TouchableOpacity key={value} onPress={() => { setPage(1); setSection(value); setTypeFilter('All types'); setCategoryFilter('All categories'); }} className={`rounded-lg border px-3 py-2 ${section === value ? 'border-core-primary-emerald-700 bg-core-primary-emerald-700' : 'border-ui-border bg-core-surface-white'}`}><Text className={`font-poppins-bold text-xs ${section === value ? 'text-core-on-primary-white' : 'text-ui-text'}`}>{value === 'individual' ? 'Individual' : 'Group items'}</Text></TouchableOpacity>)}
          <SsfButton label={pageQuery.isFetching ? 'Refreshing…' : 'Refresh'} variant="outline" size="sm" onPress={() => { void refreshPrograms(); }} disabled={pageQuery.isFetching || saving} />
          <TouchableOpacity onPress={() => setShowTeamProgress(true)} className="min-h-10 justify-center rounded-lg border border-ui-border bg-core-surface-white px-3" accessibilityRole="button" accessibilityLabel="View team program progress"><Text className="font-poppins-bold text-xs text-ui-text">Team progress</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/settings/items' as any)} className="flex-row items-center gap-1.5 rounded-lg bg-core-primary-emerald-700 px-3 py-2" accessibilityRole="button"><Plus size={15} color={coreColor("white", 'onPrimary')}/><Text className="font-poppins-bold text-xs text-core-on-primary-white">Add program</Text></TouchableOpacity>
        </View>
      </View>
      {!!notice && <Text className="mb-3 font-poppins text-xs text-core-success-emerald-700">{notice}</Text>}
      {itemsError && <SsfCard><Text className="font-poppins text-sm text-core-danger-red-700">Could not load programs.</Text><SsfButton label="Retry programs" variant="outline" size="sm" onPress={() => { void retryItems(); }} /></SsfCard>}
      {participantsError && <SsfCard><Text className="font-poppins text-sm text-core-danger-red-700">Could not load participants. Assignment is unavailable until they load.</Text><SsfButton label="Retry participants" variant="outline" size="sm" onPress={() => { void retryParticipants(); }} /></SsfCard>}
      <View className="mb-3 flex-row flex-wrap items-center gap-2 rounded-xl border border-ui-border bg-core-surface-white p-2">
        <View className="h-10 flex-row items-center rounded-lg border border-ui-border px-3" style={{ minWidth: isPhone ? 0 : 210, width: isPhone ? '100%' : undefined, flex: isPhone ? undefined : 1, height: isPhone ? 44 : 40 }}>
          <Search size={16} color={coreColor("#64748B", 'textMuted')}/><TextInput value={programSearch} onChangeText={setProgramSearch} placeholder="Search by program name or code..." className="ml-2 flex-1 font-poppins text-sm outline-none" />
          {!!programSearch && <TouchableOpacity onPress={() => setProgramSearch('')} accessibilityLabel="Clear search"><X size={15} color={coreColor("#64748B", 'textMuted')}/></TouchableOpacity>}
        </View>
        {([['stage', stageFilter], ['status', statusFilter], ['type', typeFilter], ['category', categoryFilter]] as const).map(([key, value]) => <TouchableOpacity key={key} disabled={key === 'status' && !!statuses.error} onPress={() => setFilterPicker(key)} className="h-10 flex-row items-center justify-between gap-2 rounded-lg border border-ui-border bg-core-surface-white px-3" style={{ minWidth: isPhone ? 0 : 112, width: isPhone ? '48%' : undefined, flexGrow: isPhone ? 1 : 0, height: isPhone ? 44 : 40, opacity: key === 'status' && statuses.error ? 0.5 : 1 }} accessibilityRole="button" accessibilityLabel={`${key} filter, currently ${key === 'status' && statuses.error ? 'unavailable' : value}`}><Text className="min-w-0 flex-1 font-poppins text-xs text-ui-text" numberOfLines={1}>{key === 'status' && statuses.error ? 'Status unavailable' : key === 'category' && value === 'GENERAL' ? 'General' : value}</Text><ChevronDown size={14} color={coreColor("#64748B", 'textMuted')}/></TouchableOpacity>)}
        {hasActiveFilters ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear program filters" onPress={() => { setPage(1); setTypeFilter('All types'); setStageFilter('All stages'); setStatusFilter('All statuses'); setCategoryFilter('All categories'); }} className="min-h-11 justify-center px-2" style={{ width: isPhone ? '100%' : undefined, alignItems: isPhone ? 'flex-end' : 'center' }}><Text className="font-poppins-bold text-xs text-core-success-emerald-800">Clear filters</Text></TouchableOpacity> : null}
      </View>
      {!itemsError && !statuses.error && <SsfCard><View className="flex-row items-center justify-between"><Text className="font-poppins-bold text-sm text-ui-text">{doneCount} of {sectionCards.length} {sectionLabel.toLowerCase()} programs complete</Text><Text className="font-poppins-bold text-xs text-core-success-emerald-700">{sectionCards.length ? Math.round(doneCount / sectionCards.length * 100) : 0}%</Text></View><View className="mt-2 h-1.5 overflow-hidden rounded-full bg-core-surface-muted-slate-100"><View className="h-full rounded-full bg-core-success-action-emerald-600" style={{ width: `${sectionCards.length ? doneCount / sectionCards.length * 100 : 0}%` }} /></View></SsfCard>}
      {statuses.error && <SsfCard><Text className="font-poppins text-sm text-core-danger-red-700">Completion status could not be loaded: {statuses.error.message}</Text><SsfButton label="Retry completion status" variant="outline" size="sm" onPress={() => { void statuses.refetch(); }} /></SsfCard>}
      {registrationsError && section === 'individual' && <SsfCard><Text className="font-poppins text-sm text-core-danger-red-700">Could not load all participant assignments.</Text><SsfButton label="Retry assignments" variant="outline" size="sm" onPress={() => { void retryRegistrations(); }} /></SsfCard>}
      {section === 'group' && entries.error && <SsfCard><Text className="font-poppins text-sm text-core-danger-red-700">{formatGeneralEntryError(entries.error, 'load')}</Text></SsfCard>}
      {visibleOrganisations.error && <SsfCard><Text className="font-poppins text-sm text-core-danger-red-700">Could not load the organisations available to this account: {visibleOrganisations.error.message}</Text></SsfCard>}
      {!visibilityTenantId && <SsfCard><Text className="font-poppins text-sm text-core-danger-red-700">Could not determine the organisation scope for participant assignment.</Text></SsfCard>}
      {section === 'group' && <Text className="mb-2 mt-4 font-poppins text-xs text-ui-text-muted">Create one entry per team. Use the selected leader chest number to identify the group.</Text>}
      {pageQuery.isFetching || programSearch.trim() !== debouncedSearch ? <View className="flex-row items-center gap-2 py-3"><ActivityIndicator size="small" /><Text className="font-poppins text-xs text-ui-text-muted">Loading programs…</Text></View> : itemsError ? null : programCards.length === 0 ? <SsfCard className="mt-3"><Text className="font-poppins text-sm text-ui-text-muted">No {programSearch || typeFilter !== 'All types' || stageFilter !== 'All stages' || (!statuses.error && statusFilter !== 'All statuses') || categoryFilter !== 'All categories' ? 'matching' : 'active'} {section === 'individual' ? 'individual' : 'group'} programs found.</Text></SsfCard> : <View onLayout={event => setCardsWidth(event.nativeEvent.layout.width)} className="mt-3 flex-row flex-wrap gap-3">{programCards.map(card => {
        const complete = cardComplete(card.item.id, card.category, card.kind);
        const overLimitTeams = card.over_limit_teams;
        return <View key={`${card.item.id}:${card.category}`} style={{ width: cardWidth }} className={`rounded-xl border border-ui-border bg-core-surface-white shadow-sm ${isPhone ? 'p-3' : 'p-2.5'}`}>
          <View className={`${isPhone ? 'min-h-[76px]' : 'min-h-[60px]'} flex-row items-start justify-between gap-2`}><View className="flex-1"><Text className="font-poppins-bold text-sm text-ui-text" numberOfLines={2}>{card.item.item_name_en || card.item.item_name_ml || card.item.item_code}</Text><Text className="mt-1 font-poppins text-[11px] text-ui-text-muted">{card.category}</Text></View><View className={`rounded-full px-2 py-1 ${complete && !statuses.error ? 'bg-core-success-soft-emerald-100' : 'bg-core-surface-muted-slate-100'}`}><Text className={`font-poppins-bold text-[10px] ${complete && !statuses.error ? 'text-core-success-emerald-800' : 'text-core-text-slate-600'}`}>{statuses.error ? 'Status unavailable' : complete ? 'Complete' : 'Open'}</Text></View></View>
          <View className="mb-3 flex-row flex-wrap gap-1.5"><View className="rounded-md bg-core-surface-muted-slate-100 px-2 py-1"><Text className="font-poppins-bold text-[10px] text-core-text-slate-700">{card.item.participation_type === 'individual' ? 'Individual' : 'Group'}</Text></View>{!!card.item.item_type && <View className="rounded-md bg-core-surface-muted-slate-100 px-2 py-1"><Text className="font-poppins-bold text-[10px] text-core-text-slate-700">{card.item.item_type === 'stage' ? 'On Stage' : 'Off Stage'}</Text></View>}</View>
          {overLimitTeams > 0 && <View className="mb-2 flex-row items-start gap-2 rounded-md border border-core-danger-soft-red-200 bg-core-danger-soft-red-50 p-2"><AlertTriangle size={14} color={coreColor('#B91C1C', 'danger')}/><Text className="flex-1 font-poppins-bold text-[11px] text-core-danger-red-700">{overLimitTeams} team(s) exceed the limit of {card.item.max_participants_per_team}. Existing assignments can be deselected in View participants.</Text></View>}
          <Text className="mb-3 font-poppins text-[11px] text-ui-text-muted">{card.item.item_code} · {card.kind === 'general_team' ? `${card.assigned_count} team entries` : `${card.assigned_count} assigned`}</Text>
          <View className="flex-row gap-2"><TouchableOpacity disabled={saving} onPress={() => openCard(card, 'details')} className="flex-1 items-center rounded-md border border-ui-border px-2 py-2"><Text className="font-poppins-bold text-[11px] text-ui-text">View participants</Text></TouchableOpacity><TouchableOpacity onPress={() => setItemToDeactivate(card.item)} accessibilityRole="button" accessibilityLabel={`Deactivate ${card.item.item_name_en || card.item.item_code}`} className="flex-row items-center justify-center gap-1 rounded-md border border-core-danger-soft-red-200 bg-core-danger-soft-red-50 px-2 py-2"><Trash2 size={13} color={coreColor("#B91C1C", 'danger')}/><Text className="font-poppins-bold text-[11px] text-core-danger-red-700">Delete</Text></TouchableOpacity></View>
          <TouchableOpacity disabled={saving} onPress={() => openCard(card, 'assign')} className="mt-2 items-center rounded-md bg-core-primary-emerald-800 px-2 py-2.5"><Text className="font-poppins-bold text-[11px] text-core-on-primary-white">Assign participants</Text></TouchableOpacity>
        </View>;
      })}</View>}
      <View className="mt-4 flex-row flex-wrap items-center justify-between gap-2">
        <SsfButton label="Previous" size="sm" variant="outline" disabled={page <= 1 || pageQuery.isFetching || programSearch.trim() !== debouncedSearch} onPress={() => setPage(value => value - 1)} />
        <Text className="font-poppins text-xs text-ui-text-muted">Page {page} / {Math.max(1, Math.ceil((pageQuery.data?.total ?? 0) / 20))} · {pageQuery.data?.total ?? 0} programs</Text>
        <SsfButton label="Next" size="sm" variant="outline" disabled={page * 20 >= (pageQuery.data?.total ?? 0) || pageQuery.isFetching || programSearch.trim() !== debouncedSearch} onPress={() => setPage(value => value + 1)} />
      </View>
    </ScrollView>

    <Modal visible={!!filterPicker} transparent animationType="fade" onRequestClose={() => setFilterPicker(null)}>
      <View className="flex-1 bg-core-surface-strong-black/40" style={{ justifyContent: isPhone ? 'flex-end' : 'center', padding: isPhone ? 0 : 16 }}><View className="max-h-[75%] bg-core-surface-white p-4" style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: isPhone ? 0 : 16, borderBottomRightRadius: isPhone ? 0 : 16, paddingBottom: isPhone ? 24 : 16 }}><View className="mb-3 flex-row items-center justify-between"><Text className="font-poppins-bold text-base text-ui-text">Filter programs</Text><TouchableOpacity onPress={() => setFilterPicker(null)} accessibilityLabel="Close filter" className="min-h-11 min-w-11 items-center justify-center"><X size={19} color={coreColor("#475569", 'text')}/></TouchableOpacity></View><ScrollView>{pickerOptions.map(option => <TouchableOpacity key={option} onPress={() => setPickerValue(option)} className="min-h-11 justify-center border-b border-ui-border"><Text className={`font-poppins text-sm ${pickerValue === option ? 'font-poppins-bold text-core-success-emerald-800' : 'text-ui-text'}`}>{option}</Text></TouchableOpacity>)}</ScrollView></View></View>
    </Modal>

    <Modal visible={!!itemToDeactivate} transparent animationType="fade" onRequestClose={() => !deactivating && setItemToDeactivate(null)}>
      <View className="flex-1 justify-center bg-core-surface-strong-black/40 p-4"><View className="rounded-xl bg-core-surface-white p-5">
        <Text className="font-poppins-bold text-base text-ui-text">Deactivate program?</Text>
        <Text className="mt-2 font-poppins text-sm text-ui-text-muted">“{itemToDeactivate?.item_name_en || itemToDeactivate?.item_code}” will be removed from the active program list. Its item record and existing history will not be deleted.</Text>
        {!!notice && <Text className="mt-2 font-poppins text-xs text-core-danger-red-700">{notice}</Text>}
        <View className="mt-4 flex-row justify-end gap-2"><TouchableOpacity disabled={deactivating} onPress={() => { setItemToDeactivate(null); setNotice(''); }} className="rounded-lg border border-ui-border px-3 py-2"><Text className="font-poppins-bold text-xs text-ui-text">Cancel</Text></TouchableOpacity><TouchableOpacity disabled={deactivating} onPress={deactivateItem} className={`flex-row items-center gap-1 rounded-lg px-3 py-2 ${deactivating ? 'bg-core-danger-soft-red-300' : 'bg-core-danger-action-red-700'}`}><Trash2 size={13} color={coreColor("white", 'onPrimary')}/><Text className="font-poppins-bold text-xs text-core-on-primary-white">{deactivating ? 'Deactivating…' : 'Deactivate'}</Text></TouchableOpacity></View>
      </View></View>
    </Modal>

    <Modal visible={!!activeCard} transparent animationType="fade" onRequestClose={() => !saving && setActiveCard(null)}>
      <View className="flex-1 items-center justify-center bg-core-surface-strong-black/40 p-3">
        <Pressable className="absolute inset-0" onPress={() => !saving && setActiveCard(null)} accessibilityRole="button" accessibilityLabel="Close participant picker" />
        <View style={{ width: Math.max(0, Math.min(width - 24, 900)), height: Math.max(0, Math.min(height - 24, 820)) }} className="rounded-2xl bg-core-surface-white p-4">
          <View className="mb-3 flex-row items-start"><View className="flex-1"><Text className="font-poppins-black text-lg text-ui-text">{activeCard?.item.item_name_en || activeCard?.item.item_code}</Text><Text className="font-poppins text-xs text-ui-text-muted">{activeCard?.category} · {activeCard?.kind === 'general_team' ? 'Group entry' : 'Individual participant'} · {cardModalMode === 'details' ? 'Assigned participants' : 'Assign participants'}</Text></View><TouchableOpacity onPress={() => !saving && setActiveCard(null)} accessibilityLabel="Close"><X size={20} color={coreColor("#475569", 'text')} /></TouchableOpacity></View>
          {detailQuery.isFetching || (activeCard?.kind === 'general_team' && cardModalMode === 'details' && entries.isFetching) ? <ActivityIndicator size="small" /> : (shouldLoadProgramDetail && detailQuery.error) || (activeCard?.kind === 'general_team' && cardModalMode === 'details' && entries.error) ? <SsfButton label="Retry program details" variant="outline" size="sm" onPress={() => { if (shouldLoadProgramDetail) void detailQuery.refetch(); if (entryItemId) void entries.refetch(); }} /> : cardModalMode === 'details' && activeCard?.kind === 'general_team' ? <>
            <Text className="mb-2 font-poppins text-xs text-ui-text-muted">Showing existing team entries and their assigned members only.</Text>
            <ScrollView className="min-h-0 flex-1" style={{ flex: 1, minHeight: 80 }} keyboardShouldPersistTaps="handled">
              {currentRegistrations.filter(entry => entry.item?.id === activeCard.item.id).length ? currentRegistrations.filter(entry => entry.item?.id === activeCard.item.id).map(entry => <View key={entry.id} className="mb-2 rounded-lg border border-ui-border bg-core-surface-white p-3">
                <Text className="font-poppins-bold text-sm text-ui-text">{entry.leader?.name || 'Group'} · Leader chest {entry.entry_chest_number || '—'} · {entry.organisation?.name || 'Organisation unavailable'}</Text>
                {entry.members.map(member => <Text key={member.participant_id} className="mt-1 font-poppins text-xs text-ui-text-muted">{member.participant?.name || 'Participant'}{member.participant?.chest_number ? ` · ${member.participant.chest_number}` : ''}</Text>)}
                <View className="mt-3 flex-row flex-wrap gap-2">
                  <TouchableOpacity onPress={() => { setActiveCard(null); setEditingEntry(entry); }} accessibilityRole="button" accessibilityLabel={`Edit members of group ${entry.entry_chest_number}`} className="min-h-11 justify-center rounded-lg border border-ui-border px-3"><Text className="font-poppins-bold text-xs text-ui-text">Edit members</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => { setActiveCard(null); setDeletingEntry(entry); }} accessibilityRole="button" accessibilityLabel={`Delete group entry ${entry.entry_chest_number}`} className="min-h-11 flex-row items-center gap-1 rounded-lg border border-core-danger-soft-red-200 px-3"><Trash2 size={13} color={coreColor("#B91C1C", 'danger')}/><Text className="font-poppins-bold text-xs text-core-danger-red-700">Delete entry</Text></TouchableOpacity>
                </View>
              </View>) : <Text className="py-4 font-poppins text-sm text-ui-text-muted">No team entries have been assigned to this program.</Text>}
            </ScrollView>
          </> : <>
          {activeCard?.kind === 'general_team' && <Text className="mb-2 font-poppins text-xs text-ui-text-muted">Choose {requiredMin}{requiredMax > requiredMin ? `–${requiredMax}` : ''} eligible members from one team. The first selected member becomes the leader.</Text>}
          {activeCard?.kind === 'general_team' && selectedIds.length > 0 && <Text className="mb-2 font-poppins-bold text-xs text-core-success-emerald-800">Leader: {participantById.get(selectedIds[0])?.name || 'Participant'} · {participantById.get(selectedIds[0])?.chest_number || 'No chest number'}</Text>}
          {activeCard?.kind === 'participant' && <Text className="mb-2 font-poppins text-xs text-ui-text-muted">{cardModalMode === 'details' ? `Showing only participants assigned to this ${activeCard.category} program.` : `Showing only ${activeCard.category} participants. Existing assignments appear first.`}</Text>}
          {activeCard?.kind === 'participant' && activeParticipantLimit != null && <View className={`mb-2 rounded-lg border p-2 ${overLimitTeamCount ? 'border-core-danger-soft-red-200 bg-core-danger-soft-red-50' : 'border-ui-border bg-core-surface-muted-slate-100'}`}><Text className={`font-poppins-bold text-xs ${overLimitTeamCount ? 'text-core-danger-red-700' : 'text-ui-text'}`}>{overLimitTeamCount ? `${overLimitTeamCount} team(s) exceed the limit of ${activeParticipantLimit}. Existing assignments can be deselected here.` : `Maximum ${activeParticipantLimit} participant(s) per team.`}</Text></View>}
          <View className="mb-2 h-10 flex-row items-center rounded-lg border border-ui-border px-3"><Search size={15} color={coreColor("#64748B", 'textMuted')}/><TextInput value={search} onChangeText={setSearch} placeholder="Search name, chest number or organisation" className="ml-2 flex-1 font-poppins text-sm outline-none" /></View>
          {activeCard?.kind === 'general_team' && <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2 max-h-10 flex-none"><View className="flex-row items-center gap-2"><TouchableOpacity onPress={() => setParticipantCategoryFilter('All categories')} className={`rounded-full border px-3 py-2 ${participantCategoryFilter === 'All categories' ? 'border-core-primary-emerald-700 bg-core-primary-emerald-700' : 'border-ui-border bg-core-surface-white'}`}><Text className={`font-poppins-bold text-xs ${participantCategoryFilter === 'All categories' ? 'text-core-on-primary-white' : 'text-ui-text'}`}>All categories</Text></TouchableOpacity>{participantCategoryOptions.map(category => <TouchableOpacity key={category} onPress={() => setParticipantCategoryFilter(category)} className={`rounded-full border px-3 py-2 ${participantCategoryFilter === category ? 'border-core-primary-emerald-700 bg-core-primary-emerald-700' : 'border-ui-border bg-core-surface-white'}`}><Text className={`font-poppins-bold text-xs ${participantCategoryFilter === category ? 'text-core-on-primary-white' : 'text-ui-text'}`}>{category}</Text></TouchableOpacity>)}</View></ScrollView>}
          <Text className="mb-2 font-poppins text-xs text-ui-text-muted">{visibleParticipants.length} participants{cardModalMode === 'assign' ? ` · ${selectedIds.length} selected` : ''}</Text>
          {cardModalMode === 'assign' && activeCard?.kind === 'participant' && <View className="mb-1 flex-row gap-3"><TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: activeParticipantLimit != null || saving }} disabled={activeParticipantLimit != null || saving} onPress={selectAllEligibleWithoutLimit} className={`min-h-10 justify-center ${activeParticipantLimit != null ? 'opacity-40' : ''}`}><Text className="font-poppins-bold text-xs text-core-success-emerald-800">Select all eligible</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => setSelectedIds([])} className="min-h-10 justify-center"><Text className="font-poppins-bold text-xs text-ui-text-muted">Clear selection</Text></TouchableOpacity></View>}
          <ScrollView className="min-h-0 flex-1" style={{ flex: 1, minHeight: 80 }} keyboardShouldPersistTaps="handled">
            {visibleParticipants.length ? visibleParticipants.map(person => {
              const chosen = selectedIds.includes(person.id);
              const alreadyAssigned = activeCard?.kind === 'participant' && activeAssignedIds.has(person.id);
              const selectable = cardModalMode === 'details' ? alreadyAssigned : !alreadyAssigned;
              return <TouchableOpacity key={person.id} disabled={!selectable} onPress={() => activeCard?.kind === 'participant' && cardModalMode === 'assign' ? toggleSelectedParticipant(person) : setSelectedIds(ids => chosen ? ids.filter(id => id !== person.id) : [...ids, person.id])} className={`mb-1 flex-row items-center rounded-lg border px-3 py-2 ${alreadyAssigned ? 'border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50' : chosen ? 'border-core-primary-emerald-500 bg-core-success-soft-emerald-50' : 'border-ui-border bg-core-surface-white'}`}><View className={`mr-3 h-5 w-5 items-center justify-center rounded border ${chosen ? 'border-core-success-emerald-600 bg-core-success-action-emerald-600' : alreadyAssigned ? 'border-core-success-emerald-500 bg-core-surface-white' : 'border-core-border-slate-300'}`}>{chosen && <Check size={13} color={coreColor("white", 'onPrimary')}/>}{alreadyAssigned && !chosen && <Check size={13} color={coreColor("#047857", 'success')}/>}</View><View className="flex-1"><Text className="font-poppins-bold text-sm text-ui-text">{person.name}</Text><Text className="font-poppins text-xs text-ui-text-muted">{person.chest_number || 'No chest number'} · {person.organisations?.name || 'Organisation unavailable'}{activeCard?.kind === 'general_team' ? ` · ${person.category_code || 'No category'}` : ''}</Text></View>{alreadyAssigned && cardModalMode === 'assign' && <Text className="ml-2 font-poppins-bold text-[10px] text-core-success-emerald-800">Already assigned</Text>}</TouchableOpacity>;
            }) : <Text className="py-4 font-poppins text-sm text-ui-text-muted">No eligible participants in this category.</Text>}
          </ScrollView>
          </>}
          {!!error && <Text className="my-2 font-poppins text-xs text-core-danger-red-700">{error}</Text>}{!!notice && <Text className="my-2 font-poppins text-xs text-core-success-emerald-700">{notice}</Text>}
          {cardModalMode === 'details' && activeCard?.kind === 'participant' && <View className="mt-3 rounded-lg border border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50 p-3">
            {confirmDeselect ? <>
              <Text className="font-poppins text-xs text-core-warning-amber-900">Remove the selected assignment(s) from this program? Participant records are kept. If check-in, code letters, marks, or results exist, the server will block removal and preserve the history.</Text>
              <View className="mt-2 flex-row gap-2"><SsfButton label="Keep assignments" variant="outline" size="sm" onPress={() => setConfirmDeselect(false)} disabled={saving}/><SsfButton label={saving ? 'Deselecting…' : 'Confirm deselect'} size="sm" onPress={deselectSelected} disabled={saving || !selectedIds.length} className="bg-core-danger-action-red-700"/></View>
            </> : <SsfButton label={`Deselect selected (${selectedIds.length})`} variant="outline" size="sm" onPress={() => setConfirmDeselect(true)} disabled={saving || !selectedIds.length} className="border-core-warning-soft-amber-300 bg-core-surface-white"/>}
          </View>}
          {cardModalMode === 'assign' && <>
            {activeCard?.kind === 'general_team' && selectedIds.length > 0 && generalSelectionError && <Text className="mt-2 font-poppins text-xs text-core-warning-amber-700">{generalSelectionError}</Text>}
          <View className="mt-3 flex-row flex-wrap gap-2"><SsfButton label={saving ? 'Adding…' : activeCard?.kind === 'general_team' ? 'Create team entry' : `Add selected (${selectedIds.length})`} onPress={addSelected} disabled={saving || registrationsUnavailable || !!participantsError || !!itemsError || !selectedIds.length || hasSelectionOverLimit || (activeCard?.kind === 'general_team' && (orgIds.size !== 1 || !generalSizeValid))}/><SsfButton label={saving ? 'Saving…' : cardComplete(activeCard?.item.id || '', activeCard?.category || '', activeCard?.kind || '') ? 'Reopen program' : 'Mark fully complete'} onPress={() => setComplete(!cardComplete(activeCard?.item.id || '', activeCard?.category || '', activeCard?.kind || ''))} disabled={saving || !!itemsError || !!statuses.error}/></View>
          </>}
        </View>
      </View>
    </Modal>
    {deletingEntry && festival && <GroupEntryDeleteDialog key={deletingEntry.id} entry={deletingEntry} festivalId={festival.id}
      onClose={() => setDeletingEntry(null)} onDeleted={() => { setDeletingEntry(null); setNotice('Group entry deleted. Students and team were kept.'); void invalidateProgramReads(); }} />}
    {editingEntry && (!detailQuery.isSuccess || detailQuery.isFetching) && <Modal visible transparent animationType="fade" onRequestClose={() => setEditingEntry(null)}><View className="flex-1 items-center justify-center bg-core-surface-strong-black/40 p-4"><View className="rounded-xl bg-core-surface-white p-4"><Text className="font-poppins text-sm text-ui-text">{detailQuery.error ? 'Could not load group participants.' : 'Loading group participants…'}</Text>{detailQuery.error ? <SsfButton label="Retry" onPress={() => { void detailQuery.refetch(); }} /> : <ActivityIndicator size="small" />}<SsfButton label="Close" variant="outline" onPress={() => setEditingEntry(null)} /></View></View></Modal>}
    {editingEntry && festival && detailQuery.isSuccess && !detailQuery.isFetching && <GroupRosterEditor key={editingEntry.id} entry={editingEntry} festivalId={festival.id}
      participants={participants as any[]} visibleOrganisationIds={visibleOrganisationIds}
      onClose={() => setEditingEntry(null)} onSaved={message => { setEditingEntry(null); setNotice(message); void invalidateProgramReads(); }} />}
    {showTeamProgress && festival && <TeamProgramProgressModal festivalId={festival.id} onClose={() => setShowTeamProgress(false)} />}
  </View>;
}
