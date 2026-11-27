import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Clipboard, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/core/config/supabase';
import { ui } from '@/constants/designSystem';
import { getCurrentOriginAppUrl } from '@/core/utils/appUrls';
import { PortalManagementPageLoading } from '@/components/layout/PortalManagementPage';

type Entry = { item_id: string; queue_position: number; announced_at: string | null };
type Item = { id: string; name: string; item_code?: string | null; category_codes?: string[] };
type Team = { id: string; name: string };
type Props = { tenantId: string; festivalId: string; userId: string };
type SuspenseMode = 'very_small' | 'small' | 'medium' | 'high' | 'auto';
const modeLimits: Record<Exclude<SuspenseMode, 'auto'>, number> = { very_small: 5, small: 10, medium: 25, high: 50 };
const modeLabels: Record<SuspenseMode, string> = { very_small: 'Very Small · 5', small: 'Small · 10', medium: 'Medium · 25', high: 'High · 50', auto: 'Auto · closest found' };
type TeamStrategy = { batch_size: number; batch_spread: number; minimum_batch_spread: number | null; minimum_team_first_spread: number | null; mode_met: boolean; available_modes: Record<SuspenseMode, boolean>; items: { item_id: string; team_rank: number; team_points: number; leader_gap: number; spread: number; max_adjacent_gap: number; target_is_first: boolean; target_tied_first: boolean; point_deltas: { organisation_id: string; points: number }[]; standings: { organisation_id: string; total_points: number; projected_rank: number }[] }[]; candidate_count: number; target_reaches_first: boolean; target_first_step: number | null; target_is_first_at_batch_end: boolean; target_tied_first_at_batch_end: boolean; lookahead_steps: number; lookahead_target_first_checkpoints: number; lookahead_max_spread: number; lookahead_first_step: number | null; search_width: number; selection_note: string; schedules: { item_id: string; start_time: string | null; venue: string | null }[] };

export function AnnouncerQueue({ tenantId, festivalId, userId }: Props) {
  const client = useQueryClient();
  const key = ['smart-announcer-admin-queue', userId, tenantId, festivalId];
  const [selected, setSelected] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [teamId, setTeamId] = useState('');
  const [batchSize, setBatchSize] = useState<5 | 10>(5);
  const [mode, setMode] = useState<SuspenseMode>('very_small');
  const [fallbackFromMode, setFallbackFromMode] = useState<SuspenseMode | null>(null);
  const [priority, setPriority] = useState<'team' | 'spread'>('team');
  const [choosePriority, setChoosePriority] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [manualOrder, setManualOrder] = useState(false);
  const [pointDetailsId, setPointDetailsId] = useState<string | null>(null);
  const initializedTeam = useRef('');
  const [confirmClose, setConfirmClose] = useState(false);
  const session = useQuery({ queryKey: ['announcer-session', userId, tenantId, festivalId], queryFn: async () => {
    const { data, error } = await supabase.rpc('smart_announcer_session_admin', { p_tenant_id: tenantId, p_festival_id: festivalId });
    if (error) throw error;
    return data as { id: string; token: string } | null;
  }});
  useEffect(() => { setToken(session.data?.token ?? null); }, [session.data]);
  const queue = useQuery({ queryKey: key, refetchInterval: 30000, queryFn: async () => {
    const { data, error } = await supabase.rpc('smart_announcer_admin_queue', { p_tenant_id: tenantId, p_festival_id: festivalId });
    if (error) throw error;
    return (data || []) as Entry[];
  }});
  const teams = useQuery({
    queryKey: ['smart-announcer-teams', tenantId, festivalId, userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('smart_announcer_teams', { p_tenant_id: tenantId, p_festival_id: festivalId });
      if (error) throw error;
      return (data || []) as Team[];
    },
  });
  const candidates = useQuery({
    queryKey: ['smart-announcer-team-candidates', userId, tenantId, festivalId, teamId],
    enabled: !!teamId,
    refetchInterval: 30000,
    queryFn: async () => {
      const pageLimit = 500;
      let pageSize = pageLimit;
      for (;;) {
        const all: Item[] = [];
        let offset = 0;
        let total: number | null = null;
        let hasMore = true;
        let restartWithSmallerPage = false;
        do {
          const { data, error, count } = await supabase.rpc('smart_announcer_team_candidates', {
            p_tenant_id: tenantId, p_festival_id: festivalId, p_team_id: teamId,
          }, { count: 'exact' }).range(offset, offset + pageSize - 1);
          if (error) throw error;
          const page = (data || []) as Item[];
          if (count !== null) total = count;
          if (page.length === 0 && total !== null && offset < total) throw new Error('Candidate results pagination returned an empty page before completion.');
          if (page.length < pageSize && total !== null && offset + page.length < total) {
            pageSize = page.length;
            restartWithSmallerPage = true;
            break;
          }
          all.push(...page);
          offset += page.length;
          hasMore = total === null ? page.length === pageSize : offset < total;
        } while (hasMore);
        if (restartWithSmallerPage) continue;
        return [...new Map(all.map(item => [item.id, item])).values()];
      }
    },
  });
  const strategy = useQuery({
    queryKey: ['smart-announcer-team-strategy', userId, tenantId, festivalId, teamId, batchSize, mode, priority],
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('smart_announcer_batch_preview_v2', {
        p_tenant_id: tenantId, p_festival_id: festivalId, p_team_id: teamId,
        p_batch_size: batchSize, p_mode: mode, p_priority: priority,
      });
      if (error) throw error;
      return data as TeamStrategy;
    },
  });
  useEffect(() => {
    if (mode !== 'auto' && strategy.data?.items.length && strategy.data.available_modes?.[mode] === false) {
      setFallbackFromMode(mode);
      setMode('auto');
      setPriority('team');
      setManualOrder(false);
    }
  }, [mode, strategy.data]);
  const preview = useQuery({ queryKey: ['announcer-manual-preview', userId, tenantId, festivalId, teamId, batchSize, mode, priority, selected],
    enabled: !!teamId && selected.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('smart_announcer_batch_preview_v2', { p_tenant_id: tenantId, p_festival_id: festivalId, p_team_id: teamId, p_item_ids: selected, p_batch_size: batchSize, p_mode: mode, p_priority: priority });
      if (error) throw error;
      return data as TeamStrategy;
    },
  });
  useEffect(() => {
    if (teamId && candidates.data && strategy.data) {
      if (initializedTeam.current !== teamId) {
        initializedTeam.current = teamId;
        setManualOrder(false);
        setSelected(strategy.data.items.map(item => item.item_id));
      } else {
        const eligible = new Set(candidates.data.map(item => item.id));
        const suggested = strategy.data.items.map(item => item.item_id).filter(id => eligible.has(id));
        setSelected(current => {
          if (!manualOrder) return suggested;
          const retained = current.filter(id => eligible.has(id));
          const next = [...retained];
          for (const id of suggested) if (!next.includes(id) && next.length < batchSize) next.push(id);
          return next;
        });
      }
    }
  }, [teamId, candidates.data, strategy.data, manualOrder, batchSize]);
  useEffect(() => { setPin(null); setSelected([]); }, [userId, tenantId, festivalId]);
  const save = useMutation({ mutationFn: async (confirmCapOverride: boolean) => {
    const { error } = await supabase.rpc('smart_announcer_send_batch_v2', { p_tenant_id: tenantId, p_festival_id: festivalId, p_team_id: teamId, p_item_ids: selected, p_batch_size: batchSize, p_mode: mode, p_priority: priority, p_confirm_cap_override: confirmCapOverride });
    if (error) throw error;
  }, onSuccess: async () => {
    setMessage('Results sent to the announcer.');
    initializedTeam.current = '';
    setSelected([]);
    await Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: ['smart-announcer-team-strategy'] }),
      client.invalidateQueries({ queryKey: ['smart-announcer-team-candidates'] }),
      client.invalidateQueries({ queryKey: ['smart-announcer-teams'] }),
    ]);
  }, onError: () => setMessage('Unable to save the queue. Refresh team results and retry.') });
  const issue = async () => {
    if (credentialBusy) return;
    setCredentialBusy(true);
    setMessage(null); setToken(null); setPin(null);
    try {
      const { data, error } = await supabase.rpc('smart_announcer_session_admin', { p_tenant_id: tenantId, p_festival_id: festivalId, p_action: 'create' });
      if (error || !data?.token) { setMessage('Unable to create the announcer session.'); return; }
      setToken(data.token); setPin(data.pin ?? null);
      await session.refetch();
    } catch { setMessage('Unable to create a PIN-protected link.'); }
    finally { setCredentialBusy(false); }
  };
  const revoke = async () => {
    if (credentialBusy) return;
    setCredentialBusy(true);
    try {
      const { error } = await supabase.rpc('smart_announcer_session_admin', { p_tenant_id: tenantId, p_festival_id: festivalId, p_action: 'close' });
      if (!error) { setToken(null); setPin(null); }
      setConfirmClose(false);
      await session.refetch();
      setMessage(error ? 'Unable to close session.' : 'Announcer session closed.');
    } catch { setMessage('Unable to revoke links.'); }
    finally { setCredentialBusy(false); }
  };
  const announced = new Set(queue.data?.filter(item => item.announced_at).map(item => item.item_id) || []);
  const pending = queue.data?.filter(item => !item.announced_at).length ?? 0;
  const lastPending = useRef(pending);
  useEffect(() => {
    if (lastPending.current > 0 && pending === 0) {
      initializedTeam.current = '';
      void candidates.refetch();
      void strategy.refetch();
    }
    lastPending.current = pending;
  }, [pending, candidates, strategy]);
  const move = (id: string, direction: number) => {
    setManualOrder(true);
    setSelected(previous => {
      const next = [...previous], index = next.indexOf(id), target = index + direction;
      if (index < 0 || target < 0 || target >= next.length) return previous;
      [next[index], next[target]] = [next[target], next[index]]; return next;
    });
  };
  const visibleItems = (candidates.data ?? []).filter(item =>
    `${item.name} ${item.item_code ?? ''} ${(item.category_codes ?? []).join(' ')}`
      .toLocaleLowerCase().includes(candidateSearch.trim().toLocaleLowerCase())
  );
  const selectedPreviews = new Map((preview.data?.items ?? []).map(item => [item.item_id, item]));
  const selectTeam = (id: string) => {
    initializedTeam.current = '';
    setManualOrder(false);
    setCandidateSearch('');
    setPointDetailsId(null);
    setTeamId(id);
    setSelected([]);
  };
  const copy = async (value: string) => {
    try {
      if (Platform.OS === 'web' && globalThis.navigator?.clipboard) await globalThis.navigator.clipboard.writeText(value);
      else Clipboard.setString(value);
      setMessage('Copied.');
    } catch { setMessage('Copy failed. Select the text to copy it.'); }
  };
  const link = token ? getCurrentOriginAppUrl(`/announcer/session/${token}`) : null;
  if (queue.isLoading) return <PortalManagementPageLoading section />;
  return <View style={{ backgroundColor: ui.colors.surface, borderColor: ui.colors.border, borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 14, gap: 10 }}>
    <Text style={{ color: ui.colors.text, fontWeight: '700', fontSize: 16 }}>Announcer setup</Text>
    <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>{token ? 'Session active until you close it' : 'Create a session to share announcer access'} · {pending} pending · {announced.size} announced</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 120 }}><Text style={{ color: ui.colors.textMuted }}>Results per batch</Text><Picker accessibilityLabel="Results per batch" selectedValue={batchSize} onValueChange={(value: 5 | 10) => { setBatchSize(value); setSelected([]); setManualOrder(false); }}><Picker.Item label="5 results" value={5} /><Picker.Item label="10 results" value={10} /></Picker></View>
      <View style={{ flex: 2, minWidth: 190 }}><Text style={{ color: ui.colors.textMuted }}>Suspense · first to last team</Text><Picker accessibilityLabel="Suspense mode" selectedValue={mode} onValueChange={(value: SuspenseMode) => { setMode(value); setFallbackFromMode(null); setPriority('team'); setChoosePriority(false); }}>{(Object.keys(modeLabels) as SuspenseMode[]).map(value => <Picker.Item key={value} label={modeLabels[value]} value={value} />)}</Picker></View>
    </View>
    {strategy.data && <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>{strategy.data.candidate_count} eligible results considered · projected batch spread {strategy.data.batch_spread} points{mode === 'auto' ? '' : ' · limit ' + modeLimits[mode] + ' points'}</Text>}
    {mode === 'auto' && fallbackFromMode && <Text accessibilityRole="alert" style={{ color: ui.colors.textMuted, fontSize: 12 }}>No order was found within {modeLimits[fallbackFromMode as Exclude<SuspenseMode, 'auto'>]} points. Auto is now using the closest spread found for this batch.</Text>}
    {mode !== 'auto' && strategy.data && !strategy.data.available_modes?.[mode] && <Text accessibilityRole="alert" style={{ color: ui.colors.danger }}>No order within this limit was found in the bounded search. Other modes with a found order: {(Object.keys(modeLabels) as SuspenseMode[]).filter(value => value !== 'auto' && strategy.data!.available_modes?.[value]).map(value => modeLabels[value]).join(', ') || 'none; Auto remains available'}. You can also review a manual selection.</Text>}
    {session.isError && <Text accessibilityRole="alert" style={{ color: ui.colors.danger }}>Unable to load session. <Text onPress={() => void session.refetch()}>Retry</Text></Text>}
    <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>Choose the team to prioritize. Review the system&apos;s next results, then send them to the announcer. Announcing does not publish results.</Text>
    {queue.error ? <Pressable onPress={() => void queue.refetch()}><Text style={{ color: ui.colors.danger }}>Queue unavailable. Tap to retry.</Text></Pressable> : <>
      <Picker accessibilityLabel="Festival team" enabled={!save.isPending && teams.isSuccess} selectedValue={teamId} onValueChange={selectTeam}>
        <Picker.Item label="Choose a team" value="" />
        {teams.data?.map(team => <Picker.Item key={team.id} label={team.name} value={team.id} />)}
      </Picker>
      {teams.isLoading && <ActivityIndicator color={ui.colors.primary} />}
      {teams.isError && <Pressable onPress={() => void teams.refetch()}><Text style={{ color: ui.colors.danger }}>Unable to load teams. Tap to retry.</Text></Pressable>}
      {teams.isSuccess && teams.data.length === 0 && <Text style={{ color: ui.colors.textMuted }}>No teams found for this festival.</Text>}
      {!!teamId && <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>The system selects an order that gets this team to first place as early as available results allow, then keeps the standings close. You can review or adjust the suggested order below.</Text>}
      {!!teamId && candidates.isLoading && <ActivityIndicator color={ui.colors.primary} />}
      {!!teamId && candidates.isError && <Pressable onPress={() => void candidates.refetch()}><Text style={{ color: ui.colors.danger }}>Unable to load team results. Tap to retry.</Text></Pressable>}
      {!!teamId && candidates.isSuccess && candidates.data.length === 0 && <Text style={{ color: ui.colors.textMuted }}>No unpublished eligible results remain for this festival.</Text>}
      {!!teamId && <Pressable accessibilityRole="button" disabled={candidates.isFetching || strategy.isFetching} onPress={() => { void candidates.refetch(); void strategy.refetch(); void queue.refetch(); }}><Text style={{ color: ui.colors.primary }}>Refresh team results</Text></Pressable>}
      {!!teamId && strategy.isLoading && <ActivityIndicator color={ui.colors.primary} />}
      {!!teamId && strategy.isError && <Text accessibilityRole="alert" style={{ color: ui.colors.danger }}>Unable to calculate suggestions. Refresh team results.</Text>}
      {!!teamId && strategy.data && <Pressable accessibilityRole="button" disabled={save.isPending || strategy.isFetching} onPress={() => { setManualOrder(false); setSelected(strategy.data!.items.map(item => item.item_id)); }}><Text style={{ color: ui.colors.primary }}>Use suggested order</Text></Pressable>}
      {!!teamId && strategy.data && <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>{strategy.data.target_reaches_first ? `The selected team ${strategy.data.items.find(item => item.target_is_first)?.target_tied_first ? 'shares first place' : 'reaches first place'} at position ${strategy.data.target_first_step}.` : 'The selected team does not reach first place within this batch based on available results.'} {strategy.data.target_is_first_at_batch_end ? strategy.data.target_tied_first_at_batch_end ? 'It shares first place at the end of this batch.' : 'It remains first at the end of this batch.' : `Projected spread at batch end: ${strategy.data.items.at(-1)?.spread ?? 0} points.`}</Text>}
      {!!teamId && strategy.data && strategy.data.lookahead_steps > 0 && <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>Looking ahead at {strategy.data.lookahead_steps} more available results: the selected team is projected first at {strategy.data.lookahead_target_first_checkpoints} checkpoints; widest projected spread is {strategy.data.lookahead_max_spread} points. This is recalculated after the current batch.</Text>}
      {!!teamId && strategy.data?.selection_note && <Text style={{ color: ui.colors.textMuted, fontSize: 11 }}>{strategy.data.selection_note}</Text>}
      {!!teamId && candidates.isSuccess && candidates.data.length > 0 && <TextInput accessibilityLabel="Search eligible results" value={candidateSearch} onChangeText={setCandidateSearch} placeholder="Search results by name, code, or category" placeholderTextColor={ui.colors.textMuted} style={{ minHeight: 40, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8, paddingHorizontal: 10, color: ui.colors.text, fontSize: 13 }} />}
      <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled contentContainerStyle={{ gap: 8 }}>
        {visibleItems.map(item => {
          const checked = selected.includes(item.id);
          return <View key={item.id} style={{ borderWidth: 1, borderRadius: 8, padding: 10, backgroundColor: checked ? ui.colors.primarySoft : ui.colors.surface, borderColor: checked ? ui.colors.primary : ui.colors.border }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} aria-checked={checked} style={{ minHeight: 32, justifyContent: 'center' }} onPress={() => { setManualOrder(true); setSelected(current => checked ? current.filter(id => id !== item.id) : current.length >= batchSize ? current : [...current, item.id]); }}>
              <Text style={{ color: ui.colors.text }}>{checked ? '☑ ' : '☐ '}{item.name}</Text>
            </Pressable>
            {(item.item_code || item.category_codes?.length) ? <Text style={{ color: ui.colors.textMuted, marginTop: 4 }}>{[item.item_code, item.category_codes?.join(', ')].filter(Boolean).join(' · ')}</Text> : null}
          </View>;
        })}
        {!!teamId && candidates.isSuccess && visibleItems.length === 0 && <Text style={{ color: ui.colors.textMuted, padding: 10 }}>No results match this search.</Text>}
      </ScrollView>
      {selected.map((id, index) => {
        const itemPreview = selectedPreviews.get(id);
        return <View key={id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <View style={{ flex: 1, minWidth: 160 }}>
            <Text style={{ color: ui.colors.text }}>{index + 1}. {candidates.data?.find(item => item.id === id)?.name || 'Unavailable item'}</Text>
            {preview.data?.schedules.filter(schedule => schedule.item_id === id).map((schedule, scheduleIndex) => <Text key={scheduleIndex} style={{ color: ui.colors.textMuted, fontSize: 12 }}>{schedule.venue || 'Venue pending'} · {schedule.start_time ? new Date(schedule.start_time).toLocaleString() : 'Time pending'}</Text>)}
            {itemPreview && <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>Projected team rank #{itemPreview.team_rank} · {itemPreview.team_points} points · spread {itemPreview.spread}</Text>}
            {itemPreview && <Pressable accessibilityRole="button" accessibilityState={{ expanded: pointDetailsId === id }} onPress={() => setPointDetailsId(pointDetailsId === id ? null : id)}><Text style={{ color: ui.colors.primary, paddingVertical: 5 }}>Points by team</Text></Pressable>}
            {pointDetailsId === id && itemPreview?.point_deltas.map(delta => <Text key={delta.organisation_id} style={{ color: ui.colors.textMuted, fontSize: 12 }}>{teams.data?.find(team => team.id === delta.organisation_id)?.name || 'Team'} · {delta.points >= 0 ? '+' : ''}{delta.points} pts</Text>)}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Move up" onPress={() => move(id, -1)}><Text style={{ color: ui.colors.primary, padding: 12 }}>↑</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Move down" onPress={() => move(id, 1)}><Text style={{ color: ui.colors.primary, padding: 12 }}>↓</Text></Pressable>
        </View>;
      })}
      {preview.isError && <Text accessibilityRole="alert" style={{ color: ui.colors.danger }}>Selection is no longer eligible. Refresh team results.</Text>}
      {preview.data?.items.at(-1)?.standings.map(projectedTeam => <Text key={projectedTeam.organisation_id} style={{ color: ui.colors.textMuted, fontSize: 12 }}>After this batch: #{projectedTeam.projected_rank} {teams.data?.find(team => team.id === projectedTeam.organisation_id)?.name || 'Team'} · {projectedTeam.total_points} points</Text>)}
      <Modal visible={choosePriority} transparent animationType="fade" onRequestClose={() => setChoosePriority(false)}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: ui.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: ui.colors.border, padding: 18, gap: 12, maxWidth: 440, width: '100%', alignSelf: 'center' }}>
            <Text style={{ color: ui.colors.text, fontWeight: '700', fontSize: 16 }}>Choose priority for this batch</Text>
            <Text style={{ color: ui.colors.text }}>This selected order exceeds the suspense limit. Choose whether to send this order for the selected team or search for a closer order.</Text>
            <Pressable accessibilityRole="button" onPress={() => { setPriority('team'); setChoosePriority(false); save.mutate(true); }}><Text style={{ color: ui.colors.primary, paddingVertical: 8 }}>Prioritize selected team</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { setPriority('spread'); setChoosePriority(false); setManualOrder(false); }}><Text style={{ color: ui.colors.primary, paddingVertical: 8 }}>Search for a closer order</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setChoosePriority(false)}><Text style={{ color: ui.colors.textMuted, paddingVertical: 8 }}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
      {!!teamId && <Text style={{ color: ui.colors.textMuted }}>{pending > 0 ? 'Wait for the current batch to finish before sending the next batch.' : 'Review the next batch, then send it to the active announcer session.'}</Text>}
      {mode !== 'auto' && priority === 'spread' && preview.data && !preview.data.mode_met && <Text accessibilityRole="alert" style={{ color: ui.colors.danger }}>This order exceeds the selected limit. Adjust the results or choose another mode.</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><Pressable accessibilityRole="button" disabled={save.isPending || !token || pending > 0 || !teamId || selected.length === 0 || !preview.data || preview.isFetching || preview.isError || candidates.isError || (mode !== 'auto' && priority === 'spread' && !preview.data?.mode_met)} onPress={() => { if (mode !== 'auto' && preview.data && !preview.data.mode_met && priority === 'team') setChoosePriority(true); else save.mutate(false); }}><Text style={{ color: ui.colors.primary, fontWeight: '700', paddingVertical: 12 }}>{save.isPending ? 'Sending…' : 'Send to Announcer'}</Text></Pressable>{!token && <Pressable accessibilityRole="button" disabled={credentialBusy || session.isLoading} onPress={() => void issue()}><Text style={{ color: ui.colors.primary, fontWeight: '700', paddingVertical: 12 }}>Create session</Text></Pressable>}{token && <Pressable accessibilityRole="button" disabled={credentialBusy} onPress={() => setConfirmClose(true)}><Text style={{ color: ui.colors.danger, fontWeight: '700', paddingVertical: 12 }}>Close session</Text></Pressable>}</View>
      {confirmClose && <View style={{ gap: 8 }}><Text style={{ color: ui.colors.text }}>Close this session and remove access from all announcer devices?</Text><Pressable accessibilityRole="button" disabled={credentialBusy} onPress={() => void revoke()}><Text style={{ color: ui.colors.danger, paddingVertical: 12 }}>Confirm close</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setConfirmClose(false)}><Text style={{ color: ui.colors.primary, paddingVertical: 12 }}>Cancel</Text></Pressable></View>}
      {link && <View style={{ gap: 6 }}>
        <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>Announcer link · active until closed by Admin</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput accessibilityLabel="Announcer link" value={link} editable={false} selectTextOnFocus style={{ flex: 1, minWidth: 0, minHeight: 40, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8, paddingHorizontal: 10, color: ui.colors.text, fontSize: 12 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Copy link" onPress={() => void copy(link)} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: ui.colors.primary }}><Text style={{ color: ui.colors.onPrimary, fontWeight: '700' }}>Copy</Text></Pressable>
        </View>
      </View>}
      {token && !link && <Text style={{ color: ui.colors.danger }}>Unable to determine the app link address.</Text>}
      {pin && <Text selectable style={{ color: ui.colors.text, fontWeight: '700' }}>PIN: {pin} (shown once; copy it now)</Text>}
      {pin && <Pressable accessibilityRole="button" onPress={() => void copy(pin)}><Text style={{ color: ui.colors.primary }}>Copy PIN</Text></Pressable>}
    </>}
    {message && <Text accessibilityRole="alert" style={{ color: ui.colors.textMuted }}>{message}</Text>}
  </View>;
}
