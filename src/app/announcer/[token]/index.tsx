import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/core/config/supabase';
import { ui } from '@/constants/designSystem';

type QueueItem = { item_id: string; item_name: string; queue_position: number; announced_at: string | null; category_codes: string[]; result_details: { rank: number | null; grade: string | null; participant_name: string; team_name: string; points_awarded: number | null }[] };

export default function AnnouncerPortal() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <AnnouncerPortalBody key={token || 'missing'} token={token} />;
}

function AnnouncerPortalBody({ token }: { token?: string }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'announced'>('pending');
  const [pinInput, setPinInput] = useState('');
  const [pin, setPin] = useState<string | null>(null);
  const [needsPin, setNeedsPin] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const accessRef = useRef(false);
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(async (background = false) => {
    const version = ++requestVersion.current;
    if (!token) { setError('This link is invalid. Ask an admin for a new link.'); setLoading(false); return; }
    if (!background) setLoading(true);
    const { data, error: failure } = pin === null
      ? await supabase.rpc('smart_announcer_get_queue', { p_token: token })
      : await supabase.rpc(background || accessRef.current ? 'smart_announcer_poll_queue_pin' : 'smart_announcer_get_queue_pin', { p_token: token, p_pin: pin });
    if (version !== requestVersion.current) return;
    if (failure) {
      if (pin === null && failure.code === '42501') {
        setItems([]); accessRef.current = false; setHasAccess(false);
        const { data: accessMode, error: modeError } = await supabase.rpc('smart_announcer_access_mode', { p_token: token });
        if (version !== requestVersion.current) return;
        if (!modeError && accessMode === 'pin') setNeedsPin(true);
        else { setNeedsPin(false); setError(modeError ? 'Unable to check the link. Check your connection and retry.' : 'This link has expired or is no longer valid. Ask an admin for a new link.'); }
      } else { if (!background) setItems([]); setError('Unable to load the queue. Check the link and connection.'); }
    } else if (pin !== null && data?.status !== 'ok') {
      setItems([]); accessRef.current = false; setHasAccess(false); setNeedsPin(true); setPin(null);
      setError(data?.status === 'locked' ? 'Too many attempts. Try again after 15 minutes.' : 'Invalid PIN or expired link.');
    } else { setItems((pin === null ? data || [] : data.items || []) as QueueItem[]); accessRef.current = true; setHasAccess(true); setNeedsPin(false); setPinInput(''); setError(null); }
    setLoading(false);
  }, [token, pin]);
  useEffect(() => { void load(); return () => { requestVersion.current += 1; }; }, [load]);
  useEffect(() => {
    if (!hasAccess || needsPin || loading || working) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && (typeof document === 'undefined' || document.visibilityState === 'visible')) void load(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [hasAccess, needsPin, loading, working, load]);
  const announce = async (item: QueueItem) => {
    if (!token || working) return;
    setWorking(item.item_id);
    const { data, error: failure } = pin === null
      ? await supabase.rpc('smart_announcer_mark_announced', { p_token: token, p_item_id: item.item_id })
      : await supabase.rpc('smart_announcer_mark_announced_pin', { p_token: token, p_pin: pin, p_item_id: item.item_id });
    if (!mounted.current) return;
    if (failure || (pin !== null && data?.status !== 'ok')) {
      if (failure?.code === '42501' || (pin !== null && data?.status !== 'ok')) {
        setItems([]); accessRef.current = false; setHasAccess(false);
        if (pin !== null) { setNeedsPin(true); setPin(null); }
      }
      setError(data?.status === 'locked' ? 'Too many attempts. Try again after 15 minutes.' : 'Unable to mark this item. Refresh or ask an admin for a new link.');
    }
    else await load();
    setWorking(null);
  };
  const visible = items.filter(item => tab === 'announced' ? !!item.announced_at : !item.announced_at);
  return <View style={styles.page}>
    <Stack.Screen options={{ title: 'Announcer' }} />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}><View><Text style={styles.title}>Announcer</Text><Text style={styles.caption}>Announcements are separate from public publishing. Updates refresh while this page is open.</Text></View><Pressable accessibilityRole="button" onPress={() => void load()} style={styles.secondary}><Text style={styles.actionText}>Refresh</Text></Pressable></View>
      {needsPin && <View style={styles.card}><Text style={styles.itemName}>Enter announcer PIN</Text><TextInput accessibilityLabel="Four digit PIN" keyboardType="number-pad" secureTextEntry maxLength={4} value={pinInput} onChangeText={value => setPinInput(value.replace(/[^0-9]/g, ''))} style={{ minWidth: 100, minHeight: 44, color: ui.colors.text, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8, padding: 8 }} /><Pressable accessibilityRole="button" disabled={pinInput.length !== 4} onPress={() => setPin(pinInput)} style={styles.primary}><Text style={styles.selectedText}>Open</Text></Pressable></View>}
      {!needsPin && <View style={styles.tabs}>{(['pending', 'announced'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.selected]}><Text style={[styles.actionText, tab === value && styles.selectedText]}>{value === 'pending' ? 'To Announce' : 'Announced'}</Text></Pressable>)}</View>}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={ui.colors.primary} /> : needsPin ? null : visible.length === 0 ? <Text style={styles.caption}>No {tab === 'pending' ? 'items to announce' : 'announced items'}.</Text> : visible.map(item => <View key={item.item_id} style={styles.card}><View style={styles.item}><Text style={styles.itemName}>{item.item_name}</Text><Text style={styles.caption}>{item.category_codes?.join(', ')} · {item.announced_at ? 'Announced' : 'Ready to announce'}</Text>{item.result_details?.map((result, index) => <Text key={index} style={styles.caption}>{result.rank ? `#${result.rank} · ` : ''}{result.participant_name || result.team_name}{result.participant_name && result.team_name ? ` · ${result.team_name}` : ''}{result.grade ? ` · ${result.grade}` : ''}{result.points_awarded != null ? ` · ${result.points_awarded} pts` : ''}</Text>)}</View>{!item.announced_at && <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!working }} disabled={!!working} onPress={() => void announce(item)} style={[styles.primary, working && styles.disabled]}><Text style={styles.selectedText}>{working === item.item_id ? 'Saving…' : 'Mark Announced'}</Text></Pressable>}</View>)}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: ui.colors.background }, content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 16, gap: 14 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, title: { color: ui.colors.text, fontSize: 24, fontWeight: '700' }, caption: { color: ui.colors.textMuted, fontSize: 13, marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, tab: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: 10, backgroundColor: ui.colors.surface }, selected: { backgroundColor: ui.colors.primary }, selectedText: { color: ui.colors.onPrimary, fontWeight: '700' }, actionText: { color: ui.colors.primary, fontWeight: '700' },
  card: { padding: 14, borderRadius: 12, backgroundColor: ui.colors.surface, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }, item: { flex: 1, minWidth: 160 }, itemName: { color: ui.colors.text, fontSize: 15, fontWeight: '700' }, primary: { backgroundColor: ui.colors.primary, paddingHorizontal: 14, minHeight: 44, borderRadius: 9, justifyContent: 'center' }, secondary: { borderColor: ui.colors.border, borderWidth: 1, paddingHorizontal: 14, minHeight: 40, borderRadius: 9, justifyContent: 'center' }, disabled: { opacity: 0.5 }, error: { color: ui.colors.danger, fontSize: 13 },
});
