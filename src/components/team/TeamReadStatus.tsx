import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { RefreshCw } from 'lucide-react-native';

export function TeamReadStatus({ fetching, error, onRefresh }: { fetching: boolean; error: unknown; onRefresh: () => void }) {
  const ui = useTeamUi();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
    {fetching ? <ActivityIndicator size="small" color={ui.colors.primary} /> : null}
    <Text accessibilityLiveRegion="polite" style={{ color: error ? ui.colors.danger : ui.colors.textMuted, fontSize: 11, flexShrink: 1 }}>{error ? 'Unable to refresh. Showing last available data.' : fetching ? 'Refreshing…' : ''}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Refresh page data" disabled={fetching} onPress={onRefresh} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: fetching ? 0.6 : 1 }}><RefreshCw size={14} color={ui.colors.primary} /><Text style={{ color: ui.colors.primary, fontSize: 12, fontWeight: '700' }}>Refresh</Text></Pressable>
  </View>;
}
