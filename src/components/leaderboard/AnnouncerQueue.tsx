import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/core/config/supabase';
import { ui } from '@/constants/designSystem';
import { getCurrentOriginAppUrl } from '@/core/utils/appUrls';

type Entry = { item_id: string; queue_position: number; announced_at: string | null };
type Item = { id: string; name: string };
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
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('all');
  const [teamId, setTeamId] = useState('');
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
  useEffect(() => { setToken(null); setSelected([]); }, [userId, tenantId, festivalId]);
  useEffect(() => { if (queue.data) setSelected(queue.data.filter(item => !item.announced_at).map(item => item.item_id)); }, [queue.data]);
  const save = useMutation({ mutationFn: async () => {
    const { error } = await supabase.rpc('smart_announcer_save_queue', { p_tenant_id: tenantId, p_festival_id: festivalId, p_item_ids: selected });
    if (error) throw error;
  }, onSuccess: async () => { setMessage('Queue saved.'); await client.invalidateQueries({ queryKey: key }); }, onError: () => setMessage('Unable to save the queue. Please retry.') });
  const issue = async () => {
    setMessage(null); setToken(null);
    const { data, error } = await supabase.rpc('smart_announcer_issue_token', { p_tenant_id: tenantId, p_festival_id: festivalId });
    if (error || !data?.[0]?.token) { setMessage('Unable to create a link.'); return; }
    setToken(data[0].token);
  };
  const revoke = async () => {
    const { error } = await supabase.rpc('smart_announcer_revoke_tokens', { p_tenant_id: tenantId, p_festival_id: festivalId });
    setToken(null); setMessage(error ? 'Unable to revoke links.' : 'Announcer links revoked.');
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
  const visibleItems = mode === 'all' ? items.filter(item => !announced.has(item.id)) : ranked.map(item => ({ id: item.id, name: names.get(item.id)! }));
  const projections = new Map(ranked.map(item => [item.id, item]));
  return <View style={{ backgroundColor: ui.colors.surface, borderColor: ui.colors.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14, gap: 10 }}>
    <Text style={{ color: ui.colors.text, fontWeight: '700', fontSize: 16 }}>Announcer queue</Text>
    <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>Select prepared items, arrange their order, then save. Announcing does not publish results.</Text>
    {queue.isLoading ? <ActivityIndicator color={ui.colors.primary} /> : queue.error ? <Pressable onPress={() => void queue.refetch()}><Text style={{ color: ui.colors.danger }}>Queue unavailable. Tap to retry.</Text></Pressable> : <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {([['all', 'All Results'], ['suspense', 'Maintain Suspense'], ['team', 'Select Team']] as const).map(([value, label]) =>
          <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} onPress={() => setMode(value)}>
            <Text style={{ color: mode === value ? ui.colors.primary : ui.colors.textMuted, fontWeight: '700', paddingVertical: 8 }}>{label}</Text>
          </Pressable>
        )}
      </View>
      {mode === 'team' && <Picker accessibilityLabel="Festival team" selectedValue={teamId} onValueChange={setTeamId}>
        <Picker.Item label="Choose a team" value="" />
        {recommendations.data?.teams.map(team => <Picker.Item key={team.id} label={team.name} value={team.id} />)}
      </Picker>}
      {mode !== 'all' && recommendations.isFetching && <ActivityIndicator color={ui.colors.primary} />}
      {mode !== 'all' && recommendations.isError && <Pressable onPress={() => void recommendations.refetch()}>
        <Text style={{ color: ui.colors.danger }}>Recommendations unavailable. Tap to retry.</Text>
      </Pressable>}
      {mode !== 'all' && recommendations.isSuccess && <Text style={{ color: ui.colors.textMuted, fontSize: 12 }}>Each projection assumes that item is published next.</Text>}
      {mode !== 'all' && ranked.length > 0 && <Pressable accessibilityRole="button" onPress={() => {
        const order = new Map(ranked.map((item, index) => [item.id, index]));
        setSelected(current => [...current].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity)));
      }}><Text style={{ color: ui.colors.primary }}>Reorder selected items by suggestion</Text></Pressable>}
      <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled contentContainerStyle={{ gap: 8 }}>
        {visibleItems.map(item => {
          const projection = mode === 'all' ? undefined : projections.get(item.id);
          const teamStanding = projection?.standings.find(row => row.organisation_id === teamId);
          const checked = selected.includes(item.id);
          return <View key={item.id} style={{ borderWidth: 1, borderRadius: 8, padding: 8, borderColor: checked ? ui.colors.primary : ui.colors.border }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setSelected(current => checked ? current.filter(id => id !== item.id) : [...current, item.id])}>
              <Text style={{ color: ui.colors.text }}>{checked ? '☑ ' : '☐ '}{item.name}</Text>
            </Pressable>
            {mode === 'team' && teamId && projection && <Text style={{ color: ui.colors.textMuted, marginTop: 5 }}>
              {projection.points[teamId] ?? 0} item points · {teamStanding ? `Projected ${teamStanding.total_points} points · Rank ${teamStanding.projected_rank}` : 'No projected leaderboard entry'}
            </Text>}
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
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><Pressable accessibilityRole="button" disabled={save.isPending} onPress={() => save.mutate()}><Text style={{ color: ui.colors.primary, fontWeight: '700', paddingVertical: 8 }}>{save.isPending ? 'Saving…' : 'Save queue'}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void issue()}><Text style={{ color: ui.colors.primary, fontWeight: '700', paddingVertical: 8 }}>Create announcer link</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void revoke()}><Text style={{ color: ui.colors.danger, fontWeight: '700', paddingVertical: 8 }}>Revoke links</Text></Pressable></View>
      {token && <Text selectable style={{ color: ui.colors.text, fontSize: 12 }}>Link (expires in 24 hours): {getCurrentOriginAppUrl(`/announcer/${token}`)}</Text>}
    </>}
    {message && <Text accessibilityRole="alert" style={{ color: ui.colors.textMuted }}>{message}</Text>}
  </View>;
}
