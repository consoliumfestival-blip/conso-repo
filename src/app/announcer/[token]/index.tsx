import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/core/config/supabase';
import { ui } from '@/constants/designSystem';

type QueueItem = { item_id: string; item_name: string; queue_position: number; announced_at: string | null; category_codes: string[]; result_details: { rank: number | null; grade: string | null; participant_name: string; team_name: string; points_awarded: number | null }[] };

export default function AnnouncerPortal() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'announced'>('pending');
  const load = useCallback(async () => {
    if (!token) { setError('This link is invalid. Ask an admin for a new link.'); setLoading(false); return; }
    setLoading(true);
    const { data, error: failure } = await supabase.rpc('smart_announcer_get_queue', { p_token: token });
    if (failure) { setItems([]); setError(failure.code === '42501' ? 'This link has expired or is no longer valid. Ask an admin for a new link.' : 'Unable to load the queue. Check your connection and refresh; older links may require an updated app.'); }
    else { setItems((data || []) as QueueItem[]); setError(null); }
    setLoading(false);
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const announce = async (item: QueueItem) => {
    if (!token || working) return;
    setWorking(item.item_id);
    const { error: failure } = await supabase.rpc('smart_announcer_mark_announced', { p_token: token, p_item_id: item.item_id });
    if (failure) {
      if (failure.code === '42501') setItems([]);
      setError('Unable to mark this item. Refresh or ask an admin for a new link.');
    }
    else await load();
    setWorking(null);
  };
  const visible = items.filter(item => tab === 'announced' ? !!item.announced_at : !item.announced_at);
  return <View style={styles.page}>
    <Stack.Screen options={{ title: 'Announcer' }} />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}><View><Text style={styles.title}>Announcer</Text><Text style={styles.caption}>Announcements are separate from public publishing.</Text></View><Pressable accessibilityRole="button" onPress={() => void load()} style={styles.secondary}><Text style={styles.actionText}>Refresh</Text></Pressable></View>
      <View style={styles.tabs}>{(['pending', 'announced'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.selected]}><Text style={[styles.actionText, tab === value && styles.selectedText]}>{value === 'pending' ? 'To Announce' : 'Announced'}</Text></Pressable>)}</View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={ui.colors.primary} /> : visible.length === 0 ? <Text style={styles.caption}>No {tab === 'pending' ? 'items to announce' : 'announced items'}.</Text> : visible.map(item => <View key={item.item_id} style={styles.card}><View style={styles.item}><Text style={styles.itemName}>{item.item_name}</Text><Text style={styles.caption}>{item.category_codes?.join(', ')} · {item.announced_at ? 'Announced' : 'Ready to announce'}</Text>{item.result_details?.map((result, index) => <Text key={index} style={styles.caption}>{result.rank ? `#${result.rank} · ` : ''}{result.participant_name || result.team_name}{result.participant_name && result.team_name ? ` · ${result.team_name}` : ''}{result.grade ? ` · ${result.grade}` : ''}{result.points_awarded != null ? ` · ${result.points_awarded} pts` : ''}</Text>)}</View>{!item.announced_at && <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!working }} disabled={!!working} onPress={() => void announce(item)} style={[styles.primary, working && styles.disabled]}><Text style={styles.selectedText}>{working === item.item_id ? 'Saving…' : 'Mark Announced'}</Text></Pressable>}</View>)}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: ui.colors.background }, content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 16, gap: 14 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, title: { color: ui.colors.text, fontSize: 24, fontWeight: '700' }, caption: { color: ui.colors.textMuted, fontSize: 13, marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, tab: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: 10, backgroundColor: ui.colors.surface }, selected: { backgroundColor: ui.colors.primary }, selectedText: { color: ui.colors.onPrimary, fontWeight: '700' }, actionText: { color: ui.colors.primary, fontWeight: '700' },
  card: { padding: 14, borderRadius: 12, backgroundColor: ui.colors.surface, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }, item: { flex: 1, minWidth: 160 }, itemName: { color: ui.colors.text, fontSize: 15, fontWeight: '700' }, primary: { backgroundColor: ui.colors.primary, paddingHorizontal: 14, minHeight: 44, borderRadius: 9, justifyContent: 'center' }, secondary: { borderColor: ui.colors.border, borderWidth: 1, paddingHorizontal: 14, minHeight: 40, borderRadius: 9, justifyContent: 'center' }, disabled: { opacity: 0.5 }, error: { color: ui.colors.danger, fontSize: 13 },
});
