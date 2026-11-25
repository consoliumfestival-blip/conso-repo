import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Clipboard, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/core/config/supabase';
import { ui } from '@/constants/designSystem';
import { getCurrentOriginAppUrl } from '@/core/utils/appUrls';
import { PortalManagementPageLoading } from '@/components/layout/PortalManagementPage';

type Entry = { item_id: string; queue_position: number; announced_at: string | null };
type Item = { id: string; name: string; item_code?: string | null; category_codes?: string[] };
type Props = { tenantId: string; festivalId: string; userId: string; items: Item[] };
type Mode = 'all' | 'suspense' | 'team';
type Recommendation = {
  id: string;
  points: Record<string, number>;
  standings: { organisation_id: string; total_points: number; projected_rank: number }[];
};
type Recommendations = { teams: Item[]; items: Recommendation[] };
type TeamStrategy = { items: { item_id: string; team_rank: number; team_points: number; leader_gap: number; standings: { organisation_id: string; total_points: number; projected_rank: number }[] }[]; candidate_count: number; schedules: { item_id: string; start_time: string | null; venue: string | null }[] };

function pointsGap(item: Recommendation): number {
  const [leader, runnerUp] = item.standings;
  return leader && runnerUp ? leader.total_points - runnerUp.total_points : Number.POSITIVE_INFINITY;
}

export function AnnouncerQueue({ tenantId, festivalId, userId, items }: Props) {
  const client = useQueryClient();
  const key = ['smart-announcer-admin-queue', userId, tenantId, festivalId];
  const [selected, setSelected] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('team');
  const [teamId, setTeamId] = useState('');
  const initializedTeam = useRef('');
  const [detailsId, setDetailsId] = useState<string | null>(null);
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
  const recommendations = useQuery({
    queryKey: ['smart-announcer-recommendations', tenantId, festivalId, userId],
    enabled: mode !== 'all',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('smart_announcer_recommendations', { p_tenant_id: tenantId, p_festival_id: festivalId });
      if (error) throw error;
      return data as Recommendations;
    },
  });
  const candidates = useQuery({
    queryKey: ['smart-announcer-team-candidates', userId, tenantId, festivalId, teamId],
    enabled: mode === 'team' && !!teamId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('smart_announcer_team_candidates', { p_tenant_id: tenantId, p_festival_id: festivalId, p_team_id: teamId });
      if (error) throw error;
      return (data || []) as Item[];
    },
  });
  const strategy = useQuery({
    queryKey: ['smart-announcer-team-strategy', userId, tenantId, festivalId, teamId],
    enabled: mode === 'team' && !!teamId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('smart_announcer_batch_preview', {
        p_tenant_id: tenantId, p_festival_id: festivalId, p_team_id: teamId,
      });
      if (error) throw error;
      return data as TeamStrategy;
    },
  });
  const preview = useQuery({ queryKey: ['announcer-manual-preview', userId, tenantId, festivalId, teamId, selected],
    enabled: mode === 'team' && !!teamId && selected.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('smart_announcer_batch_preview', { p_tenant_id: tenantId, p_festival_id: festivalId, p_team_id: teamId, p_item_ids: selected });
      if (error) throw error;
      return data as TeamStrategy;
    },
  });
  useEffect(() => {
    if (mode === 'team' && teamId && candidates.data && strategy.data) {
      if (initializedTeam.current !== teamId) {
        initializedTeam.current = teamId;
        setSelected(strategy.data.items.map(item => item.item_id));
      } else {
        const eligible = new Set(candidates.data.map(item => item.id));
        setSelected(current => {
          const remaining = current.filter(id => eligible.has(id));
          return remaining.length === current.length ? current : remaining;
        });
      }
    }
  }, [mode, teamId, candidates.data, strategy.data]);
  useEffect(() => { setPin(null); setSelected([]); }, [userId, tenantId, festivalId]);
  useEffect(() => { if (queue.data && mode !== 'team') setSelected(queue.data.filter(item => !item.announced_at).map(item => item.item_id)); }, [queue.data, mode]);
  const save = useMutation({ mutationFn: async () => {
    const { error } = mode === 'team'
      ? await supabase.rpc('smart_announcer_send_batch', { p_tenant_id: tenantId, p_festival_id: festivalId, p_team_id: teamId, p_item_ids: selected })
      : await supabase.rpc('smart_announcer_save_queue', { p_tenant_id: tenantId, p_festival_id: festivalId, p_item_ids: selected });
    if (error) throw error;
  }, onSuccess: async () => {
    setMessage('Results sent to the announcer.');
    initializedTeam.current = '';
    setSelected([]);
    await Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: ['smart-announcer-team-strategy'] }),
      client.invalidateQueries({ queryKey: ['smart-announcer-team-candidates'] }),
      client.invalidateQueries({ queryKey: ['smart-announcer-recommendations'] }),
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
      setMode('team');
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
    if (lastPending.current > 0 && pending === 0 && mode === 'team') {
      initializedTeam.current = '';
      void candidates.refetch();
      void strategy.refetch();
    }
    lastPending.current = pending;
  }, [pending, mode, candidates, strategy]);
  const move = (id: string, direction: number) => setSelected(previous => {
    const next = [...previous], index = next.indexOf(id), target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return previous;
    [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  const names = new Map(items.map(item => [item.id, item.name]));
  const ranked = (recommendations.data?.items ?? []).filter(item => names.has(item.id) && !announced.has(item.id));
  if (mode === 'suspense') ranked.sort((a, b) => {
    const left = pointsGap(a);
    const right = pointsGap(b);
    return left === right ? a.id.localeCompare(b.id) : left < right ? -1 : 1;
  });
  if (mode === 'team') ranked.sort((a, b) => (b.points[teamId] ?? 0) - (a.points[teamId] ?? 0) || a.id.localeCompare(b.id));
  const visibleItems: Item[] = mode === 'all' ? items.filter(item => !announced.has(item.id)) : mode === 'team' ? (candidates.data ?? []) : ranked.map(item => ({ id: item.id, name: names.get(item.id)! }));
  const selectTeam = (id: string) => {
    initializedTeam.current = '';
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
  const projections = new Map(ranked.map(item => [item.id, item]));
  const link = token ? getCurrentOriginAppUrl(`/announcer/session/${token}`) : null;
  if (queue.isLoading) return <PortalManagementPageLoading section />;
  return <View style={{ backgroundColor: ui.colors.surface, borderColor: ui.colors.border, borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 14, gap: 10 }}>
    <Text style={{ color: ui.colors.text, fontWeight: '700', fontSize: 16 }}>Announcer setup</Text>
    <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>{token ? 'Session active until you close it' : 'Create a session to share announcer access'} · {pending} pending · {announced.size} announced</Text>
    {session.isError && <Text accessibilityRole="alert" style={{ color: ui.colors.danger }}>Unable to load session. <Text onPress={() => void session.refetch()}>Retry</Text></Text>}
    <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>Select prepared items, arrange their order, then save. Announcing does not publish results.</Text>
    {queue.error ? <Pressable onPress={() => void queue.refetch()}><Text style={{ color: ui.colors.danger }}>Queue unavailable. Tap to retry.</Text></Pressable> : <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {([['all', 'All Results'], ['suspense', 'Maintain Suspense'], ['team', 'Select Team']] as const).filter(([value]) => !token || value === 'team').map(([value, label]) =>
          <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value, disabled: save.isPending }} disabled={save.isPending} onPress={() => { setMode(value); if (value === 'team') { initializedTeam.current = ''; setTeamId(''); setSelected([]); } }} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: 8, borderColor: mode === value ? ui.colors.primary : ui.colors.border, backgroundColor: mode === value ? ui.colors.primarySoft : ui.colors.surface }}>
            <Text style={{ color: mode === value ? ui.colors.primary : ui.colors.textMuted, fontWeight: '700', fontSize: 12 }}>{label}</Text>
          </Pressable>
        )}
      </View>
      {mode === 'team' && <Picker accessibilityLabel="Festival team" enabled={!save.isPending && recommendations.isSuccess} selectedValue={teamId} onValueChange={selectTeam}>
        <Picker.Item label="Choose a team" value="" />
        {recommendations.data?.teams.map(team => <Picker.Item key={team.id} label={team.name} value={team.id} />)}
      </Picker>}
      {mode === 'team' && recommendations.isSuccess && recommendations.data?.teams.length === 0 && <Text style={{ color: ui.colors.textMuted }}>No teams found for this festival.</Text>}
      {mode === 'team' && candidates.isLoading && <ActivityIndicator color={ui.colors.primary} />}
      {mode === 'team' && candidates.isError && <Pressable onPress={() => void candidates.refetch()}><Text style={{ color: ui.colors.danger }}>Unable to load team results. Tap to retry.</Text></Pressable>}
      {mode === 'team' && !!teamId && candidates.isSuccess && candidates.data.length === 0 && <Text style={{ color: ui.colors.textMuted }}>No eligible results with points for this team.</Text>}
      {mode === 'team' && !!teamId && <Pressable accessibilityRole="button" disabled={candidates.isFetching || strategy.isFetching} onPress={() => { void candidates.refetch(); void strategy.refetch(); void queue.refetch(); }}><Text style={{ color: ui.colors.primary }}>Refresh team results</Text></Pressable>}
      {mode === 'team' && strategy.isLoading && <ActivityIndicator color={ui.colors.primary} />}
      {mode === 'team' && strategy.isError && <Text accessibilityRole="alert" style={{ color: ui.colors.danger }}>Unable to calculate suggestions. Refresh team results.</Text>}
      {mode === 'team' && strategy.data && <Pressable accessibilityRole="button" disabled={save.isPending || strategy.isFetching} onPress={() => setSelected(strategy.data.items.map(item => item.item_id))}><Text style={{ color: ui.colors.primary }}>Use suggested order</Text></Pressable>}
      {mode !== 'all' && recommendations.isFetching && <ActivityIndicator color={ui.colors.primary} />}
      {mode !== 'all' && recommendations.isError && <Pressable onPress={() => void recommendations.refetch()}>
        <Text style={{ color: ui.colors.danger }}>Recommendations unavailable. Tap to retry.</Text>
      </Pressable>}
      {mode === 'suspense' && recommendations.isSuccess && <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>Each projection assumes that item is published next.</Text>}
      {mode === 'suspense' && ranked.length > 0 && <Pressable accessibilityRole="button" onPress={() => {
        const order = new Map(ranked.map((item, index) => [item.id, index]));
        setSelected(current => [...current].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity)));
      }}><Text style={{ color: ui.colors.primary }}>Reorder selected items by suggestion</Text></Pressable>}
      <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled contentContainerStyle={{ gap: 8 }}>
        {visibleItems.map(item => {
          const projection = mode === 'suspense' ? projections.get(item.id) : undefined;
          const checked = selected.includes(item.id);
          return <View key={item.id} style={{ borderWidth: 1, borderRadius: 8, padding: 10, backgroundColor: checked ? ui.colors.primarySoft : ui.colors.surface, borderColor: checked ? ui.colors.primary : ui.colors.border }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} aria-checked={checked} style={{ minHeight: 32, justifyContent: 'center' }} onPress={() => setSelected(current => checked ? current.filter(id => id !== item.id) : mode === 'team' && current.length >= 5 ? current : [...current, item.id])}>
              <Text style={{ color: ui.colors.text }}>{checked ? '☑ ' : '☐ '}{item.name}</Text>
            </Pressable>
            {mode === 'team' && (item.item_code || item.category_codes?.length) ? <Text style={{ color: ui.colors.textMuted, marginTop: 4 }}>{[item.item_code, item.category_codes?.join(', ')].filter(Boolean).join(' · ')}</Text> : null}
            {mode === 'suspense' && projection && Number.isFinite(pointsGap(projection)) &&
              <Text style={{ color: ui.colors.textMuted, marginTop: 5 }}>Projected lead: {pointsGap(projection)} points</Text>}
            {projection && <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsId === item.id }} onPress={() => setDetailsId(detailsId === item.id ? null : item.id)}>
              <Text style={{ color: ui.colors.primary, paddingVertical: 5 }}>Item points by team</Text>
            </Pressable>}
            {detailsId === item.id && projection && recommendations.data?.teams.map(team =>
              <Text key={team.id} style={{ color: ui.colors.text }}>{team.name} · {projection.points[team.id] ?? 0} points</Text>
            )}
          </View>;
        })}
      </ScrollView>
      {selected.map((id, index) => <View key={id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 44 }}><View style={{ flex: 1, minWidth: 160 }}><Text style={{ color: ui.colors.text }}>{index + 1}. {names.get(id) || candidates.data?.find(item => item.id === id)?.name || 'Unavailable item'}</Text>{preview.data?.schedules.filter(s => s.item_id === id).map((s, n) => <Text key={n} style={{ color: ui.colors.textMuted, fontSize: 12 }}>{s.venue || 'Venue pending'} · {s.start_time ? new Date(s.start_time).toLocaleString() : 'Time pending'}</Text>)}{preview.data?.items.filter(item => item.item_id === id).map(item => <Text key={id} style={{ color: ui.colors.textMuted, fontSize: 12 }}>Projected team rank #{item.team_rank} · {item.team_points} points</Text>)}</View><Pressable accessibilityRole="button" accessibilityLabel="Move up" onPress={() => move(id, -1)}><Text style={{ color: ui.colors.primary, padding: 12 }}>↑</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Move down" onPress={() => move(id, 1)}><Text style={{ color: ui.colors.primary, padding: 12 }}>↓</Text></Pressable></View>)}
      {preview.isError && <Text accessibilityRole="alert" style={{ color: ui.colors.danger }}>Selection is no longer eligible. Refresh team results.</Text>}
      {preview.data?.items.at(-1)?.standings.map(team => <Text key={team.organisation_id} style={{ color: ui.colors.textMuted, fontSize: 12 }}>After this batch: #{team.projected_rank} {recommendations.data?.teams.find(t => t.id === team.organisation_id)?.name || 'Team'} · {team.total_points} points</Text>)}
      {mode === 'team' && <Text style={{ color: ui.colors.textMuted }}>{pending > 0 ? 'Wait for the current batch to finish before sending the next batch.' : 'Review the next batch, then send it to the active announcer session.'}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><Pressable accessibilityRole="button" disabled={save.isPending || (mode === 'team' && (!token || pending > 0 || !teamId || selected.length === 0 || preview.isFetching || preview.isError || candidates.isError))} onPress={() => save.mutate()}><Text style={{ color: ui.colors.primary, fontWeight: '700', paddingVertical: 12 }}>{save.isPending ? 'Sending…' : mode === 'team' ? 'Send to Announcer' : 'Save queue'}</Text></Pressable>{!token && <Pressable accessibilityRole="button" disabled={credentialBusy || session.isLoading} onPress={() => void issue()}><Text style={{ color: ui.colors.primary, fontWeight: '700', paddingVertical: 12 }}>Create session</Text></Pressable>}{token && <Pressable accessibilityRole="button" disabled={credentialBusy} onPress={() => setConfirmClose(true)}><Text style={{ color: ui.colors.danger, fontWeight: '700', paddingVertical: 12 }}>Close session</Text></Pressable>}</View>
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
