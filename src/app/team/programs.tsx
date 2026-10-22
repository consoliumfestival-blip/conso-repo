import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Search, UserRound, X } from 'lucide-react-native';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderParticipant, TeamLeaderProgramOption, teamLeaderPortalService } from '@/services/teamLeaderPortalService';
import { invalidateGeneralMembership } from '@/core/utils/invalidateGeneralMembership';

const teal = '#0F766E';
const muted = '#64748B';
const border = '#E2E8F0';

function categoryLabel(codes: string[] | null) {
  return Array.isArray(codes) && codes.length ? codes.join(', ') : 'All categories';
}

export default function TeamProgramsScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1120;
  const queryClient = useQueryClient();
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [participants, setParticipants] = useState<TeamLeaderParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');
  const [programSearch, setProgramSearch] = useState('');
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
  ), [programsQuery.data, programSearch, programKind]);

  const visibleParticipants = participants.filter((person) =>
    `${person.name} ${person.chest_number ?? ''} ${person.category_code ?? ''}`
      .toLowerCase().includes(participantSearch.trim().toLowerCase()),
  );
  const generalEligibleParticipants = activeGeneralProgram
    ? participants.filter((person) =>
        !['GN', 'GENERAL'].includes(String(person.category_code || '').trim().toUpperCase())
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
      setNotice({ kind: 'success', text: `General team entry ${created.entry_chest_number} created with ${created.member_count} students.` });
    } catch (error: any) {
      setGeneralSelectionError(error?.message || 'Could not create this General team entry. Please try again.');
    } finally {
      setSavingItemId(null);
    }
  };

  const setKind = (kind: 'participant' | 'general_team') => {
    setProgramKind(kind);
    setProgramSearch('');
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
          borderColor: selected ? '#99D5D0' : border,
          backgroundColor: selected ? '#F0FDFA' : '#FFFFFF',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? '#CCFBF1' : '#F1F5F9' }}>
          <UserRound size={17} color={selected ? teal : muted} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: '#0F172A', fontSize: 13, fontWeight: '700' }}>{person.name || 'Participant'}</Text>
          <Text numberOfLines={1} style={{ color: muted, fontSize: 11, marginTop: 2 }}>
            {[person.category_code, person.chest_number ? `Chest ${person.chest_number}` : null].filter(Boolean).join(' · ') || 'Student'}
          </Text>
        </View>
        {selected ? <Check size={17} color={teal} /> : null}
      </Pressable>
    );
  };

  const programCard = (program: TeamLeaderProgramOption, desktop = false) => {
    const isGeneral = program.entry_kind === 'general_team';
    const assigned = !isGeneral && program.is_assigned;
    const busy = savingItemId === program.item_id;
    const name = program.item_name_en || program.item_name_ml || program.item_code || 'Program';
    const groupRange = `${program.group_min_members ?? 1}${Number(program.group_max_members) > 0 ? `–${program.group_max_members}` : '+'} students`;
    const detail = isGeneral
      ? `${program.item_code ? `${program.item_code} · ` : ''}${groupRange}${program.team_entry_count ? ` · ${program.team_entry_count} team ${program.team_entry_count === 1 ? 'entry' : 'entries'}` : ''}`
      : [program.item_code, categoryLabel(program.category_codes), program.gender && program.gender.toLowerCase() !== 'both' ? program.gender : null].filter(Boolean).join(' · ');
    return (
      <View key={program.item_id} style={{
        flex: desktop ? 1 : undefined,
        minWidth: desktop ? 250 : undefined,
        minHeight: 82,
        padding: desktop ? 15 : 12,
        borderWidth: 1,
        borderColor: assigned ? '#99D5D0' : border,
        borderRadius: 12,
        backgroundColor: assigned ? '#F0FDFA' : '#FFFFFF',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ color: '#0F172A', fontSize: 13, fontWeight: '700', lineHeight: 19 }}>{name}</Text>
          <Text numberOfLines={1} style={{ color: muted, fontSize: 11, marginTop: 5 }}>
            {detail}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isGeneral ? `Select students for ${name}` : assigned ? `${name} already assigned` : `Add ${name} for ${selectedParticipant?.name ?? 'student'}`}
          disabled={(!isGeneral && assigned) || busy || !program.is_eligible}
          onPress={() => isGeneral ? openGeneralPicker(program) : assignProgram(program)}
          style={{
            minWidth: 88,
            minHeight: 42,
            paddingHorizontal: 11,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 5,
            backgroundColor: assigned ? '#CCFBF1' : teal,
            opacity: busy ? 0.75 : 1,
          }}
        >
          {busy ? <ActivityIndicator size="small" color={assigned ? teal : '#FFFFFF'} /> : assigned ? <Check size={14} color={teal} /> : null}
          <Text style={{ color: assigned ? teal : '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{assigned ? 'Added' : busy ? 'Adding' : isGeneral ? 'Select team' : 'Add'}</Text>
        </Pressable>
      </View>
    );
  };

  const studentPicker = (
    <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0F172A66' }}>
        <View style={{ maxHeight: '88%', paddingTop: 18, paddingHorizontal: 16, paddingBottom: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: '#FFFFFF' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View>
              <Text style={{ color: '#0F172A', fontSize: 17, fontWeight: '800' }}>Choose a student</Text>
              <Text style={{ color: muted, fontSize: 12, marginTop: 3 }}>Only students in your team are listed.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close student list" onPress={() => setPickerOpen(false)} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color={muted} />
            </Pressable>
          </View>
          <View style={{ minHeight: 42, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Search size={16} color={muted} />
            <TextInput value={participantSearch} onChangeText={setParticipantSearch} placeholder="Search name or chest number" placeholderTextColor="#94A3B8" style={{ flex: 1, minHeight: 40, color: '#0F172A', fontSize: 13 }} />
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
      <View style={{ flex: 1, justifyContent: isDesktop ? 'center' : 'flex-end', backgroundColor: '#0F172A66', paddingHorizontal: isDesktop ? 20 : 0 }}>
        <View style={{ width: '100%', maxWidth: 680, maxHeight: '88%', alignSelf: 'center', paddingTop: 18, paddingHorizontal: 16, paddingBottom: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: isDesktop ? 20 : 0, borderBottomRightRadius: isDesktop ? 20 : 0, backgroundColor: '#FFFFFF' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#0F172A', fontSize: 17, fontWeight: '800' }}>Choose General team members</Text>
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
            <TextInput value={generalMemberSearch} onChangeText={setGeneralMemberSearch} placeholder="Search name or chest number" placeholderTextColor="#94A3B8" style={{ flex: 1, minHeight: 40, color: '#0F172A', fontSize: 13 }} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, minHeight: 140, maxHeight: isDesktop ? 420 : 330 }} contentContainerStyle={{ gap: 8, paddingTop: 12, paddingBottom: 8 }}>
            {generalEligibleParticipants.map((person) => {
              const selected = selectedGeneralParticipantIds.includes(person.id);
              return (
                <Pressable key={person.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggleGeneralParticipant(person.id)} style={{ minHeight: 54, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: selected ? '#99D5D0' : border, borderRadius: 10, backgroundColor: selected ? '#F0FDFA' : '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: selected ? teal : '#CBD5E1', backgroundColor: selected ? teal : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>{selected ? <Check size={15} color="#FFFFFF" /> : null}</View>
                  <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: '#0F172A', fontSize: 13, fontWeight: '700' }}>{person.name || 'Participant'}</Text><Text style={{ color: muted, fontSize: 11, marginTop: 2 }}>{[person.category_code, person.chest_number ? `Chest ${person.chest_number}` : null].filter(Boolean).join(' · ')}</Text></View>
                </Pressable>
              );
            })}
            {!generalEligibleParticipants.length ? <Text style={{ paddingVertical: 18, textAlign: 'center', color: muted, fontSize: 13 }}>No eligible students match this program.</Text> : null}
          </ScrollView>
          <View style={{ borderTopWidth: 1, borderTopColor: border, paddingTop: 12, gap: 9 }}>
            <Text style={{ color: generalSelectionError ? '#B91C1C' : muted, fontSize: 12 }}>
              {generalSelectionError || `${selectedGeneralParticipantIds.length} selected · ${activeGeneralProgram?.group_min_members ?? 1} required minimum${Number(activeGeneralProgram?.group_max_members) > 0 ? ` · ${activeGeneralProgram?.group_max_members} maximum` : ''}`}
            </Text>
            <Pressable accessibilityRole="button" disabled={!activeGeneralProgram || selectedGeneralParticipantIds.length < Number(activeGeneralProgram.group_min_members ?? 1) || (Number(activeGeneralProgram.group_max_members) > 0 && selectedGeneralParticipantIds.length > Number(activeGeneralProgram.group_max_members)) || !!savingItemId} onPress={createGeneralEntry} style={{ minHeight: 46, borderRadius: 10, backgroundColor: teal, alignItems: 'center', justifyContent: 'center', opacity: !activeGeneralProgram || selectedGeneralParticipantIds.length < Number(activeGeneralProgram.group_min_members ?? 1) || (Number(activeGeneralProgram.group_max_members) > 0 && selectedGeneralParticipantIds.length > Number(activeGeneralProgram.group_max_members)) || !!savingItemId ? 0.55 : 1 }}>
              {savingItemId === activeGeneralProgram?.item_id ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>Create General team entry</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (contextLoading || participantsLoading) {
    return <TeamLeaderAppShell><View style={{ flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={teal} /></View></TeamLeaderAppShell>;
  }

  return (
    <TeamLeaderAppShell>
      <View style={{ width: '100%', maxWidth: 1320, alignSelf: 'center', gap: 16, paddingBottom: 24 }}>
        <View style={{ padding: isDesktop ? 22 : 16, borderRadius: 16, backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#BFE8E3', borderLeftWidth: 4, borderLeftColor: context?.portal_primary_color || teal }}>
          <Text style={{ color: context?.portal_primary_color || teal, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' }}>Program enrollment</Text>
          <Text style={{ color: '#0F172A', fontSize: isDesktop ? 23 : 20, fontWeight: '800', marginTop: 4 }}>Add programs to your team</Text>
          <Text style={{ color: muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>Assign individual programs or create a General team entry for your students.</Text>
        </View>

        <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8, padding: 4, borderRadius: 11, backgroundColor: '#E2E8F0', alignSelf: 'flex-start' }}>
          {([{ key: 'participant', label: 'Individual' }, { key: 'general_team', label: 'General team' }] as const).map((tab) => {
            const selected = programKind === tab.key;
            return <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setKind(tab.key)} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? '#FFFFFF' : 'transparent', borderWidth: selected ? 1 : 0, borderColor: selected ? border : 'transparent' }}><Text style={{ color: selected ? teal : muted, fontSize: 12, fontWeight: '800' }}>{tab.label}</Text></Pressable>;
          })}
        </View>

        {participantError ? <View style={{ padding: 14, borderRadius: 10, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }}><Text style={{ color: '#B91C1C', fontSize: 13 }}>{participantError}</Text></View> : null}
        {!participantError && participants.length === 0 ? <View style={{ padding: 20, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: '#FFFFFF' }}><Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '700' }}>No students are available</Text><Text style={{ color: muted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>Ask the festival administrator to add students to your team.</Text></View> : null}

        {!participantError && participants.length > 0 ? (
          <View style={{ flexDirection: programKind === 'participant' && isDesktop ? 'row' : 'column', alignItems: 'stretch', gap: 16 }}>
            {programKind === 'participant' && isDesktop ? (
              <View style={{ width: 280, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: '#FFFFFF', gap: 9 }}>
                <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '800', marginBottom: 2 }}>Your students <Text style={{ color: muted, fontSize: 12, fontWeight: '500' }}>({participants.length})</Text></Text>
                <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ gap: 8 }}>
                  {participants.map((person) => personButton(person))}
                </ScrollView>
              </View>
            ) : programKind === 'participant' ? (
              <Pressable accessibilityRole="button" onPress={() => { setParticipantSearch(''); setPickerOpen(true); }} style={{ minHeight: 54, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#99D5D0', borderRadius: 12, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#CCFBF1' }}><UserRound size={17} color={teal} /></View>
                <View style={{ flex: 1 }}><Text style={{ color: muted, fontSize: 10, fontWeight: '700' }}>STUDENT</Text><Text numberOfLines={1} style={{ color: '#0F172A', fontSize: 13, fontWeight: '700', marginTop: 2 }}>{selectedParticipant?.name || 'Choose a student'}</Text></View>
                <ChevronDown size={18} color={teal} />
              </Pressable>
            ) : null}

            <View style={{ flex: 1, minWidth: 0, padding: isDesktop ? 18 : 12, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: '#FFFFFF', gap: 12 }}>
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : 'stretch', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#0F172A', fontSize: 15, fontWeight: '800' }}>{programKind === 'general_team' ? 'General team programs' : selectedParticipant?.name || 'Select a student'}</Text>
                  <Text style={{ color: muted, fontSize: 11, marginTop: 3 }}>{programKind === 'general_team' ? 'Create an entry by selecting eligible students from your team.' : `${selectedParticipant?.category_code || 'Student'}${selectedParticipant?.chest_number ? ` · Chest ${selectedParticipant.chest_number}` : ''}`}</Text>
                </View>
                <View style={{ minHeight: 40, width: isDesktop ? 260 : '100%', borderWidth: 1, borderColor: border, borderRadius: 9, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Search size={15} color={muted} />
                  <TextInput value={programSearch} onChangeText={setProgramSearch} placeholder="Search programs" placeholderTextColor="#94A3B8" style={{ flex: 1, minHeight: 38, color: '#0F172A', fontSize: 12 }} />
                </View>
              </View>

              {notice ? <View style={{ paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, backgroundColor: notice.kind === 'success' ? '#F0FDFA' : '#FEF2F2', borderWidth: 1, borderColor: notice.kind === 'success' ? '#99D5D0' : '#FECACA' }}><Text style={{ color: notice.kind === 'success' ? '#0F766E' : '#B91C1C', fontSize: 12 }}>{notice.text}</Text></View> : null}
              {programsQuery.isLoading ? <View style={{ minHeight: 160, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={teal} /></View> : null}
              {programsQuery.isError ? <View style={{ padding: 14, borderRadius: 10, backgroundColor: '#FEF2F2' }}><Text style={{ color: '#B91C1C', fontSize: 12 }}>{(programsQuery.error as Error).message || 'Unable to load programs.'}</Text></View> : null}
              {!programsQuery.isLoading && !programsQuery.isError && visiblePrograms.length === 0 ? <View style={{ padding: 18, borderRadius: 10, backgroundColor: '#F8FAFC' }}><Text style={{ color: '#0F172A', fontSize: 13, fontWeight: '700' }}>No eligible programs found</Text><Text style={{ color: muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{programSearch ? 'Try a different search.' : programKind === 'general_team' ? 'No active General programs are currently available for this team.' : 'No active individual programs match this student. A registration restriction may also prevent entry.'}</Text></View> : null}
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexDirection: isDesktop ? 'row' : 'column', flexWrap: isDesktop ? 'wrap' : 'nowrap', gap: 9 }}>
                {visiblePrograms.map((program) => programCard(program, isDesktop))}
              </ScrollView>
            </View>
          </View>
        ) : null}
      </View>
      {studentPicker}
      {generalEntryPicker}
    </TeamLeaderAppShell>
  );
}
