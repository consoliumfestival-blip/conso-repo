import React, { useState } from 'react';
import { Alert, Clipboard, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Copy, RefreshCw, ShieldCheck } from 'lucide-react-native';
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
  const copy = async (value: string, label: string) => {
    try {
      if (Platform.OS === 'web') {
        if (!globalThis.navigator?.clipboard) throw new Error('Clipboard unavailable');
        await globalThis.navigator.clipboard.writeText(value);
      } else Clipboard.setString(value);
      setMessage(`${label} copied.`);
    } catch { setMessage(`Unable to copy ${label.toLowerCase()}. Select the text to copy it.`); }
  };
  const field = (label: string, value: string) => <View style={{ gap: 6 }}>
    <Text style={{ fontSize: 13, fontWeight: '700', color: ui.colors.text }}>{label}</Text>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <TextInput accessibilityLabel={label} value={value} editable={false} selectTextOnFocus style={{ flex: 1, minWidth: 0, height: 42, paddingHorizontal: 12, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8, backgroundColor: ui.colors.background, color: ui.colors.text, fontSize: 13 }} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Copy ${label.toLowerCase()}`} onPress={() => void copy(value, label)} style={{ minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 8 }}>
        <Copy size={15} color={ui.colors.primary} /><Text style={{ color: ui.colors.primary, fontWeight: '700', fontSize: 13 }}>Copy</Text>
      </Pressable>
    </View>
  </View>;
  return <View style={{ padding: 16, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 12, backgroundColor: ui.colors.surface, gap: 16 }}>
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <View style={{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.colors.primarySoft }}><ShieldCheck size={19} color={ui.colors.primary} /></View>
      <View style={{ flex: 1 }}><Text style={{ fontSize: 15, fontWeight: '700', color: ui.colors.text }}>Portal access</Text>
        <Text style={{ fontSize: 12, color: ui.colors.textMuted }}>Share the link and PIN with authorized viewers.</Text></View>
    </View>
    {!festivalId && <Text style={{ color: ui.colors.textMuted, fontSize: 13 }}>Select an active festival to manage portal access.</Text>}
    {credential && <>
      {field('Portal link', url)}
      {field('PIN', credential.pin)}
    </>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Pressable accessibilityRole="button" onPress={() => void load(false)} disabled={loading || !festivalId} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: ui.colors.primary }}>
        <Text style={{ color: ui.colors.onPrimary, fontWeight: '700' }}>{loading ? 'Loading…' : credential ? 'Refresh access' : 'View access'}</Text>
      </Pressable>
      {credential && <>
        <Pressable accessibilityRole="button" onPress={() => {
          if (Platform.OS === 'web') void load(true);
          else Alert.alert('Rotate access?', 'The current link and PIN will stop working.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Rotate', onPress: () => void load(true) }]);
        }} disabled={loading} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, opacity: loading ? 0.5 : 1 }}><RefreshCw size={15} color={ui.colors.danger} /><Text style={{ color: ui.colors.danger }}>Rotate access</Text></Pressable>
      </>}
    </View>
    {!!message && <Text accessibilityRole="alert" style={{ color: ui.colors.textMuted, fontSize: 12 }}>{message}</Text>}
  </View>;
}
