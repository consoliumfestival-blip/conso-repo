import React, { createContext, useContext } from 'react';
import { ScrollView, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamText } from './TeamText';

const TabsContext = createContext({ value: '', onValueChange: (_value: string) => {} });

export function Tabs({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) {
  return <TabsContext.Provider value={{ value, onValueChange }}><View style={{ width: '100%', gap: 10 }}>{children}</View></TabsContext.Provider>;
}

export function TabsList({ children }: { children: React.ReactNode }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 2 }}>{children}</ScrollView>;
}

export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  const ui = useTeamUi();
  const { width } = useWindowDimensions();
  const tabs = useContext(TabsContext);
  const active = tabs.value === value;
  return <TouchableOpacity onPress={() => tabs.onValueChange(value)} accessibilityRole="tab" accessibilityState={{ selected: active }}
    style={{ minHeight: width < 768 ? 44 : 38, paddingHorizontal: width < 768 ? 15 : 16, borderRadius: ui.radius.lg, borderWidth: 1, borderColor: active ? ui.colors.primaryStrong : ui.colors.border, backgroundColor: active ? ui.colors.primaryStrong : ui.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
    <TeamText style={{ color: active ? ui.colors.onPrimary : ui.colors.textMuted, fontSize: 13, fontWeight: '700' }}>{children}</TeamText>
  </TouchableOpacity>;
}

export function TabsContent({ value, children }: { value: string; children: React.ReactNode }) {
  const tabs = useContext(TabsContext);
  return tabs.value === value ? <View>{children}</View> : null;
}
