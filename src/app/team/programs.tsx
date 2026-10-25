import React, { useEffect, useMemo, useState } from 'react';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamText as Text } from '@/components/team/TeamText';
import { ActivityIndicator, Modal, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownAZ, ArrowDownZA, Check, CheckCircle2, ChevronDown, Eye, ListOrdered, Search, X } from 'lucide-react-native';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderGroupRosterMember, TeamLeaderParticipant, TeamLeaderProgramOption, teamLeaderPortalService } from '@/services/teamLeaderPortalService';
import { festivalCategoryService } from '@/services/festivalCategoryService';
import { invalidateGeneralMembership } from '@/core/utils/invalidateGeneralMembership';


const GENERAL_CATEGORY_CODES = new Set(['GN', 'GENERAL']);

function normalizeCategoryCode(code: string) {
  const normalized = code.trim().toUpperCase();
  return GENERAL_CATEGORY_CODES.has(normalized) ? 'GENERAL' : normalized;
}

function categoryDisplay(code: string) {
  return normalizeCategoryCode(code) === 'GENERAL' ? 'General' : code.trim();
}

function categoryLabel(codes: string[] | null) {
  if (!Array.isArray(codes) || !codes.length) return 'All categories';
  return [...new Set(codes.map(normalizeCategoryCode).filter(Boolean))]
    .sort((left, right) => left === 'GENERAL' ? -1 : right === 'GENERAL' ? 1 : left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
    .map(categoryDisplay)
    .join(', ');
}

type ProgramSort = 'default' | 'name_asc' | 'name_desc' | 'code_asc' | 'category_asc';

type PendingDeselect =
  | { kind: 'individual'; registrationId: string; participantName: string; participantIds: string[] }
  | { kind: 'group-member'; registrationId: string; participantId: string; participantName: string; participantIds: string[]; isLeader: boolean; remainingMembers: TeamLeaderGroupRosterMember[] }
  | { kind: 'group-entry'; registrationId: string; participantIds: string[] };

export default function TeamProgramsScreen() {
  const ui = useTeamUi();
  const orange = ui.colors.primary;
  const muted = ui.colors.textMuted;
  const border = ui.colors.border;
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1120;
  const isPhone = width < 600;
  const queryClient = useQueryClient();
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [participants, setParticipants] = useState<TeamLeaderParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [programSearch, setProgramSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [genderFilter, setGenderFilter] = useState('All genders');
  const [programSort, setProgramSort] = useState<ProgramSort>('default');
  const [filterPicker, setFilterPicker] = useState<'category' | 'gender' | 'sort' | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [programKind, setProgramKind] = useState<'participant' | 'general_team'>('participant');
  const [activeIndividualProgram, setActiveIndividualProgram] = useState<TeamLeaderProgramOption | null>(null);
  const [pendingCompletionProgram, setPendingCompletionProgram] = useState<TeamLeaderProgramOption | null>(null);
  const [completionError, setCompletionError] = useState('');
  const [selectedIndividualParticipantIds, setSelectedIndividualParticipantIds] = useState<string[]>([]);
  const [individualSelectionError, setIndividualSelectionError] = useState('');
  const [individualMemberSearch, setIndividualMemberSearch] = useState('');
  const [activeGeneralProgram, setActiveGeneralProgram] = useState<TeamLeaderProgramOption | null>(null);
  const [activeViewProgram, setActiveViewProgram] = useState<TeamLeaderProgramOption | null>(null);
  const [pendingDeselect, setPendingDeselect] = useState<PendingDeselect | null>(null);
  const [replacementLeaderId, setReplacementLeaderId] = useState<string | null>(null);
  const [deselectError, setDeselectError] = useState('');
  const [deselectBusy, setDeselectBusy] = useState(false);
  const [selectedGeneralParticipantIds, setSelectedGeneralParticipantIds] = useState<string[]>([]);
  const [generalSelectionError, setGeneralSelectionError] = useState('');
  const [generalMemberSearch, setGeneralMemberSearch] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (contextLoading) return;
    if (!context) {
      setParticipants([]);
      setParticipantError('Team details are unavailable. Please sign in again or contact the festival administrator.');
      setParticipantsLoading(false);
      return;
    }

    let cancelled = false;
    setParticipantsLoading(true);
    setParticipantError(null);
    teamLeaderPortalService.getParticipants()
      .then((rows) => {
        if (cancelled) return;
        setParticipants(rows.filter((person) => person.status !== 'rejected'));
      })
      .catch((error: any) => {
        if (cancelled) return;
        setParticipantError(error?.message || 'Unable to load your team participants.');
      })
      .finally(() => {
        if (!cancelled) setParticipantsLoading(false);
      });
    return () => { cancelled = true; };
  }, [context, contextLoading]);

  const programsQuery = useQuery({
    queryKey: ['team-leader-programs', context?.festival_id],
    enabled: !!context,
    queryFn: () => teamLeaderPortalService.getProgramsForTeam(),
  });
  const itemLimitStatusQuery = useQuery({
    queryKey: ['team-leader-item-limit-status', context?.festival_id, context?.organisation_id],
    enabled: !!context,
    queryFn: () => teamLeaderPortalService.getItemLimitStatus(),
  });
  const itemLimitStatusById = useMemo(
    () => new Map((itemLimitStatusQuery.data ?? []).map(status => [status.item_id, status])),
    [itemLimitStatusQuery.data],
  );
  const getItemLimitStatus = (itemId: string) => itemLimitStatusById.get(itemId);

  useEffect(() => {
    if (!activeIndividualProgram) return;
    const refreshedProgram = programsQuery.data?.find((program) => program.item_id === activeIndividualProgram.item_id);
    if (refreshedProgram && refreshedProgram !== activeIndividualProgram) {
      setActiveIndividualProgram(refreshedProgram);
    }
  }, [activeIndividualProgram?.item_id, programsQuery.data]);
  const festivalCategoriesQuery = useQuery({
    queryKey: ['team-leader-festival-categories', context?.festival_id],
    enabled: !!context?.festival_id,
    queryFn: () => festivalCategoryService.list(context!.festival_id),
    staleTime: 5 * 60 * 1000,
  });
  const groupEligibilityQuery = useQuery({
    queryKey: ['team-group-eligible-members', context?.festival_id, activeGeneralProgram?.item_id],
    enabled: !!context && !!activeGeneralProgram,
    queryFn: () => teamLeaderPortalService.getEligibleGroupMemberIds(activeGeneralProgram!.item_id),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const groupRosterQuery = useQuery({
    queryKey: ['team-program-group-roster', context?.festival_id, activeViewProgram?.item_id],
    enabled: !!context && activeViewProgram?.entry_kind === 'general_team',
    queryFn: () => teamLeaderPortalService.getProgramGroupRoster(activeViewProgram!.item_id),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const individualRosterQuery = useQuery({
    queryKey: ['team-program-individual-roster', context?.festival_id, activeViewProgram?.item_id],
    enabled: !!context && activeViewProgram?.entry_kind === 'participant',
    queryFn: () => teamLeaderPortalService.getProgramIndividualRoster(activeViewProgram!.item_id),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const categoryOrder = useMemo(() => {
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const category of festivalCategoriesQuery.data ?? []) {
      const code = normalizeCategoryCode(category.code);
      if (code && !seen.has(code)) { ordered.push(code); seen.add(code); }
    }
    for (const person of participants) {
      const code = person.category_code ? normalizeCategoryCode(person.category_code) : '';
      if (code && !seen.has(code)) { ordered.push(code); seen.add(code); }
    }
    for (const program of programsQuery.data ?? []) {
      for (const rawCode of program.category_codes ?? []) {
        const code = normalizeCategoryCode(rawCode);
        if (code && !seen.has(code)) { ordered.push(code); seen.add(code); }
      }
    }
    if (!seen.has('GENERAL')) ordered.push('GENERAL');
    return ordered;
  }, [festivalCategoriesQuery.data, participants, programsQuery.data]);
  const categoryOptions = ['All categories', ...categoryOrder];
  const categoriesByCode = new Map((festivalCategoriesQuery.data ?? []).map((category) => [normalizeCategoryCode(category.code), category]));
  const displayCategoryOption = (code: string) => code === 'All categories'
    ? code
    : normalizeCategoryCode(code) === 'GENERAL'
      ? 'General'
      : categoriesByCode.get(normalizeCategoryCode(code))?.name ?? categoryDisplay(code);

  const visiblePrograms = useMemo(() => {
    const filtered = (programsQuery.data ?? []).filter((program) =>
      program.entry_kind === programKind && (program.is_eligible || program.is_assigned),
    ).filter((program) =>
      !programSearch.trim() || `${program.item_code ?? ''} ${program.item_name_en ?? ''} ${program.item_name_ml ?? ''} ${categoryLabel(program.category_codes)}`
        .toLowerCase().includes(programSearch.trim().toLowerCase()),
    ).filter((program) => categoryFilter === 'All categories'
      || (program.category_codes ?? []).some((category) => normalizeCategoryCode(category) === categoryFilter))
      .filter((program) => genderFilter === 'All genders'
        || (genderFilter === 'Both' ? !program.gender || program.gender.toLowerCase() === 'both' : program.gender?.toLowerCase() === genderFilter.toLowerCase()));

    if (programSort === 'default') return filtered;
    const compare = (left: string, right: string) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
    const categoryRank = new Map(categoryOrder.map((code, index) => [code, index]));
    return [...filtered].sort((left, right) => {
      if (programSort === 'code_asc') return compare(left.item_code ?? '', right.item_code ?? '');
      if (programSort === 'category_asc') {
        const rank = (codes: string[] | null) => {
          const ranks = (codes ?? []).map(normalizeCategoryCode).map((code) => categoryRank.get(code)).filter((value): value is number => value !== undefined);
          return ranks.length ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER;
        };
        const byCategory = rank(left.category_codes) - rank(right.category_codes);
        if (byCategory) return byCategory;
        const leftName = left.item_name_en || left.item_name_ml || left.item_code || '';
        const rightName = right.item_name_en || right.item_name_ml || right.item_code || '';
        return compare(leftName, rightName) || compare(left.item_code ?? '', right.item_code ?? '');
      }
      const leftName = left.item_name_en || left.item_name_ml || left.item_code || '';
      const rightName = right.item_name_en || right.item_name_ml || right.item_code || '';
      const byName = compare(leftName, rightName);
      return programSort === 'name_desc' ? -byName : byName;
    });
  }, [programsQuery.data, programSearch, programKind, categoryFilter, genderFilter, programSort, categoryOrder]);

  const genderOptions = ['All genders', ...Array.from(new Set((programsQuery.data ?? [])
    .filter((program) => program.entry_kind === programKind && program.gender && program.gender.toLowerCase() !== 'both')
    .map((program) => program.gender!))).sort()];
  const sortOptions: { value: ProgramSort; label: string }[] = [
    { value: 'default', label: 'Default order' },
    { value: 'name_asc', label: 'Name A–Z' },
    { value: 'name_desc', label: 'Name Z–A' },
    { value: 'code_asc', label: 'Code A–Z' },
    { value: 'category_asc', label: 'Category order' },
  ];

  const individualEligibleIds = new Set(activeIndividualProgram?.eligible_participant_ids ?? []);
  const individualAssignedIds = new Set(activeIndividualProgram?.assigned_participant_ids ?? []);
  const individualLimitStatus = activeIndividualProgram ? getItemLimitStatus(activeIndividualProgram.item_id) : undefined;
  const individualRemaining = individualLimitStatus?.max_participants_per_team == null
    ? Number.POSITIVE_INFINITY
    : Math.max(0, individualLimitStatus.max_participants_per_team - individualLimitStatus.participant_count);
  const individualEligibleParticipants = activeIndividualProgram
    ? participants.filter((person) => individualEligibleIds.has(person.id)
      && `${person.name} ${person.chest_number ?? ''} ${person.category_code ?? ''}`
        .toLowerCase().includes(individualMemberSearch.trim().toLowerCase()))
    : [];
  const generalEligibleIds = new Set(groupEligibilityQuery.data ?? []);
  const generalEligibleParticipants = activeGeneralProgram && groupEligibilityQuery.isSuccess
    ? participants.filter((person) =>
        generalEligibleIds.has(person.id)
        && `${person.name} ${person.chest_number ?? ''} ${person.category_code ?? ''}`.toLowerCase().includes(generalMemberSearch.trim().toLowerCase()),
      )
    : [];
  const openDeselect = (entry: PendingDeselect) => {
    setPendingDeselect(entry);
    setReplacementLeaderId(null);
    setDeselectError('');
  };

  const confirmDeselect = async () => {
    if (!pendingDeselect || deselectBusy) return;
    if (pendingDeselect.kind === 'group-member' && pendingDeselect.isLeader && !replacementLeaderId) {
      setDeselectError('Choose a replacement group leader.');
      return;
    }
    setDeselectBusy(true);
    setDeselectError('');
    try {
      const result = pendingDeselect.kind === 'individual'
        ? await teamLeaderPortalService.deselectIndividualRegistration(pendingDeselect.registrationId)
        : pendingDeselect.kind === 'group-member'
          ? await teamLeaderPortalService.removeGroupMember(
            pendingDeselect.registrationId, pendingDeselect.participantId,
            pendingDeselect.participantIds, replacementLeaderId ?? undefined,
          )
          : await teamLeaderPortalService.deleteGroupEntry(pendingDeselect.registrationId, pendingDeselect.participantIds);
      if (result.status !== 'removed') {
        setDeselectError(result.message || 'This assignment could not be removed. Reload and try again.');
        return;
      }
      if (context?.festival_id && pendingDeselect.kind !== 'individual') {
        await invalidateGeneralMembership(queryClient, context.festival_id, pendingDeselect.participantIds);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team-leader-programs', context?.festival_id] }),
        queryClient.invalidateQueries({ queryKey: ['team-program-individual-roster', context?.festival_id] }),
        queryClient.invalidateQueries({ queryKey: ['team-program-group-roster', context?.festival_id] }),
        queryClient.invalidateQueries({ queryKey: ['team-leader-participant-programs', context?.festival_id] }),
        queryClient.invalidateQueries({ queryKey: ['team-leader-item-limit-status', context?.festival_id, context?.organisation_id] }),
      ]);
      setPendingDeselect(null);
      setNotice({ kind: 'success', text: pendingDeselect.kind === 'group-entry' ? 'Group entry removed.' : 'Participant deselected from this competition.' });
    } catch (error: any) {
      setDeselectError(error?.message || 'Could not deselect this entry. Reload and try again.');
    } finally {
      setDeselectBusy(false);
    }
  };

  const closeParticipantView = () => {
    if (deselectBusy) return;
    setPendingDeselect(null);
    setActiveViewProgram(null);
  };

  const openIndividualPicker = (program: TeamLeaderProgramOption) => {
    void itemLimitStatusQuery.refetch();
    setActiveIndividualProgram(program);
    setSelectedIndividualParticipantIds([]);
    setIndividualSelectionError('');
    setIndividualMemberSearch('');
    setNotice(null);
  };

  const toggleIndividualParticipant = (participantId: string) => {
    setIndividualSelectionError('');
    setSelectedIndividualParticipantIds((current) => {
      if (current.includes(participantId)) return current.filter((id) => id !== participantId);
      const status = activeIndividualProgram ? getItemLimitStatus(activeIndividualProgram.item_id) : undefined;
      if (!itemLimitStatusQuery.isSuccess || itemLimitStatusQuery.isFetching || !status) return current;
      if (status.max_participants_per_team != null
        && status.participant_count + current.length >= status.max_participants_per_team) return current;
      return [...current, participantId];
    });
  };

  const openGeneralPicker = (program: TeamLeaderProgramOption) => {
    setActiveGeneralProgram(program);
    setSelectedGeneralParticipantIds([]);
    setGeneralSelectionError('');
    setGeneralMemberSearch('');
    setNotice(null);
  };

  const toggleGeneralParticipant = (participantId: string) => {
    setGeneralSelectionError('');
    if (selectedGeneralParticipantIds.includes(participantId)) {
      setSelectedGeneralParticipantIds(selectedGeneralParticipantIds.filter((id) => id !== participantId));
      return;
    }
    const max = Number(activeGeneralProgram?.group_max_members ?? 0);
    if (max > 0 && selectedGeneralParticipantIds.length >= max) {
      setGeneralSelectionError(`This program allows up to ${max} students.`);
      return;
    }
    setSelectedGeneralParticipantIds([...selectedGeneralParticipantIds, participantId]);
  };

  const createGeneralEntry = async () => {
    if (!activeGeneralProgram || savingItemId) return;
    if (!groupEligibilityQuery.isSuccess || groupEligibilityQuery.isFetching || selectedGeneralParticipantIds.some(id => !generalEligibleIds.has(id))) {
      setGeneralSelectionError('Refresh the eligible students before creating this group entry.');
      return;
    }
    const min = Number(activeGeneralProgram.group_min_members ?? 0);
    const max = Number(activeGeneralProgram.group_max_members ?? 0);
    if (selectedGeneralParticipantIds.length < min || (max > 0 && selectedGeneralParticipantIds.length > max)) {
      setGeneralSelectionError(`Select ${min}${max > 0 ? `–${max}` : ' or more'} students to continue.`);
      return;
    }
    setSavingItemId(activeGeneralProgram.item_id);
    setGeneralSelectionError('');
    try {
      const created = await teamLeaderPortalService.createGeneralEntry(activeGeneralProgram.item_id, selectedGeneralParticipantIds);
      if (context?.festival_id) await invalidateGeneralMembership(queryClient, context.festival_id, selectedGeneralParticipantIds);
      await queryClient.invalidateQueries({
        queryKey: ['team-leader-programs', context?.festival_id],
      });
      await queryClient.invalidateQueries({
        queryKey: ['team-group-eligible-members', context?.festival_id, activeGeneralProgram.item_id],
      });
      setActiveGeneralProgram(null);
      setSelectedGeneralParticipantIds([]);
      setNotice({ kind: 'success', text: `Group entry created with ${created.member_count} students; leader chest ${created.entry_chest_number}.` });
    } catch (error: any) {
      setGeneralSelectionError(error?.message || 'Could not create this group entry. Please try again.');
    } finally {
      setSavingItemId(null);
    }
  };

  const setKind = (kind: 'participant' | 'general_team') => {
    setProgramKind(kind);
    setProgramSearch('');
    setCategoryFilter('All categories');
    setGenderFilter('All genders');
    setNotice(null);
  };

  const assignSelectedProgram = async () => {
    if (!activeIndividualProgram || savingItemId || !selectedIndividualParticipantIds.length) return;
    const program = activeIndividualProgram;
    const status = getItemLimitStatus(program.item_id);
    if (!itemLimitStatusQuery.isSuccess || itemLimitStatusQuery.isFetching || !status) {
      setIndividualSelectionError('Could not verify the current team limit. Refresh and try again.');
      return;
    }
    if (status.max_participants_per_team != null
      && status.participant_count + selectedIndividualParticipantIds.length > status.max_participants_per_team) {
      setIndividualSelectionError('This selection exceeds your team limit. Remove an assignment or select fewer students.');
      return;
    }
    setSavingItemId(program.item_id);
    setIndividualSelectionError('');
    setNotice(null);
    try {
      const result = await teamLeaderPortalService.assignProgramParticipants(selectedIndividualParticipantIds, program.item_id);
      await queryClient.invalidateQueries({
        queryKey: ['team-leader-programs', context?.festival_id],
      });
      await queryClient.invalidateQueries({ queryKey: ['team-leader-item-limit-status', context?.festival_id, context?.organisation_id] });
      setSelectedIndividualParticipantIds([]);
      setNotice({ kind: 'success', text: `${result.assigned_count} participant(s) added to ${program.item_name_en || program.item_name_ml || program.item_code || 'the program'}.` });
    } catch (error: any) {
      setIndividualSelectionError(error?.message || 'Could not assign the selected participants. Please refresh and try again.');
    } finally {
      setSavingItemId(null);
    }
  };

  const confirmProgramCompletion = async () => {
    if (!pendingCompletionProgram || savingItemId) return;
    const program = pendingCompletionProgram;
    setSavingItemId(program.item_id);
    setCompletionError('');
    try {
      const result = await teamLeaderPortalService.markProgramCompleted(program.item_id);
      await queryClient.invalidateQueries({ queryKey: ['team-leader-programs', context?.festival_id] });
      setPendingCompletionProgram(null);
      setNotice({ kind: 'success', text: `${program.item_name_en || program.item_name_ml || program.item_code || 'Program'} marked complete for ${result.participant_count} participants.` });
    } catch (error: any) {
      setCompletionError(error?.message || 'Could not mark this program completed. Please refresh and try again.');
    } finally {
      setSavingItemId(null);
    }
  };

  const programCard = (program: TeamLeaderProgramOption, cardWidth: `${number}%`) => {
    const isGeneral = program.entry_kind === 'general_team';
    const completed = !isGeneral && program.is_completed === true;
    const assigned = isGeneral ? program.team_entry_count > 0 : program.is_assigned && !program.is_eligible;
    const busy = savingItemId === program.item_id;
    const name = program.item_name_en || program.item_name_ml || program.item_code || 'Program';
    const limitStatus = !isGeneral ? getItemLimitStatus(program.item_id) : undefined;
    const overLimit = limitStatus?.max_participants_per_team != null
      && limitStatus.participant_count > limitStatus.max_participants_per_team;
    const limitDetails = limitStatus?.max_participants_per_team == null
      ? null
      : 'Your team: ' + limitStatus.participant_count + ' / ' + limitStatus.max_participants_per_team + ' participants';
    const groupRange = `${program.group_min_members ?? 1}${Number(program.group_max_members) > 0 ? `–${program.group_max_members}` : '+'} students`;
    const detail = isGeneral
      ? `${program.item_code ? `${program.item_code} · ` : ''}${groupRange}${program.team_entry_count ? ` · ${program.team_entry_count} team ${program.team_entry_count === 1 ? 'entry' : 'entries'}` : ''}`
      : [program.item_code, categoryLabel(program.category_codes), program.gender && program.gender.toLowerCase() !== 'both' ? program.gender : null, program.assigned_participant_ids?.length ? `${program.assigned_participant_ids.length} assigned` : null].filter(Boolean).join(' · ');
    const canMarkCompleted = !isGeneral && (program.assigned_participant_ids?.length ?? 0) > 0;
    return (
      <View key={program.item_id} style={{
        width: cardWidth,
        minHeight: 218,
        padding: 14,
        borderWidth: 1,
        borderColor: assigned ? ui.colors.borderStrong : border,
        borderRadius: isPhone ? 20 : 12,
        backgroundColor: ui.colors.surface,
        shadowColor: ui.colors.text,
        shadowOpacity: 0.035,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 1,
        justifyContent: 'space-between',
      }}>
        <View>
          <View style={{ minHeight: 76, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} style={{ color: ui.colors.text, fontSize: 14, fontWeight: '700', lineHeight: 20 }}>{name}</Text>
              <Text numberOfLines={1} style={{ color: muted, fontSize: 11, marginTop: 5 }}>{categoryLabel(program.category_codes)}</Text>
            </View>
            <View style={{ borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: completed ? ui.colors.successSoft : assigned ? ui.colors.primarySoft : ui.colors.surfaceMuted }}>
              <Text style={{ color: completed || assigned ? ui.colors.success : ui.colors.textMuted, fontSize: 10, fontWeight: '700' }}>{completed ? 'Completed' : assigned ? 'Added' : 'Open'}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {[isGeneral ? 'Group' : 'Individual', program.gender && program.gender.toLowerCase() !== 'both' ? program.gender : null]
              .filter(Boolean).map((label) => <View key={label} style={{ borderRadius: 6, backgroundColor: ui.colors.surfaceMuted, paddingHorizontal: 8, paddingVertical: 5 }}>
                <Text style={{ color: ui.colors.textMuted, fontSize: 10, fontWeight: '700' }}>{label}</Text>
              </View>)}
          </View>
          <Text numberOfLines={2} style={{ color: muted, fontSize: 11, marginBottom: 12 }}>{detail}</Text>
          {limitDetails ? <Text style={{ color: overLimit ? ui.colors.danger : muted, fontSize: 11, marginBottom: 6, fontWeight: overLimit ? '700' : '400' }}>{limitDetails}</Text> : null}
          {overLimit ? <View style={{ padding: 8, borderRadius: 8, backgroundColor: ui.colors.dangerSoft, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 7 }}><AlertTriangle size={14} color={ui.colors.danger}/><Text style={{ color: ui.colors.danger, fontSize: 11, fontWeight: '700', flex: 1 }}>Over the team limit. Remove extra assignments using View Participants. Existing entries remain available.</Text></View> : null}
        </View>
        <View style={{ gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isGeneral ? (assigned ? `${name} team entry already added` : `Select students for ${name}`) : `Add participants to ${name}`}
          disabled={busy || (isGeneral && (assigned || !program.is_eligible))}
          onPress={() => isGeneral ? openGeneralPicker(program) : openIndividualPicker(program)}
          style={{
            minHeight: 42,
            paddingHorizontal: 12,
            borderRadius: 7,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 5,
            backgroundColor: isGeneral && assigned ? ui.colors.primarySoft : ui.colors.primary,
            opacity: busy ? 0.75 : 1,
          }}
        >
          {busy ? <ActivityIndicator size="small" color={isGeneral && assigned ? orange : ui.colors.onPrimary} /> : isGeneral && assigned ? <Check size={14} color={orange} /> : null}
          <Text style={{ color: isGeneral && assigned ? orange : ui.colors.onPrimary, fontSize: 12, fontWeight: '700' }}>{busy ? (isGeneral ? 'Adding' : 'Adding participants') : isGeneral ? (assigned ? 'Added' : 'Select team') : 'Add participants'}</Text>
        </Pressable>
        <View style={{ flexDirection: isPhone ? 'column' : 'row', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View participants for ${name}`}
            onPress={() => setActiveViewProgram(program)}
            style={{ flex: 1, minHeight: 42, paddingHorizontal: 8, borderRadius: 7, borderWidth: 1, borderColor: border, backgroundColor: ui.colors.surface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
          >
            <Eye size={15} color={ui.colors.text} />
            <Text numberOfLines={1} style={{ color: ui.colors.text, fontSize: 12, fontWeight: '700' }}>View Participants</Text>
          </Pressable>
          {!isGeneral ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={completed ? `${name} completed` : `Mark ${name} completed`}
            accessibilityState={{ disabled: !canMarkCompleted || completed || busy }}
            disabled={!canMarkCompleted || completed || busy}
            onPress={() => { setCompletionError(''); setPendingCompletionProgram(program); }}
            style={{ flex: 1, minHeight: 42, paddingHorizontal: 8, borderRadius: 7, borderWidth: 1, borderColor: completed ? ui.colors.success : border, backgroundColor: completed ? ui.colors.successSoft : ui.colors.surface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, opacity: !canMarkCompleted || completed || busy ? 0.72 : 1 }}
          >
            {completed ? <CheckCircle2 size={15} color={ui.colors.success} /> : null}
            <Text numberOfLines={1} style={{ color: completed ? ui.colors.success : ui.colors.text, fontSize: 12, fontWeight: '700' }}>{completed ? 'Completed' : 'Mark completed'}</Text>
          </Pressable> : null}
        </View>
        </View>
      </View>
    );
  };

  const individualEntryPicker = (
    <Modal visible={!!activeIndividualProgram} transparent animationType="slide" onRequestClose={() => {
      if (savingItemId) return;
      setActiveIndividualProgram(null);
    }}>
      <View style={{ flex: 1, justifyContent: isDesktop ? 'center' : 'flex-end', backgroundColor: ui.colors.overlay, paddingHorizontal: isDesktop ? 20 : 0 }}>
        <View style={{ width: '100%', maxWidth: 680, maxHeight: '88%', alignSelf: 'center', paddingTop: 18, paddingHorizontal: 16, paddingBottom: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: isDesktop ? 20 : 0, borderBottomRightRadius: isDesktop ? 20 : 0, backgroundColor: ui.colors.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: ui.colors.text, fontSize: 17, fontWeight: '800' }}>Choose participants</Text>
              <Text style={{ color: muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>
                {activeIndividualProgram?.item_name_en || activeIndividualProgram?.item_name_ml || activeIndividualProgram?.item_code}
                {' · Only eligible students in your team are listed.'}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close participant selection" disabled={!!savingItemId} onPress={() => setActiveIndividualProgram(null)} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color={muted} />
            </Pressable>
          </View>
          <View style={{ minHeight: 42, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Search size={16} color={muted} />
            <TextInput value={individualMemberSearch} onChangeText={setIndividualMemberSearch} placeholder="Search name or chest number" placeholderTextColor={ui.colors.textSubtle} style={{ flex: 1, minHeight: 40, color: ui.colors.text, fontSize: 13 }} />
          </View>
          <Text style={{ color: muted, fontSize: 11, marginTop: 10 }}>
            {individualEligibleParticipants.length} eligible · {selectedIndividualParticipantIds.length} selected
          </Text>
          {itemLimitStatusQuery.isLoading || itemLimitStatusQuery.isFetching ? <Text style={{ color: muted, fontSize: 11, marginTop: 6 }}>Checking team limit…</Text> : null}
          {itemLimitStatusQuery.isError || (itemLimitStatusQuery.isSuccess && !individualLimitStatus) ? <View style={{ marginTop: 8, padding: 9, borderRadius: 8, backgroundColor: ui.colors.dangerSoft }}><Text style={{ color: ui.colors.danger, fontSize: 11 }}>Could not verify the current team limit. Try again before adding students.</Text><Pressable accessibilityRole="button" onPress={() => void itemLimitStatusQuery.refetch()} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={{ color: ui.colors.danger, fontSize: 11, fontWeight: '700' }}>Retry</Text></Pressable></View> : null}
          {individualLimitStatus?.max_participants_per_team != null ? <View style={{ marginTop: 8, padding: 9, borderRadius: 8, backgroundColor: individualRemaining === 0 ? ui.colors.dangerSoft : ui.colors.surfaceMuted }}><Text style={{ color: individualRemaining === 0 ? ui.colors.danger : ui.colors.text, fontSize: 11, fontWeight: '700' }}>{individualLimitStatus.participant_count} / {individualLimitStatus.max_participants_per_team} students assigned to your team.{individualLimitStatus.participant_count > individualLimitStatus.max_participants_per_team ? ' Over the limit; remove extra assignments in View Participants.' : individualRemaining === 0 ? ' No new assignments can be added.' : ''}</Text></View> : null}
          <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: (!itemLimitStatusQuery.isSuccess || itemLimitStatusQuery.isFetching) || !individualLimitStatus || individualLimitStatus.max_participants_per_team != null || !!savingItemId }} disabled={(!itemLimitStatusQuery.isSuccess || itemLimitStatusQuery.isFetching) || !individualLimitStatus || individualLimitStatus.max_participants_per_team != null || !!savingItemId} onPress={() => setSelectedIndividualParticipantIds(individualEligibleParticipants.filter(person => !individualAssignedIds.has(person.id)).map(person => person.id))} style={{ minHeight: 40, justifyContent: 'center', opacity: !individualLimitStatus || individualLimitStatus.max_participants_per_team != null ? 0.45 : 1 }}><Text style={{ color: ui.colors.primary, fontSize: 11, fontWeight: '700' }}>Select all shown</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={!!savingItemId} onPress={() => setSelectedIndividualParticipantIds([])} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={{ color: muted, fontSize: 11, fontWeight: '700' }}>Clear selection</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, minHeight: 120, maxHeight: isDesktop ? 420 : 330 }} contentContainerStyle={{ gap: 8, paddingTop: 10, paddingBottom: 8 }}>
            {individualEligibleParticipants.map((person) => {
              const alreadyAssigned = individualAssignedIds.has(person.id);
              const selected = selectedIndividualParticipantIds.includes(person.id);
              return (
                <Pressable key={person.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: alreadyAssigned || (!selected && ((!itemLimitStatusQuery.isSuccess || itemLimitStatusQuery.isFetching) || !individualLimitStatus || selectedIndividualParticipantIds.length >= individualRemaining)) }} disabled={alreadyAssigned || !!savingItemId || (!selected && ((!itemLimitStatusQuery.isSuccess || itemLimitStatusQuery.isFetching) || !individualLimitStatus || selectedIndividualParticipantIds.length >= individualRemaining))} onPress={() => toggleIndividualParticipant(person.id)} style={{ minHeight: 54, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: alreadyAssigned ? ui.colors.success : selected ? ui.colors.borderStrong : border, borderRadius: 10, backgroundColor: alreadyAssigned ? ui.colors.successSoft : selected ? ui.colors.primarySoft : ui.colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: alreadyAssigned ? 0.82 : 1 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: alreadyAssigned ? ui.colors.success : selected ? orange : ui.colors.borderStrong, backgroundColor: selected ? orange : ui.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                    {selected ? <Check size={15} color={ui.colors.onPrimary} /> : alreadyAssigned ? <Check size={15} color={ui.colors.success} /> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>{person.name || 'Participant'}</Text>
                    <Text numberOfLines={1} style={{ color: muted, fontSize: 11, marginTop: 2 }}>{[person.category_code, person.chest_number ? `Chest ${person.chest_number}` : null].filter(Boolean).join(' · ')}</Text>
                  </View>
                  {alreadyAssigned ? <Text style={{ color: ui.colors.success, fontSize: 10, fontWeight: '700' }}>Added</Text> : null}
                </Pressable>
              );
            })}
            {!individualEligibleParticipants.length ? <Text style={{ paddingVertical: 18, textAlign: 'center', color: muted, fontSize: 13 }}>No eligible students match this program and search.</Text> : null}
          </ScrollView>
          {individualSelectionError ? <Text style={{ color: ui.colors.danger, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{individualSelectionError}</Text> : null}
          <View style={{ borderTopWidth: 1, borderTopColor: border, paddingTop: 12, marginTop: 8 }}>
            <Pressable accessibilityRole="button" disabled={!selectedIndividualParticipantIds.length || !!savingItemId || (!itemLimitStatusQuery.isSuccess || itemLimitStatusQuery.isFetching) || !individualLimitStatus || selectedIndividualParticipantIds.length > individualRemaining} onPress={assignSelectedProgram} style={{ minHeight: 46, borderRadius: 10, backgroundColor: orange, alignItems: 'center', justifyContent: 'center', opacity: !selectedIndividualParticipantIds.length || !!savingItemId || (!itemLimitStatusQuery.isSuccess || itemLimitStatusQuery.isFetching) || !individualLimitStatus || selectedIndividualParticipantIds.length > individualRemaining ? 0.55 : 1 }}>
              {savingItemId === activeIndividualProgram?.item_id ? <ActivityIndicator color={ui.colors.onPrimary} /> : <Text style={{ color: ui.colors.onPrimary, fontSize: 13, fontWeight: '800', textAlign: 'center' }}>{`Add selected (${selectedIndividualParticipantIds.length})`}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  const completionConfirmation = (
    <Modal visible={!!pendingCompletionProgram} transparent animationType="fade" onRequestClose={() => {
      if (!savingItemId) setPendingCompletionProgram(null);
    }}>
      <View style={{ flex: 1, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.colors.overlay }}>
        <View style={{ width: '100%', maxWidth: 440, padding: 20, borderRadius: 16, backgroundColor: ui.colors.surface }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, marginBottom: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.colors.warningSoft }}>
            <CheckCircle2 size={22} color={ui.colors.warning} />
          </View>
          <Text style={{ color: ui.colors.text, fontSize: 17, fontWeight: '800' }}>Mark program completed?</Text>
          <Text style={{ color: muted, fontSize: 13, lineHeight: 20, marginTop: 8 }}>
            Confirm that all {pendingCompletionProgram?.assigned_participant_ids?.length ?? 0} assigned participants have completed this program and their assessment. You can mark it complete again if more participants are added later.
          </Text>
          {completionError ? <Text style={{ color: ui.colors.danger, fontSize: 12, lineHeight: 18, marginTop: 10 }}>{completionError}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
            <Pressable accessibilityRole="button" disabled={!!savingItemId} onPress={() => setPendingCompletionProgram(null)} style={{ flex: 1, minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: border, backgroundColor: ui.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={!!savingItemId || !pendingCompletionProgram} onPress={confirmProgramCompletion} style={{ flex: 1, minHeight: 44, borderRadius: 9, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center', opacity: savingItemId ? 0.65 : 1 }}>
              {savingItemId === pendingCompletionProgram?.item_id ? <ActivityIndicator color={ui.colors.onPrimary} /> : <Text style={{ color: ui.colors.onPrimary, fontSize: 13, fontWeight: '800', textAlign: 'center' }}>Yes, completed</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  const generalEntryPicker = (
    <Modal visible={!!activeGeneralProgram} transparent animationType="slide" onRequestClose={() => setActiveGeneralProgram(null)}>
      <View style={{ flex: 1, justifyContent: isDesktop ? 'center' : 'flex-end', backgroundColor: ui.colors.overlay, paddingHorizontal: isDesktop ? 20 : 0 }}>
        <View style={{ width: '100%', maxWidth: 680, maxHeight: '88%', alignSelf: 'center', paddingTop: 18, paddingHorizontal: 16, paddingBottom: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: isDesktop ? 20 : 0, borderBottomRightRadius: isDesktop ? 20 : 0, backgroundColor: ui.colors.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: ui.colors.text, fontSize: 17, fontWeight: '800' }}>Choose group members</Text>
              <Text style={{ color: muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>
                {activeGeneralProgram?.item_name_en || activeGeneralProgram?.item_name_ml || activeGeneralProgram?.item_code}
                {' · Select '}{activeGeneralProgram?.group_min_members ?? 1}
                {Number(activeGeneralProgram?.group_max_members) > 0 ? `–${activeGeneralProgram?.group_max_members}` : ' or more'}
                {' students from your team.'}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close team member selection" onPress={() => setActiveGeneralProgram(null)} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color={muted} />
            </Pressable>
          </View>
          <View style={{ minHeight: 42, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Search size={16} color={muted} />
            <TextInput value={generalMemberSearch} onChangeText={setGeneralMemberSearch} placeholder="Search name or chest number" placeholderTextColor={ui.colors.textSubtle} style={{ flex: 1, minHeight: isPhone ? 44 : 40, color: ui.colors.text, fontSize: 13 }} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, minHeight: 140, maxHeight: isDesktop ? 420 : 330 }} contentContainerStyle={{ gap: 8, paddingTop: 12, paddingBottom: 8 }}>
            {groupEligibilityQuery.isLoading || groupEligibilityQuery.isFetching ? <ActivityIndicator style={{ marginVertical: 18 }} color={orange} /> : null}
            {groupEligibilityQuery.isError ? <View style={{ paddingVertical: 12, gap: 8 }}><Text style={{ color: ui.colors.danger, fontSize: 12 }}>Unable to check eligible students. Please retry.</Text><Pressable accessibilityRole="button" onPress={() => groupEligibilityQuery.refetch()} style={{ alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: border }}><Text style={{ color: ui.colors.text, fontSize: 12, fontWeight: '700' }}>Retry</Text></Pressable></View> : null}
            {groupEligibilityQuery.isSuccess && !groupEligibilityQuery.isFetching ? generalEligibleParticipants.map((person) => {
              const selected = selectedGeneralParticipantIds.includes(person.id);
              return (
                <Pressable key={person.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggleGeneralParticipant(person.id)} style={{ minHeight: 54, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: selected ? ui.colors.borderStrong : border, borderRadius: 10, backgroundColor: selected ? ui.colors.primarySoft : ui.colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: selected ? orange : ui.colors.borderStrong, backgroundColor: selected ? orange : ui.colors.surface, alignItems: 'center', justifyContent: 'center' }}>{selected ? <Check size={15} color={ui.colors.onPrimary} /> : null}</View>
                  <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>{person.name || 'Participant'}</Text><Text style={{ color: muted, fontSize: 11, marginTop: 2 }}>{[person.category_code, person.chest_number ? `Chest ${person.chest_number}` : null].filter(Boolean).join(' · ')}</Text></View>
                </Pressable>
              );
            }) : null}
            {groupEligibilityQuery.isSuccess && !groupEligibilityQuery.isFetching && !generalEligibleParticipants.length ? <Text style={{ paddingVertical: 18, textAlign: 'center', color: muted, fontSize: 13 }}>No eligible students match this program.</Text> : null}
          </ScrollView>
          <View style={{ borderTopWidth: 1, borderTopColor: border, paddingTop: 12, gap: 9 }}>
            <Text style={{ color: generalSelectionError ? ui.colors.danger : muted, fontSize: 12 }}>
              {generalSelectionError || `${selectedGeneralParticipantIds.length} selected · ${activeGeneralProgram?.group_min_members ?? 1} required minimum${Number(activeGeneralProgram?.group_max_members) > 0 ? ` · ${activeGeneralProgram?.group_max_members} maximum` : ''}`}
            </Text>
            <Pressable accessibilityRole="button" disabled={!activeGeneralProgram || !groupEligibilityQuery.isSuccess || groupEligibilityQuery.isFetching || selectedGeneralParticipantIds.length < Number(activeGeneralProgram.group_min_members ?? 1) || (Number(activeGeneralProgram.group_max_members) > 0 && selectedGeneralParticipantIds.length > Number(activeGeneralProgram.group_max_members)) || !!savingItemId} onPress={createGeneralEntry} style={{ minHeight: 46, borderRadius: 10, backgroundColor: orange, alignItems: 'center', justifyContent: 'center', opacity: !activeGeneralProgram || !groupEligibilityQuery.isSuccess || groupEligibilityQuery.isFetching || selectedGeneralParticipantIds.length < Number(activeGeneralProgram.group_min_members ?? 1) || (Number(activeGeneralProgram.group_max_members) > 0 && selectedGeneralParticipantIds.length > Number(activeGeneralProgram.group_max_members)) || !!savingItemId ? 0.55 : 1 }}>
              {savingItemId === activeGeneralProgram?.item_id ? <ActivityIndicator color={ui.colors.onPrimary} /> : <Text style={{ color: ui.colors.onPrimary, fontSize: 13, fontWeight: '800' }}>Create group entry</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  const participantView = (
    <Modal visible={!!activeViewProgram} transparent animationType="slide" onRequestClose={closeParticipantView}>
      <View style={{ flex: 1, justifyContent: isDesktop ? 'center' : 'flex-end', backgroundColor: ui.colors.overlay, paddingHorizontal: isDesktop ? 20 : 0 }}>
        <View style={{ width: '100%', maxWidth: 680, maxHeight: '88%', alignSelf: 'center', paddingTop: 18, paddingHorizontal: 16, paddingBottom: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: isDesktop ? 20 : 0, borderBottomRightRadius: isDesktop ? 20 : 0, backgroundColor: ui.colors.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: ui.colors.text, fontSize: 17, fontWeight: '800' }}>Participants</Text>
              <Text style={{ color: muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{activeViewProgram?.item_name_en || activeViewProgram?.item_name_ml || activeViewProgram?.item_code}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close participants" onPress={closeParticipantView} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}><X size={20} color={muted} /></Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0, minHeight: 100, maxHeight: isDesktop ? 440 : 360 }} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {activeViewProgram?.entry_kind === 'general_team' ? (
              groupRosterQuery.isLoading || groupRosterQuery.isFetching ? <ActivityIndicator style={{ marginVertical: 20 }} color={orange} />
                : groupRosterQuery.isError ? <View style={{ gap: 8 }}><Text style={{ color: ui.colors.danger, fontSize: 12 }}>Unable to load group participants.</Text><Pressable accessibilityRole="button" onPress={() => groupRosterQuery.refetch()} style={{ alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: border }}><Text style={{ color: ui.colors.text, fontSize: 12, fontWeight: '700' }}>Retry</Text></Pressable></View>
                  : groupRosterQuery.data?.length ? groupRosterQuery.data.map((member, index, rows) => {
                    const entryMembers = rows.filter((row) => row.registration_id === member.registration_id);
                    return <View key={`${member.registration_id}-${member.participant_id}`} style={{ padding: 11, borderWidth: 1, borderColor: border, borderRadius: 10, backgroundColor: ui.colors.surface }}>
                      {index === 0 || rows[index - 1].registration_id !== member.registration_id ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                          <Text style={{ color: ui.colors.primary, fontSize: 11, fontWeight: '700', flex: 1 }}>Group entry {member.entry_chest_number ? `· Chest ${member.entry_chest_number}` : ''}</Text>
                          <Pressable accessibilityRole="button" accessibilityLabel="Remove whole group entry" onPress={() => openDeselect({ kind: 'group-entry', registrationId: member.registration_id, participantIds: entryMembers.map((row) => row.participant_id) })} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 }}>
                            <Text style={{ color: ui.colors.danger, fontSize: 11, fontWeight: '700' }}>Remove group</Text>
                          </Pressable>
                        </View>
                      ) : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>{member.participant_name}{member.is_leader ? ' · Leader' : ''}</Text>
                          <Text style={{ color: muted, fontSize: 11, marginTop: 3 }}>{member.participant_chest_number ? `Chest ${member.participant_chest_number}` : 'Chest number unavailable'}</Text>
                        </View>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Deselect ${member.participant_name}`} onPress={() => openDeselect({ kind: 'group-member', registrationId: member.registration_id, participantId: member.participant_id, participantName: member.participant_name, participantIds: entryMembers.map((row) => row.participant_id), isLeader: member.is_leader, remainingMembers: entryMembers.filter((row) => row.participant_id !== member.participant_id) })} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 8 }}>
                          <Text style={{ color: ui.colors.danger, fontSize: 11, fontWeight: '700' }}>Deselect</Text>
                        </Pressable>
                      </View>
                    </View>;
                  })
                    : <Text style={{ color: muted, fontSize: 13, paddingVertical: 18, textAlign: 'center' }}>No group entries yet.</Text>
            ) : individualRosterQuery.isLoading || individualRosterQuery.isFetching ? <ActivityIndicator style={{ marginVertical: 20 }} color={orange} />
              : individualRosterQuery.isError ? <View style={{ gap: 8 }}><Text style={{ color: ui.colors.danger, fontSize: 12 }}>Unable to load participants.</Text><Pressable accessibilityRole="button" onPress={() => individualRosterQuery.refetch()} style={{ alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: border }}><Text style={{ color: ui.colors.text, fontSize: 12, fontWeight: '700' }}>Retry</Text></Pressable></View>
                : individualRosterQuery.data?.length ? individualRosterQuery.data.map((person) => <View key={person.registration_id} style={{ padding: 11, borderWidth: 1, borderColor: border, borderRadius: 10, backgroundColor: ui.colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}><Text style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>{person.participant_name}</Text><Text style={{ color: muted, fontSize: 11, marginTop: 3 }}>{[person.participant_category_code, person.participant_chest_number ? `Chest ${person.participant_chest_number}` : null].filter(Boolean).join(' · ')}</Text></View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Deselect ${person.participant_name}`} onPress={() => openDeselect({ kind: 'individual', registrationId: person.registration_id, participantName: person.participant_name, participantIds: [person.participant_id] })} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 8 }}><Text style={{ color: ui.colors.danger, fontSize: 11, fontWeight: '700' }}>Deselect</Text></Pressable>
                </View>)
                  : <Text style={{ color: muted, fontSize: 13, paddingVertical: 18, textAlign: 'center' }}>No participants assigned yet.</Text>}
          </ScrollView>
          {pendingDeselect ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, padding: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.colors.overlay }}>
            <View style={{ width: '100%', maxWidth: 440, maxHeight: '100%', borderRadius: 14, backgroundColor: ui.colors.surface, padding: 16, gap: 10 }}>
              <Text style={{ color: ui.colors.text, fontSize: 16, fontWeight: '800' }}>Confirm deselect</Text>
              <Text style={{ color: muted, fontSize: 12, lineHeight: 18 }}>
                {pendingDeselect.kind === 'group-entry' ? 'This removes the whole group entry and affects every teammate in it.' : `Remove ${pendingDeselect.participantName} from this competition?`}
              </Text>
              {pendingDeselect.kind === 'group-member' && pendingDeselect.isLeader ? <ScrollView style={{ flexGrow: 0, maxHeight: 180 }} contentContainerStyle={{ gap: 5 }}>
                <Text style={{ color: ui.colors.text, fontSize: 12, fontWeight: '700' }}>Choose a replacement leader</Text>
                {pendingDeselect.remainingMembers.filter((member) => !!member.participant_chest_number).map((member) => <Pressable key={member.participant_id} accessibilityRole="radio" accessibilityState={{ checked: replacementLeaderId === member.participant_id }} onPress={() => setReplacementLeaderId(member.participant_id)} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: replacementLeaderId === member.participant_id ? ui.colors.primary : border, borderRadius: 8 }}><Text style={{ color: ui.colors.text, fontSize: 12 }}>{member.participant_name} · Chest {member.participant_chest_number}</Text></Pressable>)}
                {!pendingDeselect.remainingMembers.some((member) => !!member.participant_chest_number) ? <Text style={{ color: ui.colors.danger, fontSize: 12 }}>No remaining member has a chest number to lead this group.</Text> : null}
              </ScrollView> : null}
              {deselectError ? <Text style={{ color: ui.colors.danger, fontSize: 12 }}>{deselectError}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable accessibilityRole="button" disabled={deselectBusy} onPress={() => setPendingDeselect(null)} style={{ flex: 1, minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: ui.colors.text, fontSize: 12, fontWeight: '700' }}>Keep</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={deselectBusy || (pendingDeselect.kind === 'group-member' && pendingDeselect.isLeader && !replacementLeaderId)} onPress={confirmDeselect} style={{ flex: 1, minHeight: 44, borderRadius: 9, backgroundColor: ui.colors.danger, alignItems: 'center', justifyContent: 'center', opacity: deselectBusy ? 0.6 : 1 }}><Text style={{ color: ui.colors.onPrimary, fontSize: 12, fontWeight: '700' }}>{deselectBusy ? 'Removing…' : 'Confirm remove'}</Text></Pressable>
              </View>
            </View>
          </View> : null}
        </View>
      </View>
    </Modal>
  );

  if (contextLoading || participantsLoading) {
    return <TeamLeaderAppShell><View style={{ flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={orange} /></View></TeamLeaderAppShell>;
  }

  const availableProgramCount = (programsQuery.data ?? []).filter((program) => program.entry_kind === programKind && (program.is_eligible || program.is_assigned)).length;
  const activeProgramCount = (programsQuery.data ?? []).filter((program) => program.entry_kind === programKind && (
    programKind === 'participant' ? program.is_completed === true : program.team_entry_count > 0
  )).length;
  const progressPercent = availableProgramCount ? Math.round(activeProgramCount / availableProgramCount * 100) : 0;
  const cardWidth: `${number}%` = width >= 1100 ? '32%' : width >= 700 ? '48.5%' : '100%';
  const filterOptions = filterPicker === 'category' ? categoryOptions : genderOptions;
  const filterValue = filterPicker === 'category' ? categoryFilter : genderFilter;
  const selectedSortLabel = sortOptions.find((option) => option.value === programSort)?.label ?? 'Default order';
  const pickerOptions = filterPicker === 'sort' ? sortOptions.map((option) => option.label) : filterOptions;

  return (
    <TeamLeaderAppShell>
      <ScrollView style={{ flex: 1, backgroundColor: ui.colors.background }} contentContainerStyle={{ width: '100%', maxWidth: 1320, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View>
            <Text style={{ color: muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Festival · {context?.festival_name || context?.team_name || 'Team portal'}</Text>
            <Text style={{ color: ui.colors.text, fontSize: 26, fontWeight: '800', marginTop: 3 }}>Programs</Text>
            <Text style={{ color: muted, fontSize: 12, marginTop: 3 }}>{availableProgramCount} programs · {activeProgramCount} {programKind === 'participant' ? 'completed' : 'with team entries'}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {(['participant', 'general_team'] as const).map((kind) => {
              const selected = programKind === kind;
              return <Pressable key={kind} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setKind(kind)} style={{ minHeight: isPhone ? 44 : 40, paddingHorizontal: 13, borderRadius: 8, borderWidth: 1, borderColor: selected ? ui.colors.primary : border, backgroundColor: selected ? ui.colors.primary : ui.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: selected ? ui.colors.onPrimary : ui.colors.text, fontSize: 12, fontWeight: '700' }}>{kind === 'participant' ? 'Individual' : 'Group items'}</Text>
              </Pressable>;
            })}
          </View>
        </View>

        {participantError ? <View style={{ marginBottom: 12, padding: 14, borderRadius: 10, backgroundColor: ui.colors.dangerSoft, borderWidth: 1, borderColor: ui.colors.borderStrong }}><Text style={{ color: ui.colors.danger, fontSize: 13 }}>{participantError}</Text></View> : null}
        {!participantError && participants.length === 0 ? <View style={{ marginBottom: 12, padding: 20, borderRadius: isPhone ? 20 : 12, borderWidth: 1, borderColor: border, backgroundColor: ui.colors.surface }}><Text style={{ color: ui.colors.text, fontSize: 14, fontWeight: '700' }}>No students are available</Text><Text style={{ color: muted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>Ask the festival administrator to add students to your team.</Text></View> : null}

        {participants.length > 0 ? <>
          <View style={{ marginBottom: 12, padding: 8, borderRadius: isPhone ? 20 : 12, borderWidth: 1, borderColor: border, backgroundColor: ui.colors.surface, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <View style={{ minWidth: isPhone ? 0 : 210, width: isPhone ? '100%' : undefined, height: isPhone ? 44 : 40, flex: isPhone ? undefined : 1, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: border, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Search size={16} color={muted} />
              <TextInput value={programSearch} onChangeText={setProgramSearch} placeholder="Search by program name or code..." placeholderTextColor={ui.colors.textSubtle} style={{ flex: 1, minHeight: 38, color: ui.colors.text, fontSize: 13, outlineStyle: 'none' as any }} />
              {!!programSearch && <Pressable onPress={() => setProgramSearch('')} accessibilityLabel="Clear search"><X size={15} color={muted} /></Pressable>}
            </View>
            {([['category', categoryFilter], ['gender', genderFilter]] as const).map(([key, value]) => <Pressable key={key} accessibilityRole="button" onPress={() => setFilterPicker(key)} style={{ minWidth: isPhone ? 0 : 116, width: isPhone ? '48%' : undefined, flexGrow: isPhone ? 1 : 0, height: isPhone ? 44 : 40, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, borderColor: border, backgroundColor: ui.colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, color: ui.colors.text, fontSize: 11, fontWeight: '600' }}>{key === 'category' ? displayCategoryOption(value) : value}</Text><ChevronDown size={14} color={muted} />
            </Pressable>)}
            <Pressable accessibilityRole="button" accessibilityLabel={`Sort programs, currently ${selectedSortLabel}`} onPress={() => setFilterPicker('sort')} style={{ minWidth: isPhone ? 0 : 140, width: isPhone ? '100%' : undefined, height: isPhone ? 44 : 40, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, borderColor: border, backgroundColor: ui.colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                {programSort === 'category_asc' ? <ListOrdered size={15} color={muted} /> : programSort === 'name_desc' ? <ArrowDownZA size={15} color={muted} /> : <ArrowDownAZ size={15} color={muted} />}
                <Text numberOfLines={1} style={{ flex: 1, color: ui.colors.text, fontSize: 11, fontWeight: '600' }}>{selectedSortLabel}</Text>
              </View>
              <ChevronDown size={14} color={muted} />
            </Pressable>
          </View>

          <View style={{ marginBottom: 12, padding: 15, borderRadius: isPhone ? 20 : 12, borderWidth: 1, borderColor: border, backgroundColor: ui.colors.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ color: ui.colors.text, fontSize: 14, fontWeight: '700' }}>{activeProgramCount} of {availableProgramCount} {programKind === 'participant' ? 'individual programs completed' : 'group programs have entries'}</Text>
              <Text style={{ color: ui.colors.primary, fontSize: 12, fontWeight: '700' }}>{progressPercent}%</Text>
            </View>
            <View style={{ height: 6, marginTop: 9, overflow: 'hidden', borderRadius: 99, backgroundColor: ui.colors.surfaceMuted }}><View style={{ width: `${progressPercent}%`, height: '100%', borderRadius: 99, backgroundColor: ui.colors.primary }} /></View>
          </View>
          {programKind === 'general_team' ? <Text style={{ marginBottom: 8, marginTop: 4, color: muted, fontSize: 11 }}>Create a group entry using eligible students from your team. The first selected student is the group leader.</Text> : null}
          {notice ? <View style={{ marginBottom: 10, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, backgroundColor: notice.kind === 'success' ? ui.colors.primarySoft : ui.colors.dangerSoft, borderWidth: 1, borderColor: notice.kind === 'success' ? ui.colors.borderStrong : ui.colors.borderStrong }}><Text style={{ color: notice.kind === 'success' ? ui.colors.primary : ui.colors.danger, fontSize: 12 }}>{notice.text}</Text></View> : null}
          {programsQuery.isError ? <View style={{ marginBottom: 10, padding: 14, borderRadius: 10, backgroundColor: ui.colors.dangerSoft, borderWidth: 1, borderColor: ui.colors.borderStrong }}><Text style={{ color: ui.colors.danger, fontSize: 12 }}>{(programsQuery.error as Error).message || 'Unable to load programs.'}</Text></View> : null}
          {programsQuery.isLoading ? <View style={{ minHeight: 180, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={orange} /></View> : null}
          {!programsQuery.isLoading && !programsQuery.isError && visiblePrograms.length === 0 ? <View style={{ marginTop: 4, padding: 18, borderRadius: isPhone ? 20 : 12, borderWidth: 1, borderColor: border, backgroundColor: ui.colors.surface }}><Text style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>No eligible programs found</Text><Text style={{ color: muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{programSearch || categoryFilter !== 'All categories' || genderFilter !== 'All genders' ? 'Try changing your search or filters.' : programKind === 'general_team' ? 'No active group programs are currently available for this team.' : 'No active individual programs match participants in your team. A registration restriction may also prevent entry.'}</Text></View> : null}
          {!programsQuery.isLoading && !programsQuery.isError && visiblePrograms.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
            {visiblePrograms.map((program) => programCard(program, cardWidth))}
          </View> : null}
        </> : null}
      </ScrollView>

      <Modal visible={!!filterPicker} transparent animationType="fade" onRequestClose={() => setFilterPicker(null)}>
        <Pressable onPress={() => setFilterPicker(null)} style={{ flex: 1, justifyContent: 'center', padding: 16, backgroundColor: ui.colors.overlay }}>
          <Pressable onPress={(event) => event.stopPropagation()} style={{ maxHeight: '75%', borderRadius: isPhone ? 20 : 12, padding: 16, backgroundColor: ui.colors.surface }}>
            <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: ui.colors.text, fontSize: 16, fontWeight: '700' }}>{filterPicker === 'sort' ? 'Sort programs' : 'Filter programs'}</Text><Pressable onPress={() => setFilterPicker(null)} accessibilityLabel="Close filter"><X size={19} color={muted} /></Pressable></View>
            <ScrollView>{pickerOptions.map((option) => <Pressable key={option} onPress={() => {
              if (filterPicker === 'category') setCategoryFilter(option);
              else if (filterPicker === 'gender') setGenderFilter(option);
              else setProgramSort(sortOptions.find((sortOption) => sortOption.label === option)?.value ?? 'default');
              setFilterPicker(null);
            }} style={{ minHeight: 44, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: border }}><Text style={{ color: filterPicker === 'sort' ? (selectedSortLabel === option ? ui.colors.primary : ui.colors.text) : option === filterValue ? ui.colors.primary : ui.colors.text, fontSize: 13, fontWeight: (filterPicker === 'sort' ? selectedSortLabel === option : option === filterValue) ? '700' : '400' }}>{filterPicker === 'category' ? displayCategoryOption(option) : option}</Text></Pressable>)}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      {individualEntryPicker}
      {completionConfirmation}
      {generalEntryPicker}
      {participantView}
    </TeamLeaderAppShell>
  );
}
