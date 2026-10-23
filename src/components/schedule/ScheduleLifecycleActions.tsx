import { coreColor, coreAlpha } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { Check, ChevronDown, Pencil, Play, Trophy } from 'lucide-react-native';
import { SsfActionMenu } from '@/components/ui/SsfActionMenu';
import type { SsfActionMenuItem } from '@/components/ui/SsfActionMenu';
import { normalizeScheduleLifecycleStatus, ScheduleLifecycleStatus } from '@/core/utils/scheduleLifecycle';

const choices: { value: ScheduleLifecycleStatus; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'ongoing', label: 'Started' },
  { value: 'completed', label: 'Completed' },
];

export function ScheduleLifecycleActions({
  scheduleName,
  status,
  disabled,
  additionalItems = [],
  accessibilityLabel,
  open,
  onOpenChange,
  onStatusChange,
}: {
  scheduleName: string;
  status: string | null | undefined;
  disabled?: boolean;
  additionalItems?: SsfActionMenuItem[];
  accessibilityLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onStatusChange: (status: ScheduleLifecycleStatus, expectedStatus: string | null | undefined) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ScheduleLifecycleStatus>(normalizeScheduleLifecycleStatus(status) ?? 'scheduled');
  const [saving, setSaving] = useState(false);
  const current = normalizeScheduleLifecycleStatus(status);

  const confirm = (next: ScheduleLifecycleStatus) => {
    if (next === current || disabled || saving) return;
    const label = choices.find((choice) => choice.value === next)?.label ?? next;
    const message = `Change “${scheduleName}” to ${label}?`;
    const run = () => {
      setSaving(true);
      void onStatusChange(next, status).catch((error: any) => {
        const detail = error?.message || 'Please try again.';
        if (Platform.OS === 'web') window.alert(`Unable to update status\n\n${detail}`);
        else Alert.alert('Unable to update status', detail);
      }).finally(() => setSaving(false));
    };
    if (Platform.OS === 'web') {
      if (window.confirm(message)) run();
      return;
    }
    Alert.alert('Confirm status change', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, onPress: run },
    ]);
  };

  const saveDraft = () => {
    setEditing(false);
    confirm(draft);
  };

  return (
    <>
      <SsfActionMenu
        accessibilityLabel={accessibilityLabel ?? `Event status actions for ${scheduleName}`}
        open={open}
        onOpenChange={onOpenChange}
        items={[
          ...additionalItems,
          { label: current === 'ongoing' ? 'Started' : 'Start Event', icon: <Play size={15} color={coreColor("#0F766E", 'primaryText')} />, disabled: disabled || saving || current === 'ongoing' || current === 'completed', onPress: () => confirm('ongoing') },
          { label: current === 'completed' ? 'Completed' : 'Complete Event', icon: <Trophy size={15} color={coreColor("#0F766E", 'primaryText')} />, disabled: disabled || saving || current !== 'ongoing', onPress: () => confirm('completed') },
          { label: 'Edit Status', separatorBefore: true, icon: <Pencil size={15} color={coreColor("#64748B", 'textMuted')} />, disabled: disabled || saving, onPress: () => { setDraft(current ?? 'scheduled'); setEditing(true); } },
        ]}
      />
      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: coreAlpha(coreColor('#0f172a', 'overlay'), 0.45) }}>
          <Pressable accessibilityLabel="Close status editor" onPress={() => setEditing(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ alignSelf: 'center', width: '100%', maxWidth: 390, padding: 20, borderRadius: 18, borderWidth: 1, borderColor: coreColor('#E5E7EB', 'border'), backgroundColor: coreColor('#FFFFFF', 'surface'), gap: 14 }}>
            <View>
              <Text style={{ color: coreColor('#1F2937', 'text'), fontSize: 17, fontWeight: '800' }}>Edit event status</Text>
              <Text numberOfLines={2} style={{ marginTop: 4, color: coreColor('#6B7280', 'text'), fontSize: 12 }}>{scheduleName}</Text>
            </View>
            {choices.map((choice) => {
              const selected = draft === choice.value;
              return (
                <Pressable key={choice.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setDraft(choice.value)} style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: selected ? coreColor('#0F766E', 'border') : coreColor('#E5E7EB', 'border'), backgroundColor: selected ? coreColor('#F0FDFA', 'primarySoft') : coreColor('#FFFFFF', 'surface'), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: selected ? coreColor('#0F766E', 'primaryText') : coreColor('#374151', 'text'), fontSize: 13, fontWeight: selected ? '700' : '500' }}>{choice.label}</Text>
                  {selected ? <Check size={17} color={coreColor("#0F766E", 'primaryText')} /> : null}
                </Pressable>
              );
            })}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
              <Pressable accessibilityRole="button" onPress={() => setEditing(false)} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: coreColor('#E5E7EB', 'border') }}><Text style={{ color: coreColor('#4B5563', 'text'), fontSize: 12, fontWeight: '700' }}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={saving} onPress={saveDraft} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 10, backgroundColor: coreColor('#0F766E', 'primary'), opacity: saving ? 0.6 : 1 }}><Text style={{ color: coreColor('#FFFFFF', 'onPrimary'), fontSize: 12, fontWeight: '700' }}>{saving ? 'Saving…' : 'Save status'}</Text><ChevronDown size={14} color={coreColor("#FFFFFF", 'onPrimary')} /></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
