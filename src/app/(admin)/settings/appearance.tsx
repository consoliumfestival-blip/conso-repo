import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Check, Monitor, Moon, Sun } from 'lucide-react-native';
import { CORE_PALETTES, CoreMode, CorePalette, DEFAULT_CORE_APPEARANCE } from '@/constants/coreTheme';
import { ui } from '@/constants/designSystem';
import { useCoreAppearance } from '@/core/contexts/CoreAppearanceContext';
import { SsfCard } from '@/components/ui/SsfCard';

export default function AppearanceSettings() {
  const theme = useCoreAppearance();
  if (Platform.OS !== 'web') return <View style={{ padding: 16 }}><Text>Appearance settings are available in the web app.</Text></View>;
  if (!theme) return null;
  const { appearance, setAppearance, colors, isDark, saveError } = theme;
  return <ScrollView contentContainerStyle={{ padding: 16, gap: 16, maxWidth: 1100, width: '100%', alignSelf: 'center' }}>
    <View><Text style={{ color: colors.text, fontSize: 25, fontWeight: '800' }}>Appearance</Text><Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 5 }}>Personalize Core and Stage Management on this device. Team Leader and Judge portals keep their own appearance.</Text></View>
    <SsfCard>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Mode</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {([{ mode: 'light', label: 'Light', icon: Sun }, { mode: 'dark', label: 'Dark', icon: Moon }, { mode: 'system', label: 'System', icon: Monitor }] as const).map(({ mode, label, icon: Icon }) => <Pressable key={mode} accessibilityRole="radio" aria-checked={appearance.mode === mode} accessibilityState={{ checked: appearance.mode === mode }} onPress={() => setAppearance({ ...appearance, mode: mode as CoreMode })} style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 11, borderWidth: 1, borderColor: appearance.mode === mode ? colors.primaryText : colors.border, backgroundColor: appearance.mode === mode ? colors.primarySoft : colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon size={17} color={appearance.mode === mode ? colors.primaryText : colors.textMuted} /><Text style={{ color: appearance.mode === mode ? colors.primaryText : colors.text, fontWeight: '600' }}>{label}</Text></Pressable>)}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>Dark mode uses one common Black palette. System follows your device setting.</Text>
    </SsfCard>
    <SsfCard>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 5 }}>Light palette</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 14 }}>{isDark ? 'Your light palette is remembered for when you switch to Light mode.' : 'Soft off-white surfaces with a coordinated accent.'}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {(Object.entries(CORE_PALETTES) as [CorePalette, typeof CORE_PALETTES[CorePalette]][]).map(([key, palette]) => {
          const selected = appearance.palette === key;
          return <Pressable key={key} accessibilityRole="radio" accessibilityLabel={palette.name} aria-checked={selected} accessibilityState={{ checked: selected }} onPress={() => setAppearance({ ...appearance, palette: key })} style={{ flexGrow: 1, flexBasis: 230, maxWidth: 340, borderRadius: 14, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.primaryText : colors.border, padding: 12, backgroundColor: colors.surface }}>
            <View style={{ flexDirection: 'row', height: 64, borderRadius: 9, overflow: 'hidden', backgroundColor: palette.background }}><View style={{ width: 32, backgroundColor: palette.sidebar }} /><View style={{ flex: 1, padding: 9, gap: 6 }}><View style={{ height: 8, width: '65%', borderRadius: 3, backgroundColor: palette.primarySoft }} /><View style={{ flex: 1, flexDirection: 'row', gap: 6 }}><View style={{ flex: 1, borderRadius: 4, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }} /><View style={{ width: 34, borderRadius: 4, backgroundColor: palette.primary }} /></View></View></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{palette.name}</Text>{selected && <Check size={17} color={colors.primaryText} />}</View>
          </Pressable>;
        })}
      </View>
    </SsfCard>
    <SsfCard><Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Preview</Text><View style={{ backgroundColor: colors.background, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 12 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Festival overview</Text><Text style={{ color: colors.textMuted, fontSize: 13 }}>Clear text, soft surfaces, and a subtle glass finish.</Text><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><View style={{ backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10 }}><Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Primary action</Text></View><View style={{ backgroundColor: colors.successSoft, borderRadius: 9, paddingHorizontal: 12, justifyContent: 'center' }}><Text style={{ color: colors.success }}>Completed</Text></View></View></View></SsfCard>
    {saveError && <Text accessibilityRole="alert" style={{ color: colors.warning, fontSize: 12 }}>{saveError}</Text>}
    <Pressable accessibilityRole="button" onPress={() => setAppearance(DEFAULT_CORE_APPEARANCE)} style={{ alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: ui.radius.md, justifyContent: 'center' }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>Reset appearance</Text></Pressable>
  </ScrollView>;
}
