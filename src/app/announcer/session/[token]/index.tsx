import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/core/config/supabase';
import { ui } from '@/constants/designSystem';

type Item = { item_id: string; item_name: string; announced_at: string | null; category_codes: string[]; result_details: { rank: number | null; grade: string | null; participant_name: string; team_name: string; points_awarded: number | null }[] };

export default function SessionPortal() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <Portal key={token} token={token} />;
}

function Portal({ token }: { token: string }) {
  const storageKey = `announcer-device:${token}`;
  const [device, setDevice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'announced'>('pending');
  const alive = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    alive.current = true;
    AsyncStorage.getItem(storageKey).then(value => { if (alive.current) { setDevice(value); setReady(true); } }).catch(() => { if (alive.current) setReady(true); });
    return () => { alive.current = false; };
  }, [storageKey]);
  const refresh = useCallback(async (itemId?: string) => {
    if (!device || inFlight.current) return;
    inFlight.current = true;
    if (itemId) setBusy(true);
    try {
      const { data, error: failure } = await supabase.rpc('smart_announcer_device_queue', { p_token: token, p_device_token: device, p_item_id: itemId ?? null });
      if (!alive.current) return;
      if (failure) { setError('Unable to connect. Please retry.'); return; }
      if (data?.status !== 'ok') { setItems([]); setError('This session is closed or temporarily unavailable. Contact your admin.'); return; }
      setItems(data.items ?? []); setError(null);
    } catch { if (alive.current) setError('Connection interrupted. Please retry.'); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }, [device, token]);
  useEffect(() => {
    if (!device) return;
    void refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && (typeof document === 'undefined' || document.visibilityState === 'visible')) void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [device, refresh]);
  const login = async () => {
    if (busy || pin.length !== 4) return;
    setBusy(true); setError(null);
    try {
      const { data, error: failure } = await supabase.rpc('smart_announcer_device_login', { p_token: token, p_pin: pin });
      if (!alive.current) return;
      if (failure || data?.status !== 'ok') { setError(data?.status === 'locked' ? 'Too many attempts. Retry after 15 minutes.' : 'Unable to open session. Check the PIN with your admin.'); return; }
      try { await AsyncStorage.setItem(storageKey, data.device_token); } catch { setError('Browser storage is unavailable. Access will last while this page is open.'); }
      setPin(''); setDevice(data.device_token);
    } catch { if (alive.current) setError('Unable to connect. Please retry.'); }
    finally { if (alive.current) setBusy(false); }
  };
  const visible = items.filter(item => tab === 'announced' ? !!item.announced_at : !item.announced_at);
  return <View style={styles.page}><Stack.Screen options={{ title: 'Announcer', headerShown: false }} /><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.title}>Announcer</Text><Text style={styles.caption}>{items.filter(item => !item.announced_at).length} to announce · {items.filter(item => !!item.announced_at).length} announced</Text></View>{device && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void refresh()} style={styles.secondary}><Text style={styles.action}>Refresh</Text></Pressable>}</View>
    {!ready ? <ActivityIndicator color={ui.colors.primary} /> : !device ? <View style={styles.card}><Text style={styles.name}>Open your announcer session</Text><Text style={styles.caption}>Enter the PIN shared by your admin. This browser will remember your access.</Text><TextInput accessibilityLabel="Announcer PIN" secureTextEntry keyboardType="number-pad" maxLength={4} value={pin} onChangeText={value => setPin(value.replace(/\D/g, ''))} style={styles.input} /><Pressable accessibilityRole="button" disabled={busy || pin.length !== 4} onPress={() => void login()} style={[styles.primary, (busy || pin.length !== 4) && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Opening…' : 'Open session'}</Text></Pressable></View> : <>
      <View style={styles.row}>{(['pending','announced'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={tab === value ? styles.primary : styles.secondary}><Text style={tab === value ? styles.primaryText : styles.action}>{value === 'pending' ? 'To Announce' : 'Announced'}</Text></Pressable>)}</View>
      {!error && visible.length === 0 && <View style={styles.card}><Text style={styles.name}>{tab === 'pending' ? 'Waiting for the next batch' : 'No announced results yet'}</Text><Text style={styles.caption}>{tab === 'pending' ? 'Results appear here when your admin sends them. Keep this session open.' : 'Completed announcements will appear here.'}</Text></View>}
      {visible.map(item => <View key={item.item_id} style={styles.card}><View style={styles.row}><Text style={[styles.name, { flex: 1 }]}>{item.item_name}</Text>{item.announced_at && <Text style={styles.caption}>✓ Announced</Text>}</View><Text style={styles.caption}>{item.category_codes?.join(' · ')}</Text>{item.result_details.map((result, index) => <View key={index} style={styles.result}><Text style={styles.body}>{result.rank ? `#${result.rank}  ` : ''}{result.participant_name || result.team_name}</Text><Text style={styles.caption}>{[result.participant_name && result.team_name, result.grade, result.points_awarded != null && `${result.points_awarded} pts`].filter(Boolean).join(' · ')}</Text></View>)}{!item.announced_at && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void refresh(item.item_id)} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Saving…' : '✓ Mark Announced'}</Text></Pressable>}</View>)}
    </>}
    {error && <Text accessibilityRole="alert" style={{ color: ui.colors.danger }}>{error}</Text>}
  </ScrollView></View>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: ui.colors.background }, content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, title: { fontSize: 24, fontWeight: '700', color: ui.colors.text },
  name: { fontSize: 15, fontWeight: '700', color: ui.colors.text }, body: { fontSize: 14, color: ui.colors.text }, caption: { fontSize: 12, color: ui.colors.textMuted },
  card: { backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 12, padding: 16, gap: 8 },
  result: { borderTopWidth: 1, borderColor: ui.colors.border, paddingVertical: 8, gap: 4 }, input: { minHeight: 40, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8, paddingHorizontal: 12, color: ui.colors.text },
  primary: { backgroundColor: ui.colors.buttonPrimary, borderRadius: 8, minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' }, primaryText: { color: ui.colors.buttonForeground, fontWeight: '700', fontSize: 13 },
  secondary: { borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8, minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }, action: { color: ui.colors.primary, fontSize: 13, fontWeight: '700' }, disabled: { opacity: 0.5 },
});
