import React, { useEffect, useMemo, useState } from 'react';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamText as Text } from '@/components/team/TeamText';
import { ActivityIndicator, Modal, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Search, UserRound, X } from 'lucide-react-native';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderParticipant, TeamLeaderProgramOption, teamLeaderPortalService } from '@/services/teamLeaderPortalService';
import { invalidateGeneralMembership } from '@/core/utils/invalidateGeneralMembership';
import { matchesCompetitionCategory } from '@/core/utils/groupParticipation';


function categoryLabel(codes: string[] | null) {
  return Array.isArray(codes) && codes.length ? codes.join(', ') : 'All categories';
}

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
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');
  const [programSearch, setProgramSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [genderFilter, setGenderFilter] = useState('All genders');
  const [filterPicker, setFilterPicker] = useState<'category' | 'gender' | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [programKind, setProgramKind] = useState<'participant' | 'general_team'>('participant');
  const [activeGeneralProgram, setActiveGeneralProgram] = useState<TeamLeaderProgramOption | null>(null);
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

  useEffect(() => {
    if (!selectedParticipantId && participants.length) setSelectedParticipantId(participants[0].id);
    if (selectedParticipantId && !participants.some((person) => person.id === selectedParticipantId)) {
      setSelectedParticipantId(participants[0]?.id ?? null);
    }
  }, [participants, selectedParticipantId]);

  const selectedParticipant = participants.find((person) => person.id === selectedParticipantId) ?? null;
  const programsQuery = useQuery({
    queryKey: ['team-leader-programs', context?.festival_id, selectedParticipantId],
    enabled: !!context && !!selectedParticipantId,
    queryFn: () => teamLeaderPortalService.getProgramsForParticipant(selectedParticipantId!),
  });

  const visiblePrograms = useMemo(() => (programsQuery.data ?? []).filter((program) =>
    program.entry_kind === programKind && (program.is_eligible || program.is_assigned),
  ).filter((program) =>
    !programSearch.trim() || `${program.item_code ?? ''} ${program.item_name_en ?? ''} ${program.item_name_ml ?? ''} ${categoryLabel(program.category_codes)}`
      .toLowerCase().includes(programSearch.trim().toLowerCase()),
  ).filter((program) => categoryFilter === 'All categories'
    || (program.category_codes ?? []).some((category) => category.trim().toUpperCase() === categoryFilter))
    .filter((program) => genderFilter === 'All genders'
      || (genderFilter === 'Both' ? !program.gender || program.gender.toLowerCase() === 'both' : program.gender?.toLowerCase() === genderFilter.toLowerCase())),
  [programsQuery.data, programSearch, programKind, categoryFilter, genderFilter]);

  const categoryOptions = ['All categories', ...Array.from(new Set((programsQuery.data ?? [])
    .filter((program) => program.entry_kind === programKind)
    .flatMap((program) => program.category_codes ?? [])).values()).sort()];
  const genderOptions = ['All genders', ...Array.from(new Set((programsQuery.data ?? [])
    .filter((program) => program.entry_kind === programKind && program.gender && program.gender.toLowerCase() !== 'both')
    .map((program) => program.gender!))).sort()];

  const visibleParticipants = participants.filter((person) =>
    `${person.name} ${person.chest_number ?? ''} ${person.category_code ?? ''}`
      .toLowerCase().includes(participantSearch.trim().toLowerCase()),
  );
  const generalEligibleParticipants = activeGeneralProgram
    ? participants.filter((person) =>
        (activeGeneralProgram.category_codes ?? []).some(code => matchesCompetitionCategory(person.category_code || '', code))
        && (!activeGeneralProgram.gender || activeGeneralProgram.gender.toLowerCase() === 'both'
          || activeGeneralProgram.gender.toLowerCase() === String(person.gender || '').toLowerCase())
        && `${person.name} ${person.chest_number ?? ''} ${person.category_code ?? ''}`.toLowerCase().includes(generalMemberSearch.trim().toLowerCase()),
      )
    : [];

  const selectParticipant = (person: TeamLeaderParticipant) => {
    setSelectedParticipantId(person.id);
    setProgramSearch('');
    setNotice(null);
    setPickerOpen(false);
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

  const assignProgram = async (program: TeamLeaderProgramOption) => {
    if (!selectedParticipant || savingItemId || program.is_assigned || !program.is_eligible || program.entry_kind !== 'participant') return;
    setSavingItemId(program.item_id);
    setNotice(null);
    try {
      await teamLeaderPortalService.assignProgram(selectedParticipant.id, program.item_id);
      await queryClient.invalidateQueries({
        queryKey: ['team-leader-programs', context?.festival_id, selectedParticipant.id],
      });
      setNotice({ kind: 'success', text: `${selectedParticipant.name} was added to ${program.item_name_en || program.item_name_ml || program.item_code || 'the program'}.` });
    } catch (error: any) {
      setNotice({ kind: 'error', text: error?.message || 'Could not assign this program. Please try again.' });
    } finally {
      setSavingItemId(null);
    }
  };

  const personButton = (person: TeamLeaderParticipant) => {
    const selected = person.id === selectedParticipantId;
    return (
      <Pressable
        key={person.id}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => selectParticipant(person)}
        style={{
          minHeight: 56,
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: selected ? ui.colors.borderStrong : border,
          backgroundColor: selected ? ui.colors.primarySoft : ui.colors.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? ui.colors.primarySoft : ui.colors.surfaceMuted }}>
          <UserRound size={17} color={selected ? orange : muted} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>{person.name || 'Participant'}</Text>
          <Text numberOfLines={1} style={{ color: muted, fontSize: 11, marginTop: 2 }}>
            {[person.category_code, person.chest_number ? `Chest ${person.chest_number}` : null].filter(Boolean).join(' · ') || 'Student'}
          </Text>
        </View>
        {selected ? <Check size={17} color={orange} /> : null}
      </Pressable>
    );
  };

  const programCard = (program: TeamLeaderProgramOption, cardWidth: `${number}%`) => {
    const isGeneral = program.entry_kind === 'general_team';
    const assigned = isGeneral ? program.team_entry_count > 0 : program.is_assigned;
    const busy = savingItemId === program.item_id;
    const name = program.item_name_en || program.item_name_ml || program.item_code || 'Program';
    const groupRange = `${program.group_min_members ?? 1}${Number(program.group_max_members) > 0 ? `–${program.group_max_members}` : '+'} students`;
    const detail = isGeneral
      ? `${program.item_code ? `${program.item_code} · ` : ''}${groupRange}${program.team_entry_count ? ` · ${program.team_entry_count} team ${program.team_entry_count === 1 ? 'entry' : 'entries'}` : ''}`
      : [program.item_code, categoryLabel(program.category_codes), program.gender && program.gender.toLowerCase() !== 'both' ? program.gender : null].filter(Boolean).join(' · ');
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
            <View style={{ borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: assigned ? ui.colors.primarySoft : ui.colors.surfaceMuted }}>
              <Text style={{ color: assigned ? ui.colors.success : ui.colors.textMuted, fontSize: 10, fontWeight: '700' }}>{assigned ? 'Added' : 'Open'}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {[isGeneral ? 'Group' : 'Individual', program.gender && program.gender.toLowerCase() !== 'both' ? program.gender : null]
              .filter(Boolean).map((label) => <View key={label} style={{ borderRadius: 6, backgroundColor: ui.colors.surfaceMuted, paddingHorizontal: 8, paddingVertical: 5 }}>
                <Text style={{ color: ui.colors.textMuted, fontSize: 10, fontWeight: '700' }}>{label}</Text>
              </View>)}
          </View>
          <Text numberOfLines={2} style={{ color: muted, fontSize: 11, marginBottom: 12 }}>{detail}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={assigned ? `${name} already assigned` : isGeneral ? `Select students for ${name}` : `Add ${name} for ${selectedParticipant?.name ?? 'student'}`}
          disabled={assigned || busy || !program.is_eligible}
          onPress={() => isGeneral ? openGeneralPicker(program) : assignProgram(program)}
          style={{
            minHeight: 42,
            paddingHorizontal: 12,
            borderRadius: 7,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 5,
            backgroundColor: assigned ? ui.colors.primarySoft : ui.colors.primary,
            opacity: busy ? 0.75 : 1,
          }}
        >
          {busy ? <ActivityIndicator size="small" color={assigned ? orange : ui.colors.onPrimary} /> : assigned ? <Check size={14} color={orange} /> : null}
          <Text style={{ color: assigned ? orange : ui.colors.onPrimary, fontSize: 12, fontWeight: '700' }}>{assigned ? 'Added' : busy ? 'Adding' : 'Assign participants'}</Text>
        </Pressable>
      </View>
    );
  };

  const studentPicker = (
    <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: ui.colors.overlay }}>
        <View style={{ maxHeight: '88%', paddingTop: 18, paddingHorizontal: 16, paddingBottom: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: ui.colors.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View>
              <Text style={{ color: ui.colors.text, fontSize: 17, fontWeight: '800' }}>Choose a student</Text>
              <Text style={{ color: muted, fontSize: 12, marginTop: 3 }}>Only students in your team are listed.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close student list" onPress={() => setPickerOpen(false)} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color={muted} />
            </Pressable>
          </View>
          <View style={{ minHeight: 42, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Search size={16} color={muted} />
            <TextInput value={participantSearch} onChangeText={setParticipantSearch} placeholder="Search name or chest number" placeholderTextColor={ui.colors.textSubtle} style={{ flex: 1, minHeight: isPhone ? 44 : 40, color: ui.colors.text, fontSize: 13 }} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingTop: 12 }}>
            {visibleParticipants.map((person) => personButton(person))}
            {!visibleParticipants.length ? <Text style={{ paddingVertical: 20, textAlign: 'center', color: muted, fontSize: 13 }}>No students match that search.</Text> : null}
          </ScrollView>
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
            {generalEligibleParticipants.map((person) => {
              const selected = selectedGeneralParticipantIds.includes(person.id);
              return (
                <Pressable key={person.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggleGeneralParticipant(person.id)} style={{ minHeight: 54, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: selected ? ui.colors.borderStrong : border, borderRadius: 10, backgroundColor: selected ? ui.colors.primarySoft : ui.colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: selected ? orange : ui.colors.borderStrong, backgroundColor: selected ? orange : ui.colors.surface, alignItems: 'center', justifyContent: 'center' }}>{selected ? <Check size={15} color={ui.colors.onPrimary} /> : null}</View>
                  <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>{person.name || 'Participant'}</Text><Text style={{ color: muted, fontSize: 11, marginTop: 2 }}>{[person.category_code, person.chest_number ? `Chest ${person.chest_number}` : null].filter(Boolean).join(' · ')}</Text></View>
                </Pressable>
              );
            })}
            {!generalEligibleParticipants.length ? <Text style={{ paddingVertical: 18, textAlign: 'center', color: muted, fontSize: 13 }}>No eligible students match this program.</Text> : null}
          </ScrollView>
          <View style={{ borderTopWidth: 1, borderTopColor: border, paddingTop: 12, gap: 9 }}>
            <Text style={{ color: generalSelectionError ? ui.colors.danger : muted, fontSize: 12 }}>
              {generalSelectionError || `${selectedGeneralParticipantIds.length} selected · ${activeGeneralProgram?.group_min_members ?? 1} required minimum${Number(activeGeneralProgram?.group_max_members) > 0 ? ` · ${activeGeneralProgram?.group_max_members} maximum` : ''}`}
            </Text>
            <Pressable accessibilityRole="button" disabled={!activeGeneralProgram || selectedGeneralParticipantIds.length < Number(activeGeneralProgram.group_min_members ?? 1) || (Number(activeGeneralProgram.group_max_members) > 0 && selectedGeneralParticipantIds.length > Number(activeGeneralProgram.group_max_members)) || !!savingItemId} onPress={createGeneralEntry} style={{ minHeight: 46, borderRadius: 10, backgroundColor: orange, alignItems: 'center', justifyContent: 'center', opacity: !activeGeneralProgram || selectedGeneralParticipantIds.length < Number(activeGeneralProgram.group_min_members ?? 1) || (Number(activeGeneralProgram.group_max_members) > 0 && selectedGeneralParticipantIds.length > Number(activeGeneralProgram.group_max_members)) || !!savingItemId ? 0.55 : 1 }}>
              {savingItemId === activeGeneralProgram?.item_id ? <ActivityIndicator color={ui.colors.onPrimary} /> : <Text style={{ color: ui.colors.onPrimary, fontSize: 13, fontWeight: '800' }}>Create group entry</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (contextLoading || participantsLoading) {
    return <TeamLeaderAppShell><View style={{ flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={orange} /></View></TeamLeaderAppShell>;
  }

  const availableProgramCount = (programsQuery.data ?? []).filter((program) => program.entry_kind === programKind && (program.is_eligible || program.is_assigned)).length;
  const activeProgramCount = (programsQuery.data ?? []).filter((program) => program.entry_kind === programKind && (
    programKind === 'participant' ? program.is_assigned : program.team_entry_count > 0
  )).length;
  const progressPercent = availableProgramCount ? Math.round(activeProgramCount / availableProgramCount * 100) : 0;
  const cardWidth: `${number}%` = width >= 1100 ? '32%' : width >= 700 ? '48.5%' : '100%';
  const filterOptions = filterPicker === 'category' ? categoryOptions : genderOptions;
  const filterValue = filterPicker === 'category' ? categoryFilter : genderFilter;

  return (
    <TeamLeaderAppShell>
      <ScrollView style={{ flex: 1, backgroundColor: ui.colors.background }} contentContainerStyle={{ width: '100%', maxWidth: 1320, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View>
            <Text style={{ color: muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Festival · {context?.festival_name || context?.team_name || 'Team portal'}</Text>
            <Text style={{ color: ui.colors.text, fontSize: 26, fontWeight: '800', marginTop: 3 }}>Programs</Text>
            <Text style={{ color: muted, fontSize: 12, marginTop: 3 }}>{availableProgramCount} programs · {activeProgramCount} {programKind === 'participant' ? 'assigned' : 'with team entries'}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {(['participant', 'general_team'] as const).map((kind) => {
              const selected = programKind === kind;
              return <Pressable key={kind} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setKind(kind)} style={{ minHeight: isPhone ? 44 : 40, paddingHorizontal: 13, borderRadius: 8, borderWidth: 1, borderColor: selected ? ui.colors.primary : border, backgroundColor: selected ? ui.colors.primary : ui.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: selected ? ui.colors.onPrimary : ui.colors.text, fontSize: 12, fontWeight: '700' }}>{kind === 'participant' ? 'Individual' : 'Group items'}</Text>
              </Pressable>;
            })}
            {programKind === 'participant' ? <Pressable accessibilityRole="button" onPress={() => { setParticipantSearch(''); setPickerOpen(true); }} style={{ minHeight: isPhone ? 44 : 40, maxWidth: 260, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: border, backgroundColor: ui.colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <UserRound size={16} color={orange} />
              <Text numberOfLines={1} style={{ maxWidth: 190, color: ui.colors.text, fontSize: 12, fontWeight: '700' }}>{selectedParticipant?.name || 'Choose a student'}</Text>
              <ChevronDown size={14} color={muted} />
            </Pressable> : null}
          </View>
        </View>

        {participantError ? <View style={{ marginBottom: 12, padding: 14, borderRadius: 10, backgroundColor: ui.colors.dangerSoft, borderWidth: 1, borderColor: ui.colors.borderStrong }}><Text style={{ color: ui.colors.danger, fontSize: 13 }}>{participantError}</Text></View> : null}
        {!participantError && participants.length === 0 ? <View style={{ marginBottom: 12, padding: 20, borderRadius: isPhone ? 20 : 12, borderWidth: 1, borderColor: border, backgroundColor: ui.colors.surface }}><Text style={{ color: ui.colors.text, fontSize: 14, fontWeight: '700' }}>No students are available</Text><Text style={{ color: muted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>Ask the festival administrator to add students to your team.</Text></View> : null}

        {participants.length > 0 ? <>
          <View style={{ marginBottom: 12, padding: 8, borderRadius: isPhone ? 20 : 12, borderWidth: 1, borderColor: border, backgroundColor: ui.colors.surface, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <View style={{ minWidth: 210, height: isPhone ? 44 : 40, flex: 1, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: border, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Search size={16} color={muted} />
              <TextInput value={programSearch} onChangeText={setProgramSearch} placeholder="Search by program name or code..." placeholderTextColor={ui.colors.textSubtle} style={{ flex: 1, minHeight: 38, color: ui.colors.text, fontSize: 13, outlineStyle: 'none' as any }} />
              {!!programSearch && <Pressable onPress={() => setProgramSearch('')} accessibilityLabel="Clear search"><X size={15} color={muted} /></Pressable>}
            </View>
            {([['category', categoryFilter], ['gender', genderFilter]] as const).map(([key, value]) => <Pressable key={key} accessibilityRole="button" onPress={() => setFilterPicker(key)} style={{ minWidth: 116, height: isPhone ? 44 : 40, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, borderColor: border, backgroundColor: ui.colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, color: ui.colors.text, fontSize: 11, fontWeight: '600' }}>{value}</Text><ChevronDown size={14} color={muted} />
            </Pressable>)}
          </View>

          <View style={{ marginBottom: 12, padding: 15, borderRadius: isPhone ? 20 : 12, borderWidth: 1, borderColor: border, backgroundColor: ui.colors.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ color: ui.colors.text, fontSize: 14, fontWeight: '700' }}>{activeProgramCount} of {availableProgramCount} {programKind === 'participant' ? 'individual programs assigned' : 'group programs have entries'}</Text>
              <Text style={{ color: ui.colors.primary, fontSize: 12, fontWeight: '700' }}>{progressPercent}%</Text>
            </View>
            <View style={{ height: 6, marginTop: 9, overflow: 'hidden', borderRadius: 99, backgroundColor: ui.colors.surfaceMuted }}><View style={{ width: `${progressPercent}%`, height: '100%', borderRadius: 99, backgroundColor: ui.colors.primary }} /></View>
          </View>
          {programKind === 'general_team' ? <Text style={{ marginBottom: 8, marginTop: 4, color: muted, fontSize: 11 }}>Create a group entry using eligible students from your team. The first selected student is the group leader.</Text> : null}
          {notice ? <View style={{ marginBottom: 10, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, backgroundColor: notice.kind === 'success' ? ui.colors.primarySoft : ui.colors.dangerSoft, borderWidth: 1, borderColor: notice.kind === 'success' ? ui.colors.borderStrong : ui.colors.borderStrong }}><Text style={{ color: notice.kind === 'success' ? ui.colors.primary : ui.colors.danger, fontSize: 12 }}>{notice.text}</Text></View> : null}
          {programsQuery.isError ? <View style={{ marginBottom: 10, padding: 14, borderRadius: 10, backgroundColor: ui.colors.dangerSoft, borderWidth: 1, borderColor: ui.colors.borderStrong }}><Text style={{ color: ui.colors.danger, fontSize: 12 }}>{(programsQuery.error as Error).message || 'Unable to load programs.'}</Text></View> : null}
          {programsQuery.isLoading ? <View style={{ minHeight: 180, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={orange} /></View> : null}
          {!programsQuery.isLoading && !programsQuery.isError && visiblePrograms.length === 0 ? <View style={{ marginTop: 4, padding: 18, borderRadius: isPhone ? 20 : 12, borderWidth: 1, borderColor: border, backgroundColor: ui.colors.surface }}><Text style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>No eligible programs found</Text><Text style={{ color: muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{programSearch || categoryFilter !== 'All categories' || genderFilter !== 'All genders' ? 'Try changing your search or filters.' : programKind === 'general_team' ? 'No active group programs are currently available for this team.' : 'No active individual programs match this student. A registration restriction may also prevent entry.'}</Text></View> : null}
          {!programsQuery.isLoading && !programsQuery.isError && visiblePrograms.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
            {visiblePrograms.map((program) => programCard(program, cardWidth))}
          </View> : null}
        </> : null}
      </ScrollView>

      <Modal visible={!!filterPicker} transparent animationType="fade" onRequestClose={() => setFilterPicker(null)}>
        <Pressable onPress={() => setFilterPicker(null)} style={{ flex: 1, justifyContent: 'center', padding: 16, backgroundColor: ui.colors.overlay }}>
          <Pressable onPress={(event) => event.stopPropagation()} style={{ maxHeight: '75%', borderRadius: isPhone ? 20 : 12, padding: 16, backgroundColor: ui.colors.surface }}>
            <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: ui.colors.text, fontSize: 16, fontWeight: '700' }}>Filter programs</Text><Pressable onPress={() => setFilterPicker(null)} accessibilityLabel="Close filter"><X size={19} color={muted} /></Pressable></View>
            <ScrollView>{filterOptions.map((option) => <Pressable key={option} onPress={() => { if (filterPicker === 'category') setCategoryFilter(option); else setGenderFilter(option); setFilterPicker(null); }} style={{ borderBottomWidth: 1, borderBottomColor: border, paddingVertical: 12 }}><Text style={{ color: filterValue === option ? ui.colors.primary : ui.colors.text, fontSize: 13, fontWeight: filterValue === option ? '700' : '400' }}>{option}</Text></Pressable>)}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      {studentPicker}
      {generalEntryPicker}
    </TeamLeaderAppShell>
  );
}
