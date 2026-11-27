import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Users, List } from 'lucide-react-native';
import { supabase } from '@/core/config/supabase';
import { ui } from '@/constants/designSystem';
import { FestivalViewerPrograms } from '@/components/programs/FestivalViewerPrograms';
import { programReadService } from '@/services/programReadService';

type Row = { id: string; name?: string; item_name_ml?: string; item_code?: string; chest_number?: string; entry_chest_number?: string; category_code?: string; category_codes?: string[]; gender?: string; status?: string; team?: string; participant?: string; item_type?: string; participation_type?: string; entry_kind?: string; members?: { name: string; chest_number: string | null }[] };
type ViewName = 'participants' | 'programs';

export default function FestivalReadonlyPortal() {
  const params = useLocalSearchParams<{ linkId: string }>();
  const linkId = Array.isArray(params.linkId) ? params.linkId[0] : params.linkId;
  const { width } = useWindowDimensions();
  const [pinInput, setPinInput] = useState('');
  const [pin, setPin] = useState('');
  const [tab, setTab] = useState<ViewName>('participants');
  const desktopProgramsTab = width >= 768 && tab === 'programs';
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [details, setDetails] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const requestVersion = React.useRef(0);
  useEffect(() => { requestVersion.current++; setPin(''); setPinInput(''); setRows([]); setSelected(null); setDetails([]); }, [linkId]);
  const fetchRows = React.useCallback(async (credential: string, view: ViewName | 'participant' | 'program', search = '', targetPage = 1, id?: string) => {
    const { data, error: requestError } = await supabase.rpc('festival_readonly_data', { p_link_id: linkId, p_pin: credential, p_view: view, p_search: search, p_page: targetPage, p_id: id ?? null });
    if (requestError) throw new Error(requestError.message);
    if (data?.status === 'locked') throw new Error('Too many incorrect PIN attempts. Try again later.');
    if (data?.status !== 'ok' || !Array.isArray(data.rows)) throw new Error('Invalid link or PIN, or this portal is unavailable.');
    return data.rows as Row[];
  }, [linkId]);
  useEffect(() => {
    if (!pin || !linkId || desktopProgramsTab) return;
    const request = ++requestVersion.current;
    setBusy(true); setError(''); setSelected(null); setDetails([]);
    fetchRows(pin, tab, submitted, page).then(data => { if (request === requestVersion.current) setRows(data); })
      .catch(e => { if (request === requestVersion.current) { setRows([]); setError(e.message); } })
      .finally(() => { if (request === requestVersion.current) setBusy(false); });
    return () => { if (requestVersion.current === request) requestVersion.current = request + 1; };
  }, [pin, linkId, tab, submitted, page, fetchRows, retry, desktopProgramsTab]);
  const openDetails = async (row: Row) => {
    const request = ++requestVersion.current;
    setSelected(row); setDetails([]); setBusy(true); setError('');
    try {
      const data = desktopProgramsTab && row.category_code
        ? await programReadService.viewerProgramDetail(linkId!, pin, row.id, row.category_code)
        : await fetchRows(pin, tab === 'participants' ? 'participant' : 'program', '', 1, row.id);
      if (request === requestVersion.current) setDetails(data);
    }
    catch (e: any) { if (request === requestVersion.current) setError(e.message); }
    finally { if (request === requestVersion.current) setBusy(false); }
  };
  const text = { color: ui.colors.text };
  const button = { minHeight: 44, paddingHorizontal: 14, borderRadius: 9, justifyContent: 'center' as const, alignItems: 'center' as const, backgroundColor: ui.colors.primary };
  if (!pin) return <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: ui.colors.background }}>
    <View style={{ maxWidth: 420, width: '100%', alignSelf: 'center', padding: 20, borderRadius: 14, backgroundColor: ui.colors.surface, gap: 12 }}>
      <Text style={[text, { fontSize: 20, fontWeight: '800' }]}>Festival viewer</Text>
      <Text style={{ color: ui.colors.textMuted }}>Enter the PIN provided by the festival admin.</Text>
      <TextInput accessibilityLabel="Portal PIN" value={pinInput} onChangeText={setPinInput} maxLength={4} keyboardType="number-pad" secureTextEntry placeholder="4-digit PIN" style={{ borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8, minHeight: 44, paddingHorizontal: 12, color: ui.colors.text }} />
      {!!error && <Text accessibilityRole="alert" style={{ color: ui.colors.danger }}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy || !/^\d{4}$/.test(pinInput)} onPress={async () => {
        setBusy(true); setError('');
        try { await fetchRows(pinInput, 'participants'); setPin(pinInput); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
      }} style={[button, { opacity: busy || !/^\d{4}$/.test(pinInput) ? 0.5 : 1 }]}><Text style={{ color: ui.colors.onPrimary, fontWeight: '700' }}>{busy ? 'Checking…' : 'Open portal'}</Text></Pressable>
    </View>
  </View>;
  return <View style={{ flex: 1, backgroundColor: ui.colors.background }}>
    <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, maxWidth: 1100, width: '100%', alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={[text, { fontSize: 20, fontWeight: '800' }]}>Festival viewer</Text><Pressable accessibilityRole="button" onPress={() => { requestVersion.current++; setPin(''); setPinInput(''); setRows([]); setSelected(null); setDetails([]); setError(''); }}><Text style={{ color: ui.colors.primary, padding: 10 }}>Lock</Text></Pressable></View>
      <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>Read-only · All festival teams</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        {(['participants','programs'] as const).map(name => <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => { setTab(name); setQuery(''); setSubmitted(''); setPage(1); setSelected(null); }} style={{ flex: 1, minHeight: 58, borderRadius: 10, borderWidth: 1, borderColor: tab === name ? ui.colors.primary : ui.colors.border, backgroundColor: tab === name ? ui.colors.primary : ui.colors.surface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
          {name === 'participants' ? <Users size={18} color={tab === name ? ui.colors.onPrimary : ui.colors.primary} /> : <List size={18} color={tab === name ? ui.colors.onPrimary : ui.colors.primary} />}
          <Text style={{ color: tab === name ? ui.colors.onPrimary : ui.colors.text, fontWeight: '700' }}>{name === 'participants' ? 'Participants' : 'Programs'}</Text>
        </Pressable>)}
      </View>
      {!selected && !desktopProgramsTab && <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}><TextInput accessibilityLabel={`Search ${tab}`} value={query} onChangeText={setQuery} onSubmitEditing={() => { setPage(1); setSubmitted(query); }} placeholder={`Search ${tab}`} style={{ flex: 1, minWidth: 0, height: 40, paddingHorizontal: 10, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8, backgroundColor: ui.colors.surface, color: ui.colors.text }} /><Pressable accessibilityRole="button" onPress={() => { setPage(1); setSubmitted(query); }} style={button}><Text style={{ color: ui.colors.onPrimary, fontWeight: '700' }}>Search</Text></Pressable></View>}
      {selected && <Pressable accessibilityRole="button" onPress={() => { requestVersion.current++; setSelected(null); setError(''); setBusy(false); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: ui.colors.primary }}>‹ Back to {tab}</Text></Pressable>}
      {!!error && <Text accessibilityRole="alert" style={{ color: ui.colors.danger, marginVertical: 6 }}>{error}</Text>}
      {!!error && <Pressable accessibilityRole="button" onPress={() => selected ? void openDetails(selected) : setRetry(value => value + 1)} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}><Text style={{ color: ui.colors.primary, fontWeight: '700' }}>Retry</Text></Pressable>}
    </View>
    {desktopProgramsTab && !selected ? <FestivalViewerPrograms linkId={linkId!} pin={pin} onOpenProgram={item => { void openDetails(item); }} /> : <ScrollView contentContainerStyle={{ width: '100%', maxWidth: 1100, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 28 }}>
      {busy && <ActivityIndicator color={ui.colors.primary} />}
      {selected ? <>
        <Text style={[text, { fontSize: 17, fontWeight: '700', marginBottom: 10 }]}>{selected.name || selected.item_name_ml || selected.item_code}</Text>
        {!busy && details.length === 0 && !error && <Text style={{ color: ui.colors.textMuted }}>No assigned {tab === 'participants' ? 'programs' : 'entries'} found.</Text>}
        {details.map(row => <View key={row.id} style={{ backgroundColor: ui.colors.surface, padding: 12, borderRadius: 9, borderWidth: 1, borderColor: ui.colors.border, marginBottom: 8 }}>
          <Text style={[text, { fontWeight: '700' }]}>{row.name || row.participant || row.team || 'Group entry'}</Text>
          <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>{[row.item_code, row.team, row.chest_number || row.entry_chest_number, row.status].filter(Boolean).join(' · ')}</Text>
          {row.members?.map((member, index) => <Text key={`${member.chest_number}-${index}`} style={{ color: ui.colors.textMuted, fontSize: 12, marginTop: 4 }}>{member.name}{member.chest_number ? ` · ${member.chest_number}` : ''}</Text>)}
        </View>)}
      </> : <>
        {!busy && rows.length === 0 && !error && <Text style={{ color: ui.colors.textMuted, marginTop: 16 }}>No {tab} found.</Text>}
        {rows.slice(0,30).map(row => <Pressable accessibilityRole="button" key={row.id} onPress={() => void openDetails(row)} style={{ backgroundColor: ui.colors.surface, padding: 12, borderRadius: 9, borderWidth: 1, borderColor: ui.colors.border, marginBottom: 8, minHeight: 58, justifyContent: 'center' }}>
          <Text style={[text, { fontWeight: '700' }]}>{row.name || row.item_name_ml || row.item_code}</Text>
          <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>{[row.chest_number ? `Chest ${row.chest_number}` : null, row.category_code, row.category_codes?.join(', '), row.team, row.item_code, row.participation_type, row.item_type].filter(Boolean).join(' · ')}</Text>
        </Pressable>)}
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: width < 420 ? 'space-between' : 'flex-end', marginTop: 8 }}><Pressable accessibilityRole="button" disabled={page === 1 || busy} onPress={() => setPage(p => p - 1)} style={{ padding: 12, opacity: page === 1 || busy ? 0.4 : 1 }}><Text style={{ color: ui.colors.primary }}>Previous</Text></Pressable><Text style={{ color: ui.colors.textMuted, alignSelf: 'center' }}>Page {page}</Text><Pressable accessibilityRole="button" disabled={rows.length <= 30 || busy} onPress={() => setPage(p => p + 1)} style={{ padding: 12, opacity: rows.length <= 30 || busy ? 0.4 : 1 }}><Text style={{ color: ui.colors.primary }}>Next</Text></Pressable></View>
      </>}
    </ScrollView>}
  </View>;
}
