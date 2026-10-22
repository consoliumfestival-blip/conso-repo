import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react-native';
import { matchesCompetitionCategory } from '../../core/utils/groupParticipation';
import { invalidateGeneralMembership } from '../../core/utils/invalidateGeneralMembership';
import { GeneralTeamEntry, generalEntryService } from '../../services/generalEntryService';

type Participant = {
  id: string;
  name: string;
  chest_number?: string | null;
  festival_id: string;
  organisation_id?: string | null;
  category_code?: string | null;
  gender?: string | null;
  is_post_hs_religious?: boolean | null;
  status?: string | null;
};

type Props = {
  entry: GeneralTeamEntry;
  festivalId: string;
  participants: Participant[];
  visibleOrganisationIds: Set<string>;
  onClose: () => void;
  onSaved: (message: string) => void;
};

export function GroupRosterEditor({ entry, festivalId, participants, visibleOrganisationIds, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const expectedIds = useMemo(() => entry.members.map(member => member.participant_id), [entry]);
  const [memberIds, setMemberIds] = useState<string[]>(expectedIds);
  const [leaderId, setLeaderId] = useState(entry.group_leader_participant_id ?? expectedIds[0] ?? '');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const eligible = useMemo(() => participants.filter(person =>
    person.festival_id === festivalId && person.organisation_id === entry.organisation_id
      && visibleOrganisationIds.has(entry.organisation_id) && person.status !== 'rejected'
      && matchesCompetitionCategory(String(person.category_code ?? ''), entry.item?.category_codes?.[0] ?? '', person.is_post_hs_religious === true)
      && (!entry.item?.gender || ['both', ''].includes(entry.item.gender.toLowerCase())
        || String(person.gender ?? '').toLowerCase() === entry.item.gender.toLowerCase())
  ), [participants, festivalId, entry, visibleOrganisationIds]);
  const eligibleIds = useMemo(() => new Set(eligible.map(person => person.id)), [eligible]);
  const min = Number(entry.item?.group_min_members ?? 0);
  const max = Number(entry.item?.group_max_members ?? 0);
  const sizeValid = memberIds.length > 0 && (min < 1 || memberIds.length >= min) && (max < 1 || memberIds.length <= max);
  const valid = sizeValid && !!leaderId && memberIds.includes(leaderId) && memberIds.every(id => eligibleIds.has(id));
  const changed = memberIds.length !== expectedIds.length || memberIds.some(id => !expectedIds.includes(id))
    || leaderId !== entry.group_leader_participant_id;
  const choices = useMemo(() => {
    const available = [...eligible];
    for (const member of entry.members) {
      if (!available.some(person => person.id === member.participant_id)) {
        available.push({ id: member.participant_id, name: member.participant?.name ?? 'Unavailable participant',
          chest_number: member.participant?.chest_number, festival_id: festivalId, organisation_id: entry.organisation_id });
      }
    }
    return available.sort((a, b) => Number(memberIds.includes(b.id)) - Number(memberIds.includes(a.id)) || a.name.localeCompare(b.name))
      .filter(person => `${person.name} ${person.chest_number ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  }, [eligible, entry, festivalId, memberIds, search]);

  const toggle = (id: string) => {
    if (!eligibleIds.has(id)) return;
    setMemberIds(ids => {
      if (!ids.includes(id)) return [...ids, id];
      if (leaderId === id) setLeaderId('');
      return ids.filter(memberId => memberId !== id);
    });
    setError('');
  };

  const save = async () => {
    if (!valid || !changed || saving) return;
    setSaving(true);
    setError('');
    try {
      await generalEntryService.updateRoster(entry.id, memberIds, expectedIds, leaderId, entry.group_leader_participant_id);
      await invalidateGeneralMembership(queryClient, festivalId, [...new Set([...expectedIds, ...memberIds])]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['general-team-entries', festivalId] }),
        queryClient.invalidateQueries({ queryKey: ['scheduleRegistrations'] }),
        queryClient.invalidateQueries({ queryKey: ['entrySizes'] }),
        queryClient.invalidateQueries({ queryKey: ['itemRegistrations', entry.item?.id] }),
        queryClient.invalidateQueries({ queryKey: ['participantRegistrations'] }),
      ]);
      onSaved(`Group roster updated. Leader chest: ${participants.find(person => person.id === leaderId)?.chest_number ?? '—'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the group roster.');
    } finally {
      setSaving(false);
    }
  };

  return <Modal visible transparent animationType="fade" onRequestClose={() => !saving && onClose()}>
    <View className="flex-1 justify-center bg-black/40 p-3">
      <View className="mx-auto max-h-[90%] w-full max-w-2xl rounded-xl bg-white p-4">
        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-1"><Text className="font-poppins-bold text-lg text-ui-text">Edit group members</Text>
            <Text className="font-poppins text-xs text-ui-text-muted">{entry.item?.item_name_en ?? entry.item?.item_code} · {entry.organisation?.name ?? 'Team'} · {entry.entry_chest_number}</Text></View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close group editor" disabled={saving} onPress={onClose} className="h-10 w-10 items-center justify-center"><X size={20} color="#475569" /></TouchableOpacity>
        </View>
        <Text className="mb-2 font-poppins text-xs text-ui-text-muted">Choose members from this team, then select one member as leader. The leader chest number identifies the group.</Text>
        <TextInput value={search} onChangeText={setSearch} placeholder="Search name or chest number" className="mb-2 h-10 rounded-lg border border-ui-border px-3 font-poppins text-sm" />
        <ScrollView className="min-h-0 flex-1" keyboardShouldPersistTaps="handled">
          {choices.map(person => {
            const selected = memberIds.includes(person.id);
            const allowed = eligibleIds.has(person.id);
            return <View key={person.id} className="mb-2 flex-row items-center gap-2 rounded-lg border border-ui-border p-2">
              <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: !allowed }} disabled={!allowed || saving} onPress={() => toggle(person.id)} className="min-h-11 min-w-11 flex-1 flex-row items-center gap-2">
                <View className={`h-5 w-5 items-center justify-center rounded border ${selected ? 'border-emerald-700 bg-emerald-700' : 'border-slate-300'}`}>{selected && <Check size={13} color="white" />}</View>
                <View className="flex-1"><Text className="font-poppins-bold text-xs text-ui-text">{person.name}</Text><Text className="font-poppins text-[11px] text-ui-text-muted">{person.chest_number || 'No chest number'}{!allowed ? ' · No longer eligible' : ''}</Text></View>
              </TouchableOpacity>
              {selected && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Choose ${person.name} as group leader`} disabled={saving || !allowed} onPress={() => setLeaderId(person.id)} className={`min-h-10 justify-center rounded-lg border px-3 ${leaderId === person.id ? 'border-emerald-700 bg-emerald-50' : 'border-ui-border'}`}><Text className="font-poppins-bold text-xs text-ui-text">{leaderId === person.id ? 'Leader' : 'Make leader'}</Text></TouchableOpacity>}
            </View>;
          })}
        </ScrollView>
        <Text className="mt-2 font-poppins text-xs text-ui-text-muted">{memberIds.length} selected{min > 0 ? ` · minimum ${min}` : ''}{max > 0 ? ` · maximum ${max}` : ''}</Text>
        {!valid && <Text className="mt-1 font-poppins text-xs text-amber-800">Choose an eligible roster and a leader within the configured group size.</Text>}
        {!!error && <Text className="mt-2 font-poppins text-xs text-red-700">{error}</Text>}
        <View className="mt-3 flex-row justify-end gap-2">
          <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={onClose} className="min-h-11 justify-center rounded-lg border border-ui-border px-4"><Text className="font-poppins-bold text-xs text-ui-text">Cancel</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={!valid || !changed || saving} onPress={save} className={`min-h-11 min-w-28 flex-row items-center justify-center rounded-lg bg-emerald-700 px-4 ${!valid || !changed || saving ? 'opacity-50' : ''}`}>
            {saving ? <ActivityIndicator color="white" /> : <Text className="font-poppins-bold text-xs text-white">Save roster</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>;
}
