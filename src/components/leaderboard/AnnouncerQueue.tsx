import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Clipboard, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/core/config/supabase';
import { ui } from '@/constants/designSystem';
import { getCurrentOriginAppUrl } from '@/core/utils/appUrls';

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
  const queue = useQuery({ queryKey: key, queryFn: async () => {
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
    queryFn: async () => {
      const { data, error } = await supabase.rpc('smart_announcer_team_candidates', { p_tenant_id: tenantId, p_festival_id: festivalId, p_team_id: teamId });
      if (error) throw error;
      return (data || []) as Item[];
    },
  });
  useEffect(() => {
    if (mode === 'team' && teamId && candidates.data) {
      if (initializedTeam.current !== teamId) {
        initializedTeam.current = teamId;
        setSelected(candidates.data.slice(0, 5).map(item => item.id));
      } else {
        const eligible = new Set(candidates.data.map(item => item.id));
        setSelected(current => {
          const remaining = current.filter(id => eligible.has(id));
          return remaining.length === current.length ? current : remaining;
        });
      }
    }
  }, [mode, teamId, candidates.data]);
  useEffect(() => { setToken(null); setPin(null); setSelected([]); }, [userId, tenantId, festivalId]);
  useEffect(() => { if (queue.data && mode !== 'team') setSelected(queue.data.filter(item => !item.announced_at).map(item => item.item_id)); }, [queue.data, mode]);
  const save = useMutation({ mutationFn: async () => {
    const { error } = mode === 'team'
      ? await supabase.rpc('smart_announcer_replace_team_queue', { p_tenant_id: tenantId, p_festival_id: festivalId, p_team_id: teamId, p_item_ids: selected })
      : await supabase.rpc('smart_announcer_save_queue', { p_tenant_id: tenantId, p_festival_id: festivalId, p_item_ids: selected });
    if (error) throw error;
  }, onSuccess: async () => { setMessage('Queue saved.'); await client.invalidateQueries({ queryKey: key }); }, onError: () => setMessage('Unable to save the queue. Refresh results and retry.') });
  const issue = async () => {
    if (credentialBusy) return;
    setCredentialBusy(true);
    setMessage(null); setToken(null); setPin(null);
    try {
      const { data, error } = await supabase.rpc('smart_announcer_issue_pin_token', { p_tenant_id: tenantId, p_festival_id: festivalId });
      if (error || !data?.[0]?.token || !data[0].pin) { setMessage('Unable to create a PIN-protected link.'); return; }
      setToken(data[0].token); setPin(data[0].pin);
    } catch { setMessage('Unable to create a PIN-protected link.'); }
    finally { setCredentialBusy(false); }
  };
  const revoke = async () => {
    if (credentialBusy) return;
    setCredentialBusy(true);
    try {
      const { error } = await supabase.rpc('smart_announcer_revoke_tokens', { p_tenant_id: tenantId, p_festival_id: festivalId });
      if (!error) { setToken(null); setPin(null); }
      setMessage(error ? 'Unable to revoke links.' : 'Announcer links revoked.');
    } catch { setMessage('Unable to revoke links.'); }
    finally { setCredentialBusy(false); }
  };
  const announced = new Set(queue.data?.filter(item => item.announced_at).map(item => item.item_id) || []);
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
  const link = token ? getCurrentOriginAppUrl(`/announcer/${token}`) : null;
  return <View style={{ backgroundColor: ui.colors.surface, borderColor: ui.colors.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14, gap: 10 }}>
    <Text style={{ color: ui.colors.text, fontWeight: '700', fontSize: 16 }}>Announcer queue</Text>
    <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>Select prepared items, arrange their order, then save. Announcing does not publish results.</Text>
    {queue.isLoading ? <ActivityIndicator color={ui.colors.primary} /> : queue.error ? <Pressable onPress={() => void queue.refetch()}><Text style={{ color: ui.colors.danger }}>Queue unavailable. Tap to retry.</Text></Pressable> : <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {([['all', 'All Results'], ['suspense', 'Maintain Suspense'], ['team', 'Select Team']] as const).map(([value, label]) =>
          <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value, disabled: save.isPending }} disabled={save.isPending} onPress={() => { setMode(value); if (value === 'team') { initializedTeam.current = ''; setTeamId(''); setSelected([]); } }}>
            <Text style={{ color: mode === value ? ui.colors.primary : ui.colors.textMuted, fontWeight: '700', paddingVertical: 8 }}>{label}</Text>
          </Pressable>
        )}
      </View>
      {mode === 'team' && <Picker accessibilityLabel="Festival team" enabled={!save.isPending && recommendations.isSuccess} selectedValue={teamId} onValueChange={selectTeam}>
        <Picker.Item label="Choose a team" value="" />
        {recommendations.data?.teams.map(team => <Picker.Item key={team.id} label={team.name} value={team.id} />)}
      </Picker>}
      {mode === 'team' && recommendations.isSuccess && recommendations.data?.teams.length === 0 && <Text style={{ color: ui.colors.textMuted }}>No teams found for this festival.</Text>}
      {mode === 'team' && candidates.isFetching && <ActivityIndicator color={ui.colors.primary} />}
      {mode === 'team' && candidates.isError && <Pressable onPress={() => void candidates.refetch()}><Text style={{ color: ui.colors.danger }}>Unable to load team results. Tap to retry.</Text></Pressable>}
      {mode === 'team' && !!teamId && candidates.isSuccess && candidates.data.length === 0 && <Text style={{ color: ui.colors.textMuted }}>No eligible first-place results for this team.</Text>}
      {mode === 'team' && !!teamId && <Pressable accessibilityRole="button" disabled={candidates.isFetching} onPress={() => void candidates.refetch()}><Text style={{ color: ui.colors.primary }}>Refresh team results</Text></Pressable>}
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
          return <View key={item.id} style={{ borderWidth: 1, borderRadius: 8, padding: 8, borderColor: checked ? ui.colors.primary : ui.colors.border }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} aria-checked={checked} onPress={() => setSelected(current => checked ? current.filter(id => id !== item.id) : mode === 'team' && current.length >= 5 ? current : [...current, item.id])}>
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
      {selected.map((id, index) => <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}><Text style={{ flex: 1, color: ui.colors.text }}>{index + 1}. {names.get(id) || 'Unavailable item'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Move up" onPress={() => move(id, -1)}><Text style={{ color: ui.colors.primary, padding: 8 }}>↑</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Move down" onPress={() => move(id, 1)}><Text style={{ color: ui.colors.primary, padding: 8 }}>↓</Text></Pressable></View>)}
      {mode === 'team' && <Text style={{ color: ui.colors.textMuted }}>Saving replaces pending items. Announced items remain in history.</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><Pressable accessibilityRole="button" disabled={save.isPending || (mode === 'team' && (!teamId || selected.length === 0 || candidates.isFetching || candidates.isError))} onPress={() => save.mutate()}><Text style={{ color: ui.colors.primary, fontWeight: '700', paddingVertical: 8 }}>{save.isPending ? 'Saving…' : 'Save queue'}</Text></Pressable><Pressable accessibilityRole="button" disabled={credentialBusy} onPress={() => void issue()}><Text style={{ color: ui.colors.primary, fontWeight: '700', paddingVertical: 8 }}>{credentialBusy ? 'Please wait…' : 'Create announcer link'}</Text></Pressable><Pressable accessibilityRole="button" disabled={credentialBusy} onPress={() => void revoke()}><Text style={{ color: ui.colors.danger, fontWeight: '700', paddingVertical: 8 }}>Revoke links</Text></Pressable></View>
      {link && <View style={{ gap: 6 }}>
        <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>Announcer link · expires in 24 hours</Text>
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
