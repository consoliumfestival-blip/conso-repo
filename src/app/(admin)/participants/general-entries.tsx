import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Search, Users } from 'lucide-react-native';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfCard } from '../../../components/ui/SsfCard';
import { useAuthStore } from '../../../core/store/authStore';
import { useFestival } from '../../../core/hooks/useFestival';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { formatGeneralEntryError, generalEntryService, getGeneralTeamSelectionError } from '../../../services/generalEntryService';
import { invalidateGeneralMembership } from '../../../core/utils/invalidateGeneralMembership';

type GeneralItem = {
  id: string;
  item_code: string;
  item_name_en: string;
  is_active?: boolean | null;
  category_codes?: string[] | null;
  participation_type?: string | null;
  group_min_members?: number | null;
  group_max_members?: number | null;
};

export default function GeneralEntriesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { role, is_superadmin } = useAuthStore();
  const { useActiveFestival, useItems } = useFestival();
  const { data: festival, isLoading: festivalLoading } = useActiveFestival();
  const { data: allItems = [], isLoading: itemsLoading } = useItems(festival?.id);
  const { participants, isLoadingList: participantsLoading } = useParticipants();
  const [itemId, setItemId] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const entriesQuery = useQuery({
    queryKey: ['general-team-entries', festival?.id],
    queryFn: () => generalEntryService.list(festival!.id),
    enabled: !!festival?.id && festival?.general_category_enabled === true,
  });

  const generalItems = useMemo(() => (allItems as GeneralItem[]).filter(item => {
    const categories = (item.category_codes ?? []).map(code => code.trim().toUpperCase());
    return item.is_active === true && categories.length === 1 && ['GN', 'GENERAL'].includes(categories[0])
      && item.participation_type?.toLowerCase() === 'group';
  }), [allItems]);
  const selectedItem = generalItems.find(item => item.id === itemId) ?? null;
  const festivalParticipants = useMemo(() => (participants as any[]).filter(p =>
    p.festival_id === festival?.id && p.id && p.organisation_id && p.status !== 'rejected'
      && (p.category_code ?? '').toUpperCase() !== 'GN' && (p.category_code ?? '').toUpperCase() !== 'GENERAL'
  ), [participants, festival?.id]);
  const selectedParticipants = festivalParticipants.filter(p => participantIds.includes(p.id));
  const organisationIds = [...new Set(selectedParticipants.map(p => p.organisation_id))];
  const minMembers = Number(selectedItem?.group_min_members ?? 0);
  const maxMembers = Number(selectedItem?.group_max_members ?? 0);
  const selectionError = selectedItem ? getGeneralTeamSelectionError({
    selectedCount: selectedParticipants.length,
    organisationCount: organisationIds.length,
    minMembers,
    maxMembers,
  }) : null;
  const canCreate = !!festival && !!selectedItem && selectedParticipants.length > 0 && !selectionError && !saving;

  const filteredItems = generalItems.filter(item =>
    `${item.item_code} ${item.item_name_en}`.toLowerCase().includes(itemSearch.trim().toLowerCase()));
  const filteredParticipants = festivalParticipants.filter(p =>
    `${p.name ?? ''} ${p.chest_number ?? ''}`.toLowerCase().includes(participantSearch.trim().toLowerCase()));

  const toggleParticipant = (id: string) => {
    setErrorMessage(''); setSuccessMessage('');
    setParticipantIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  };

  const createEntry = async () => {
    if (!festival || !selectedItem || !canCreate) return;
    setSaving(true); setErrorMessage(''); setSuccessMessage('');
    try {
      const result = await generalEntryService.create(festival.id, selectedItem.id, participantIds);
      setSuccessMessage(`Entry ${result.entry_chest_number} created for ${selectedParticipants.length} members.`);
      setParticipantIds([]); setItemId('');
      await invalidateGeneralMembership(queryClient, festival.id, participantIds);
      await queryClient.invalidateQueries({ queryKey: ['scheduleRegistrations'] });
      await queryClient.invalidateQueries({ queryKey: ['participantRegistrations'] });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create the General entry.');
    } finally { setSaving(false); }
  };

  if (role !== 'admin' && !is_superadmin) return <View className="flex-1 p-5"><Text>Administrator access is required.</Text></View>;
  if (festivalLoading || itemsLoading || participantsLoading) return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  if (!festival) return <View className="flex-1 p-5"><Text className="font-poppins text-ui-text">Select or activate a festival before creating entries.</Text></View>;
  if (festival.general_category_enabled !== true) return <View className="flex-1 bg-ssf-bg p-4"><SsfCard>
    <Text className="font-poppins-bold text-ui-text">General category is disabled for this festival.</Text>
  </SsfCard></View>;

  return <ScrollView className="flex-1 bg-ssf-bg p-4" contentContainerStyle={{ paddingBottom: 32 }}>
    <View className="mb-4 flex-row items-center gap-3">
      <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-xl border border-ui-border bg-white" accessibilityRole="button" accessibilityLabel="Go back">
        <ArrowLeft size={18} color="#334155" />
      </TouchableOpacity>
      <View><Text className="font-poppins-black text-2xl text-ui-text">General Entries</Text>
        <Text className="font-poppins text-xs text-ui-text-muted">Create a team entry with its own General chest number.</Text></View>
    </View>

    <SsfCard>
      <Text className="mb-2 font-poppins-bold text-base text-ui-text">New team entry</Text>
      <Text className="mb-2 font-poppins-bold text-xs text-ui-text">General competition</Text>
      <View className="mb-2 h-10 flex-row items-center rounded-lg border border-ui-border bg-white px-3">
        <Search size={15} color="#64748B" /><TextInput value={itemSearch} onChangeText={setItemSearch} placeholder="Search General competitions" className="ml-2 flex-1 font-poppins text-sm outline-none" />
      </View>
      <View className="mb-4 max-h-44 gap-y-1">
        {filteredItems.length ? filteredItems.map(item => {
          const active = itemId === item.id;
          return <TouchableOpacity key={item.id} onPress={() => { setItemId(item.id); setErrorMessage(''); }} className={`rounded-lg border px-3 py-2 ${active ? 'border-emerald-500 bg-emerald-50' : 'border-ui-border bg-white'}`}>
            <Text className="font-poppins-bold text-sm text-ui-text">{item.item_name_en}</Text>
            <Text className="font-poppins text-xs text-ui-text-muted">{item.item_code} · configured group size {item.group_min_members ?? '—'}{item.group_max_members && item.group_max_members !== item.group_min_members ? `–${item.group_max_members}` : ''}</Text>
          </TouchableOpacity>;
        }) : <Text className="py-3 font-poppins text-xs text-ui-text-muted">No active General group competitions with configured member sizes.</Text>}
      </View>

      <View className="mb-2 flex-row items-center justify-between">
        <Text className="font-poppins-bold text-xs text-ui-text">Team roster (required)</Text>
        <Text className="font-poppins-bold text-xs text-emerald-700">{participantIds.length} selected</Text>
      </View>
      <Text className="mb-2 font-poppins text-xs text-ui-text-muted">Choose participants from one team. Their participant chest numbers stay unchanged; this entry receives a separate number.</Text>
      <View className="mb-2 h-10 flex-row items-center rounded-lg border border-ui-border bg-white px-3">
        <Search size={15} color="#64748B" /><TextInput value={participantSearch} onChangeText={setParticipantSearch} placeholder="Search by child name or chest number" className="ml-2 flex-1 font-poppins text-sm outline-none" />
      </View>
      <View className="max-h-72 gap-y-1">
        {filteredParticipants.length ? filteredParticipants.map(p => {
          const active = participantIds.includes(p.id);
          return <TouchableOpacity key={p.id} onPress={() => toggleParticipant(p.id)} className={`flex-row items-center rounded-lg border px-3 py-2 ${active ? 'border-emerald-500 bg-emerald-50' : 'border-ui-border bg-white'}`}>
            <View className={`mr-3 h-5 w-5 items-center justify-center rounded border ${active ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white'}`}>{active && <Check size={13} color="white" />}</View>
            <View className="flex-1"><Text className="font-poppins-bold text-sm text-ui-text">{p.name}</Text><Text className="font-poppins text-xs text-ui-text-muted">Chest #{p.chest_number ?? '—'} · {p.organisations?.name ?? 'Team not set'}</Text></View>
            <Users size={15} color="#64748B" />
          </TouchableOpacity>;
        }) : <Text className="py-3 font-poppins text-xs text-ui-text-muted">No eligible participants found in this festival.</Text>}
      </View>
      {participantIds.length > 0 && selectedItem && selectionError && <Text className="mt-2 font-poppins text-xs text-amber-700">{selectionError}</Text>}
      {!!errorMessage && <Text className="mt-3 font-poppins text-xs text-red-700">{errorMessage}</Text>}
      {!!successMessage && <Text className="mt-3 font-poppins text-xs text-emerald-700">{successMessage}</Text>}
      <View className="mt-4 self-start"><SsfButton label={saving ? 'Creating…' : 'Create General Entry'} onPress={createEntry} disabled={!canCreate} /></View>
    </SsfCard>

    <View className="mt-5 flex-row items-center justify-between"><Text className="font-poppins-bold text-lg text-ui-text">Existing entries</Text>
      <Text className="font-poppins text-xs text-ui-text-muted">{entriesQuery.data?.length ?? 0}</Text></View>
    {entriesQuery.isLoading ? <View className="p-5"><ActivityIndicator /></View>
      : entriesQuery.error ? <SsfCard><Text className="font-poppins text-xs text-red-700">{formatGeneralEntryError(entriesQuery.error, 'load')}</Text></SsfCard>
      : !entriesQuery.data?.length ? <SsfCard><Text className="font-poppins text-xs text-ui-text-muted">No General team entries yet.</Text></SsfCard>
      : entriesQuery.data.map(entry => <SsfCard key={entry.id} className="mt-2">
        <View className="flex-row items-start justify-between gap-3"><View className="flex-1">
          <Text className="font-poppins-bold text-sm text-ui-text">{entry.item?.item_name_en ?? 'General competition'}</Text>
          <Text className="font-poppins text-xs text-ui-text-muted">{entry.organisation?.name ?? 'Team'} · {entry.members?.length ?? 0} members</Text>
        </View><Text className="font-poppins-bold text-sm text-emerald-700">{entry.entry_chest_number}</Text></View>
        <Text className="mt-2 font-poppins text-xs text-ui-text-muted">{(entry.members ?? []).map(m => m.participant?.name).filter(Boolean).join(', ') || 'Roster unavailable'}</Text>
      </SsfCard>)}
  </ScrollView>;
}
