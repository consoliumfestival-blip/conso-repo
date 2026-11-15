import React, { useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '@/core/config/supabase';
import { ui } from '@/constants/designSystem';

export function FestivalReadonlyPortalAdmin({ tenantId, festivalId }: { tenantId: string | null; festivalId?: string }) {
  const [credential, setCredential] = useState<{ link_id: string; pin: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const generation = React.useRef(0);
  React.useEffect(() => { generation.current++; setCredential(null); setMessage(''); setLoading(false); }, [tenantId, festivalId]);
  const load = async (rotate: boolean) => {
    if (!tenantId || !festivalId || loading) return;
    if (rotate && Platform.OS === 'web' && typeof window !== 'undefined' && !window.confirm('Rotate the PIN and link? Existing access will stop working.')) return;
    const request = ++generation.current;
    setLoading(true); setMessage('');
    try {
      const { data, error } = await supabase.rpc('admin_festival_readonly_portal', { p_tenant_id: tenantId, p_festival_id: festivalId, p_rotate: rotate });
      if (error) throw error;
      if (!data?.link_id || !data?.pin) throw new Error('Invalid portal credentials.');
      if (generation.current === request) setCredential(data);
    } catch (error: any) { if (generation.current === request) setMessage(error.message || 'Unable to load portal access.'); }
    finally { if (generation.current === request) setLoading(false); }
  };
  const url = credential ? (Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/festival-view/${credential.link_id}` : Linking.createURL(`/festival-view/${credential.link_id}`)) : '';
  const copy = async (value: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try { await navigator.clipboard.writeText(value); setMessage('Copied'); } catch { setMessage('Select the text to copy it.'); }
    } else Alert.alert('Copy', value);
  };
  return <View style={{ padding: 14, marginBottom: 16, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 12, backgroundColor: ui.colors.surface, gap: 8 }}>
    <Text style={{ fontSize: 15, fontWeight: '700', color: ui.colors.text }}>Festival read-only portal</Text>
    <Text style={{ fontSize: 12, color: ui.colors.textMuted }}>View participants and programs for all festival teams.</Text>
    {credential && <>
      <Text selectable style={{ color: ui.colors.text, fontSize: 12 }}>{url}</Text>
      <Text selectable style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>PIN: {credential.pin}</Text>
    </>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Pressable accessibilityRole="button" onPress={() => void load(false)} disabled={loading || !festivalId} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: ui.colors.primary }}>
        <Text style={{ color: ui.colors.onPrimary, fontWeight: '700' }}>{loading ? 'Loading…' : credential ? 'Refresh access' : 'View access'}</Text>
      </Pressable>
      {credential && <>
        <Pressable accessibilityRole="button" onPress={() => void copy(url)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 }}><Text style={{ color: ui.colors.primary }}>Copy link</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => void copy(credential.pin)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 }}><Text style={{ color: ui.colors.primary }}>Copy PIN</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => {
          if (Platform.OS === 'web') void load(true);
          else Alert.alert('Rotate access?', 'The current link and PIN will stop working.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Rotate', onPress: () => void load(true) }]);
        }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 }}><Text style={{ color: ui.colors.danger }}>Rotate access</Text></Pressable>
      </>}
    </View>
    {!!message && <Text accessibilityRole="alert" style={{ color: ui.colors.textMuted, fontSize: 12 }}>{message}</Text>}
  </View>;
}
