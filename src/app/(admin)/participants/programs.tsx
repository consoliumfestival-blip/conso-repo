import { coreColor } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Plus, Search, Trash2, X } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { GroupRosterEditor } from '../../../components/participants/GroupRosterEditor';
import { GroupEntryDeleteDialog } from '../../../components/participants/GroupEntryDeleteDialog';
import { TeamProgramProgressModal } from '../../../components/participants/TeamProgramProgressModal';
import { useFestival } from '../../../core/hooks/useFestival';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../core/config/supabase';
import { formatGeneralEntryError, GeneralTeamEntry, generalEntryService, getGeneralTeamSelectionError } from '../../../services/generalEntryService';
import { invalidateGeneralMembership } from '../../../core/utils/invalidateGeneralMembership';
import { isGroupCompetition, matchesCompetitionCategory, programIntakeComplete } from '../../../core/utils/groupParticipation';
import { isGeneralCategoryCode } from '../../../core/utils/generalCategory';

type ProgramItem = { id: string; item_code: string; item_name_en?: string; item_name_ml?: string; category_codes?: string[] | string | null; participation_type?: string; item_type?: string | null; gender?: string | null; is_active?: boolean; group_min_members?: number | null; group_max_members?: number | null };
type IntakeStatus = { item_id: string; category_code: string; entry_kind: 'participant' | 'general_team'; is_complete: boolean };
const generalCodes = new Set(['GN', 'GENERAL']);

function normalizedCategory(code: string) {
  const normalized = code.trim().toUpperCase();
  return isGeneralCategoryCode(normalized) ? 'GENERAL' : normalized;
}

function codesFor(item: ProgramItem) {
  return (Array.isArray(item.category_codes) ? item.category_codes : item.category_codes ? [item.category_codes] : [])
    .map(code => String(code).trim().toUpperCase()).filter(Boolean);
}

export default function ProgramsScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const openedEditRef = useRef<string | null>(null);
  const { width, height } = useWindowDimensions();
  const queryClient = useQueryClient();
  const { role, is_superadmin, tenant_id } = useAuthStore();
  const { useActiveFestival, useItems, useApplyItemChanges } = useFestival();
  const { data: festival, isLoading: festivalLoading } = useActiveFestival();
  const visibilityTenantId = tenant_id ?? festival?.tenant_id ?? null;
  const visibleOrganisations = useQuery({
    queryKey: ['program-visible-organisations', visibilityTenantId],
    enabled: !!visibilityTenantId,
    queryFn: async () => {
      const { data, error: visibilityError } = await supabase.rpc('get_visible_organisations', {
        p_tenant_id: visibilityTenantId!,
      });
      if (visibilityError) throw new Error(visibilityError.message);
      return (data ?? []) as { id: string; tenant_id: string }[];
    },
  });
  const visibleOrganisationIds = useMemo(
    () => new Set((visibleOrganisations.data ?? []).map(organisation => organisation.id)),
    [visibleOrganisations.data],
  );
  const { data: items = [], isLoading: itemsLoading } = useItems(festival?.id);
  const applyItemChanges = useApplyItemChanges(festival?.id);
  const { participants, isLoadingList: participantsLoading, registerParticipant, deleteRegistration, useFestivalRegistrations } = useParticipants();
  const { data: festivalRegistrations = [], isLoading: registrationsLoading, error: registrationsError, refetch: retryRegistrations } = useFestivalRegistrations(festival?.id);
  const registrationsUnavailable = registrationsLoading || !!registrationsError;
  const [section, setSection] = useState<'individual' | 'group'>(typeof edit === 'string' ? 'group' : 'individual');
  const [editingEntry, setEditingEntry] = useState<GeneralTeamEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<GeneralTeamEntry | null>(null);
  const [activeCard, setActiveCard] = useState<{ item: ProgramItem; category: string; kind: 'participant' | 'general_team' } | null>(null);
  const [cardModalMode, setCardModalMode] = useState<'details' | 'assign'>('assign');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [participantCategoryFilter, setParticipantCategoryFilter] = useState('All categories');
  const [typeFilter, setTypeFilter] = useState('All types');
  const [stageFilter, setStageFilter] = useState('All stages');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [filterPicker, setFilterPicker] = useState<'type' | 'stage' | 'category' | null>(null);
  const [itemToDeactivate, setItemToDeactivate] = useState<ProgramItem | null>(null);
  const [showTeamProgress, setShowTeamProgress] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeselect, setConfirmDeselect] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { if (typeof edit === 'string') setSection('group'); }, [edit]);

  const statuses = useQuery({
    queryKey: ['program-intake-statuses', festival?.id],
    enabled: !!festival?.id,
    queryFn: async () => {
      const { data, error: queryError } = await supabase.from('program_intake_statuses')
        .select('item_id, category_code, entry_kind, is_complete').eq('festival_id', festival!.id);
      if (queryError) throw new Error(queryError.message);
      return (data ?? []) as IntakeStatus[];
    },
  });
  const entries = useQuery({
    queryKey: ['general-team-entries', festival?.id],
    enabled: !!festival?.id && section === 'group',
    queryFn: () => generalEntryService.list(festival!.id),
  });
  useEffect(() => {
    if (typeof edit !== 'string' || openedEditRef.current === edit || !entries.data) return;
    const entry = entries.data.find(row => row.id === edit);
    if (entry) {
      openedEditRef.current = edit;
      setSection('group');
      setEditingEntry(entry);
    }
  }, [edit, entries.data]);

  const sectionCards = useMemo(() => (items as ProgramItem[]).filter(item => item.is_active === true && isGroupCompetition(item) === (section === 'group'))
    .flatMap(item => codesFor(item).filter(code => !generalCodes.has(code) || festival?.general_category_enabled === true)
      .map(category => ({ item, category, kind: (isGroupCompetition(item) ? 'general_team' : 'participant') as 'participant' | 'general_team' })))
    .sort((a, b) => (a.item.item_name_en || a.item.item_code).localeCompare(b.item.item_name_en || b.item.item_code)), [items, section, festival?.general_category_enabled]);

  const filterOptions = useMemo(() => ({
    type: ['All types', ...Array.from(new Set(sectionCards.map(card => card.item.participation_type).filter(Boolean).map(value => String(value).toLowerCase()))).sort()],
    stage: ['All stages', ...Array.from(new Set(sectionCards.map(card => card.item.item_type).filter(Boolean).map(value => String(value)))).sort()],
    category: ['All categories', ...Array.from(new Set(sectionCards.map(card => normalizedCategory(card.category)))).sort()],
  }), [sectionCards]);
  const programCards = useMemo(() => sectionCards.filter(card =>
    (!search.trim() || `${card.item.item_name_en ?? ''} ${card.item.item_name_ml ?? ''} ${card.item.item_code}`.toLowerCase().includes(search.trim().toLowerCase()))
      && (typeFilter === 'All types' || card.item.participation_type?.toLowerCase() === typeFilter)
      && (stageFilter === 'All stages' || card.item.item_type === stageFilter)
      && (categoryFilter === 'All categories' || normalizedCategory(card.category) === categoryFilter)
  ), [sectionCards, search, typeFilter, stageFilter, categoryFilter]);

  const doneCount = sectionCards.filter(card => programIntakeComplete(statuses.data ?? [], card.item.id, card.category, card.kind)).length;
  const eligibleParticipants = useMemo(() => (participants as any[]).filter(person =>
    person.festival_id === festival?.id && !!person.organisation_id && visibleOrganisationIds.has(person.organisation_id) && person.status !== 'rejected'
      && matchesCompetitionCategory(String(person.category_code || ''), activeCard?.category || '', person.is_post_hs_religious === true)
      && (!activeCard?.item.gender || activeCard.item.gender === 'both' || activeCard.item.gender === person.gender)
  ), [participants, festival?.id, visibleOrganisationIds, activeCard?.category, activeCard?.item.gender]);
  const currentRegistrations = entries.data ?? [];
  const participantById = useMemo(() => new Map((participants as any[]).map(person => [person.id, person])), [participants]);
  const activeAssignedRegistrations = useMemo(() => festivalRegistrations.filter((row: any) =>
    activeCard?.kind === 'participant' && row.item_id === activeCard.item.id && row.participant_id && row.status !== 'rejected'
      && matchesCompetitionCategory(String(participantById.get(row.participant_id)?.category_code || ''), activeCard.category)
  ), [festivalRegistrations, activeCard, participantById]);
  const activeAssignedIds = useMemo(() => new Set(activeAssignedRegistrations.map((row: any) => row.participant_id)), [activeAssignedRegistrations]);
  const activeAssignedParticipants = useMemo(() => Array.from(activeAssignedIds)
    .map(id => participantById.get(id)).filter(Boolean), [activeAssignedIds, participantById]);
  const chosenParticipants = eligibleParticipants.filter(person => selectedIds.includes(person.id));
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

  const cardComplete = (itemId: string, category: string, kind: string) => programIntakeComplete(statuses.data ?? [], itemId, category, kind);
  const setComplete = async (complete: boolean) => {
    if (!festival || !activeCard || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const { error: rpcError } = await supabase.rpc('set_program_intake_status', {
        p_festival_id: festival.id, p_item_id: activeCard.item.id, p_category_code: activeCard.category,
        p_entry_kind: activeCard.kind, p_is_complete: complete,
      });
      if (rpcError) throw new Error(rpcError.message);
      await queryClient.invalidateQueries({ queryKey: ['program-intake-statuses', festival.id] });
      setNotice(complete ? 'Program marked complete.' : 'Program reopened.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update program status.'); }
    finally { setSaving(false); }
  };

  const addSelected = async () => {
    if (!festival || !activeCard || saving || selectedIds.length === 0) return;
    if (activeCard.kind === 'participant' && registrationsUnavailable) return;
    setSaving(true); setError(''); setNotice('');
    try {
      if (activeCard.kind === 'general_team') {
        if (generalSelectionError) throw new Error(generalSelectionError);
        const created = await generalEntryService.create(festival.id, activeCard.item.id, selectedIds);
        setNotice(`Group entry created using leader chest ${created.entry_chest_number}.`);
        await invalidateGeneralMembership(queryClient, festival.id, selectedIds);
        await queryClient.invalidateQueries({ queryKey: ['scheduleRegistrations'] });
      } else {
        const failures: string[] = [];
        let added = 0;
        for (const person of eligibleParticipants.filter(candidate => selectedIds.includes(candidate.id))) {
          const result = await registerParticipant({ participant: person, item: activeCard.item, festivalConfig: festival });
          if (result.errors?.length) failures.push(`${person.name}: ${result.errors.map(entry => entry.message).join(', ')}`);
          else added += 1;
        }
        setNotice(`${added} participant(s) added.${failures.length ? ` ${failures.length} could not be added: ${failures.join('; ')}` : ''}`);
        await queryClient.invalidateQueries({ queryKey: ['festivalRegistrations', festival.id] });
        await queryClient.invalidateQueries({ queryKey: ['participantRegistrations'] });
      }
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ['program-intake-statuses', festival.id] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add selected participants.'); }
    finally { setSaving(false); }
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
    if (card.kind === 'participant' && registrationsUnavailable) return;
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
  const existingGeneralCount = (itemId: string) => currentRegistrations.filter(entry => (entry as any).item?.id === itemId).length;
  const individualAssignedCount = (itemId: string, category: string) => festivalRegistrations.filter((row: any) =>
    row.item_id === itemId && row.participant_id && row.status !== 'rejected'
      && matchesCompetitionCategory(String(participantById.get(row.participant_id)?.category_code || ''), category)
  ).length;

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
  if (festivalLoading || itemsLoading || participantsLoading || statuses.isLoading || (!!visibilityTenantId && visibleOrganisations.isLoading)) return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  if (!festival) return <View className="flex-1 p-5"><Text className="font-poppins text-ui-text">Select or activate a festival first.</Text></View>;

  const sectionLabel = section === 'individual' ? 'Individual' : 'Group items';
  const cardWidth = width >= 1100 ? '32%' : width >= 700 ? '48.5%' : '100%';
  const pickerOptions = filterPicker ? filterOptions[filterPicker] : [];
  const pickerValue = filterPicker === 'type' ? typeFilter : filterPicker === 'stage' ? stageFilter : categoryFilter;
  const setPickerValue = (value: string) => {
    if (filterPicker === 'type') setTypeFilter(value);
    if (filterPicker === 'stage') setStageFilter(value);
    if (filterPicker === 'category') setCategoryFilter(value);
    setFilterPicker(null);
  };

  return <View className="flex-1 bg-ssf-bg">
    <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 28 }}>
      <View className="mb-4 flex-row flex-wrap items-end justify-between gap-3">
        <View>
          <Text className="font-poppins-bold text-[10px] uppercase tracking-widest text-ui-text-muted">Festival · {festival.custom_name || festival.level} {festival.festival_year}</Text>
          <Text className="mt-1 font-poppins-black text-2xl text-ui-text">Programs</Text>
          <Text className="mt-1 font-poppins text-xs text-ui-text-muted">{sectionCards.length} programs · {doneCount} completed</Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          {(['individual', 'group'] as const).map(value => <TouchableOpacity key={value} onPress={() => { setSection(value); setTypeFilter('All types'); setCategoryFilter('All categories'); }} className={`rounded-lg border px-3 py-2 ${section === value ? 'border-core-primary-emerald-700 bg-core-primary-emerald-700' : 'border-ui-border bg-core-surface-white'}`}><Text className={`font-poppins-bold text-xs ${section === value ? 'text-core-on-primary-white' : 'text-ui-text'}`}>{value === 'individual' ? 'Individual' : 'Group items'}</Text></TouchableOpacity>)}
          <TouchableOpacity onPress={() => setShowTeamProgress(true)} className="min-h-10 justify-center rounded-lg border border-ui-border bg-core-surface-white px-3" accessibilityRole="button" accessibilityLabel="View team program progress"><Text className="font-poppins-bold text-xs text-ui-text">Team progress</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/settings/items' as any)} className="flex-row items-center gap-1.5 rounded-lg bg-core-primary-emerald-700 px-3 py-2" accessibilityRole="button"><Plus size={15} color={coreColor("white", 'onPrimary')}/><Text className="font-poppins-bold text-xs text-core-on-primary-white">Add program</Text></TouchableOpacity>
        </View>
      </View>
      {!!notice && <Text className="mb-3 font-poppins text-xs text-core-success-emerald-700">{notice}</Text>}
      <View className="mb-3 flex-row flex-wrap items-center gap-2 rounded-xl border border-ui-border bg-core-surface-white p-2">
        <View className="h-10 min-w-[210px] flex-1 flex-row items-center rounded-lg border border-ui-border px-3">
          <Search size={16} color={coreColor("#64748B", 'textMuted')}/><TextInput value={search} onChangeText={setSearch} placeholder="Search by program name or code..." className="ml-2 flex-1 font-poppins text-sm outline-none" />
          {!!search && <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Clear search"><X size={15} color={coreColor("#64748B", 'textMuted')}/></TouchableOpacity>}
        </View>
        {([['type', typeFilter], ['stage', stageFilter], ['category', categoryFilter]] as const).map(([key, value]) => <TouchableOpacity key={key} onPress={() => setFilterPicker(key)} className="h-10 min-w-[112px] flex-row items-center justify-between gap-2 rounded-lg border border-ui-border bg-core-surface-white px-3" accessibilityRole="button"><Text className="font-poppins text-xs text-ui-text" numberOfLines={1}>{key === 'category' && value === 'GENERAL' ? 'General' : value}</Text><ChevronDown size={14} color={coreColor("#64748B", 'textMuted')}/></TouchableOpacity>)}
      </View>
      <SsfCard><View className="flex-row items-center justify-between"><Text className="font-poppins-bold text-sm text-ui-text">{doneCount} of {sectionCards.length} {sectionLabel.toLowerCase()} programs complete</Text><Text className="font-poppins-bold text-xs text-core-success-emerald-700">{sectionCards.length ? Math.round(doneCount / sectionCards.length * 100) : 0}%</Text></View><View className="mt-2 h-1.5 overflow-hidden rounded-full bg-core-surface-muted-slate-100"><View className="h-full rounded-full bg-core-success-action-emerald-600" style={{ width: `${sectionCards.length ? doneCount / sectionCards.length * 100 : 0}%` }} /></View></SsfCard>
      {statuses.error && <SsfCard><Text className="font-poppins text-sm text-core-danger-red-700">{statuses.error.message}</Text></SsfCard>}
      {registrationsError && section === 'individual' && <SsfCard><Text className="font-poppins text-sm text-core-danger-red-700">Could not load all participant assignments.</Text><SsfButton label="Retry assignments" variant="outline" size="sm" onPress={() => { void retryRegistrations(); }} /></SsfCard>}
      {section === 'group' && entries.error && <SsfCard><Text className="font-poppins text-sm text-core-danger-red-700">{formatGeneralEntryError(entries.error, 'load')}</Text></SsfCard>}
      {visibleOrganisations.error && <SsfCard><Text className="font-poppins text-sm text-core-danger-red-700">Could not load the organisations available to this account: {visibleOrganisations.error.message}</Text></SsfCard>}
      {!visibilityTenantId && <SsfCard><Text className="font-poppins text-sm text-core-danger-red-700">Could not determine the organisation scope for participant assignment.</Text></SsfCard>}
      {section === 'group' && <Text className="mb-2 mt-4 font-poppins text-xs text-ui-text-muted">Create one entry per team. Use the selected leader chest number to identify the group.</Text>}
      {programCards.length === 0 ? <SsfCard className="mt-3"><Text className="font-poppins text-sm text-ui-text-muted">No {search || typeFilter !== 'All types' || stageFilter !== 'All stages' || categoryFilter !== 'All categories' ? 'matching' : 'active'} {section === 'individual' ? 'individual' : 'group'} programs found.</Text></SsfCard> : <View className="mt-3 flex-row flex-wrap justify-between gap-y-3">{programCards.map(card => {
        const complete = cardComplete(card.item.id, card.category, card.kind);
        return <View key={`${card.item.id}:${card.category}`} style={{ width: cardWidth }} className="rounded-xl border border-ui-border bg-core-surface-white p-3 shadow-sm">
          <View className="min-h-[76px] flex-row items-start justify-between gap-2"><View className="flex-1"><Text className="font-poppins-bold text-sm text-ui-text" numberOfLines={2}>{card.item.item_name_en || card.item.item_name_ml || card.item.item_code}</Text><Text className="mt-1 font-poppins text-[11px] text-ui-text-muted">{card.category}</Text></View><View className={`rounded-full px-2 py-1 ${complete ? 'bg-core-success-soft-emerald-100' : 'bg-core-surface-muted-slate-100'}`}><Text className={`font-poppins-bold text-[10px] ${complete ? 'text-core-success-emerald-800' : 'text-core-text-slate-600'}`}>{complete ? 'Complete' : 'Open'}</Text></View></View>
          <View className="mb-3 flex-row flex-wrap gap-1.5"><View className="rounded-md bg-core-surface-muted-slate-100 px-2 py-1"><Text className="font-poppins-bold text-[10px] text-core-text-slate-700">{card.item.participation_type === 'individual' ? 'Individual' : 'Group'}</Text></View>{!!card.item.item_type && <View className="rounded-md bg-core-surface-muted-slate-100 px-2 py-1"><Text className="font-poppins-bold text-[10px] text-core-text-slate-700">{card.item.item_type}</Text></View>}</View>
          <Text className="mb-3 font-poppins text-[11px] text-ui-text-muted">{card.item.item_code} · {card.kind === 'general_team' ? `${existingGeneralCount(card.item.id)} team entries` : registrationsUnavailable ? 'Assignments unavailable' : `${individualAssignedCount(card.item.id, card.category)} assigned`}</Text>
          <View className="flex-row gap-2"><TouchableOpacity disabled={card.kind === 'participant' && registrationsUnavailable} onPress={() => openCard(card, 'details')} className="flex-1 items-center rounded-md border border-ui-border px-2 py-2"><Text className="font-poppins-bold text-[11px] text-ui-text">View participants</Text></TouchableOpacity><TouchableOpacity onPress={() => setItemToDeactivate(card.item)} accessibilityRole="button" accessibilityLabel={`Deactivate ${card.item.item_name_en || card.item.item_code}`} className="flex-row items-center justify-center gap-1 rounded-md border border-core-danger-soft-red-200 bg-core-danger-soft-red-50 px-2 py-2"><Trash2 size={13} color={coreColor("#B91C1C", 'danger')}/><Text className="font-poppins-bold text-[11px] text-core-danger-red-700">Delete</Text></TouchableOpacity></View>
          <TouchableOpacity disabled={card.kind === 'participant' && registrationsUnavailable} onPress={() => openCard(card, 'assign')} className="mt-2 items-center rounded-md bg-core-primary-emerald-800 px-2 py-2.5"><Text className="font-poppins-bold text-[11px] text-core-on-primary-white">Assign participants</Text></TouchableOpacity>
        </View>;
      })}</View>}
    </ScrollView>

    <Modal visible={!!filterPicker} transparent animationType="fade" onRequestClose={() => setFilterPicker(null)}>
      <View className="flex-1 justify-center bg-core-surface-strong-black/40 p-4"><View className="max-h-[75%] rounded-xl bg-core-surface-white p-4"><View className="mb-3 flex-row items-center justify-between"><Text className="font-poppins-bold text-base text-ui-text">Filter programs</Text><TouchableOpacity onPress={() => setFilterPicker(null)} accessibilityLabel="Close filter"><X size={19} color={coreColor("#475569", 'text')}/></TouchableOpacity></View><ScrollView>{pickerOptions.map(option => <TouchableOpacity key={option} onPress={() => setPickerValue(option)} className="border-b border-ui-border py-3"><Text className={`font-poppins text-sm ${pickerValue === option ? 'font-poppins-bold text-core-success-emerald-800' : 'text-ui-text'}`}>{option}</Text></TouchableOpacity>)}</ScrollView></View></View>
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
          {cardModalMode === 'details' && activeCard?.kind === 'general_team' ? <>
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
          <View className="mb-2 h-10 flex-row items-center rounded-lg border border-ui-border px-3"><Search size={15} color={coreColor("#64748B", 'textMuted')}/><TextInput value={search} onChangeText={setSearch} placeholder="Search name, chest number or organisation" className="ml-2 flex-1 font-poppins text-sm outline-none" /></View>
          {activeCard?.kind === 'general_team' && <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2 max-h-10 flex-none"><View className="flex-row items-center gap-2"><TouchableOpacity onPress={() => setParticipantCategoryFilter('All categories')} className={`rounded-full border px-3 py-2 ${participantCategoryFilter === 'All categories' ? 'border-core-primary-emerald-700 bg-core-primary-emerald-700' : 'border-ui-border bg-core-surface-white'}`}><Text className={`font-poppins-bold text-xs ${participantCategoryFilter === 'All categories' ? 'text-core-on-primary-white' : 'text-ui-text'}`}>All categories</Text></TouchableOpacity>{participantCategoryOptions.map(category => <TouchableOpacity key={category} onPress={() => setParticipantCategoryFilter(category)} className={`rounded-full border px-3 py-2 ${participantCategoryFilter === category ? 'border-core-primary-emerald-700 bg-core-primary-emerald-700' : 'border-ui-border bg-core-surface-white'}`}><Text className={`font-poppins-bold text-xs ${participantCategoryFilter === category ? 'text-core-on-primary-white' : 'text-ui-text'}`}>{category}</Text></TouchableOpacity>)}</View></ScrollView>}
          <Text className="mb-2 font-poppins text-xs text-ui-text-muted">{visibleParticipants.length} participants{cardModalMode === 'assign' ? ` · ${selectedIds.length} selected` : ''}</Text>
          <ScrollView className="min-h-0 flex-1" style={{ flex: 1, minHeight: 80 }} keyboardShouldPersistTaps="handled">
            {visibleParticipants.length ? visibleParticipants.map(person => {
              const chosen = selectedIds.includes(person.id);
              const alreadyAssigned = activeCard?.kind === 'participant' && activeAssignedIds.has(person.id);
              const selectable = cardModalMode === 'details' ? alreadyAssigned : !alreadyAssigned;
              return <TouchableOpacity key={person.id} disabled={!selectable} onPress={() => setSelectedIds(ids => chosen ? ids.filter(id => id !== person.id) : [...ids, person.id])} className={`mb-1 flex-row items-center rounded-lg border px-3 py-2 ${alreadyAssigned ? 'border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50' : chosen ? 'border-core-primary-emerald-500 bg-core-success-soft-emerald-50' : 'border-ui-border bg-core-surface-white'}`}><View className={`mr-3 h-5 w-5 items-center justify-center rounded border ${chosen ? 'border-core-success-emerald-600 bg-core-success-action-emerald-600' : alreadyAssigned ? 'border-core-success-emerald-500 bg-core-surface-white' : 'border-core-border-slate-300'}`}>{chosen && <Check size={13} color={coreColor("white", 'onPrimary')}/>}{alreadyAssigned && !chosen && <Check size={13} color={coreColor("#047857", 'success')}/>}</View><View className="flex-1"><Text className="font-poppins-bold text-sm text-ui-text">{person.name}</Text><Text className="font-poppins text-xs text-ui-text-muted">{person.chest_number || 'No chest number'} · {person.organisations?.name || 'Organisation unavailable'}{activeCard?.kind === 'general_team' ? ` · ${person.category_code || 'No category'}` : ''}</Text></View>{alreadyAssigned && cardModalMode === 'assign' && <Text className="ml-2 font-poppins-bold text-[10px] text-core-success-emerald-800">Already assigned</Text>}</TouchableOpacity>;
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
            <View className="mt-3 flex-row flex-wrap gap-2"><SsfButton label={saving ? 'Adding…' : activeCard?.kind === 'general_team' ? 'Create team entry' : `Add selected (${selectedIds.length})`} onPress={addSelected} disabled={saving || !selectedIds.length || (activeCard?.kind === 'general_team' && (orgIds.size !== 1 || !generalSizeValid))}/><SsfButton label={saving ? 'Saving…' : cardComplete(activeCard?.item.id || '', activeCard?.category || '', activeCard?.kind || '') ? 'Reopen program' : 'Mark fully complete'} onPress={() => setComplete(!cardComplete(activeCard?.item.id || '', activeCard?.category || '', activeCard?.kind || ''))} disabled={saving}/></View>
          </>}
        </View>
      </View>
    </Modal>
    {deletingEntry && festival && <GroupEntryDeleteDialog key={deletingEntry.id} entry={deletingEntry} festivalId={festival.id}
      onClose={() => setDeletingEntry(null)} onDeleted={() => { setDeletingEntry(null); setNotice('Group entry deleted. Students and team were kept.'); }} />}
    {editingEntry && festival && <GroupRosterEditor key={editingEntry.id} entry={editingEntry} festivalId={festival.id}
      participants={participants as any[]} visibleOrganisationIds={visibleOrganisationIds}
      onClose={() => setEditingEntry(null)} onSaved={message => { setEditingEntry(null); setNotice(message); }} />}
    {showTeamProgress && festival && <TeamProgramProgressModal festivalId={festival.id} onClose={() => setShowTeamProgress(false)} />}
  </View>;
}
