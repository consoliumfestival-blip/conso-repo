import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { ScheduleSubstage } from '@/core/utils/scheduleSubstages';

type Props = { stages: ScheduleSubstage[]; onChange: (stages: ScheduleSubstage[]) => void };
const inputClass = 'h-10 rounded-lg border border-ui-border px-3 font-poppins text-sm text-ssf-text';

export function SubstageEditor({ stages, onChange }: Props) {
  const update = (stageIndex: number, change: Partial<ScheduleSubstage>) =>
    onChange(stages.map((stage, index) => index === stageIndex ? { ...stage, ...change } : stage));
  return (
    <View className="gap-3 rounded-xl border border-ui-border p-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-poppins-bold text-sm text-ssf-text">Optional sub-stages</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => onChange([...stages, {
          id: `stage-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: `Stage ${stages.length + 1}`, ranges: [{ from: '', to: '' }],
        }])}><Text className="font-poppins-bold text-sm text-ui-primary-text">Add stage</Text></TouchableOpacity>
      </View>
      <Text className="font-poppins text-xs text-ssf-text-muted">Add every chest-number range for each stage. Ranges cannot overlap.</Text>
      {stages.map((stage, stageIndex) => (
        <View key={stage.id} className="gap-2 rounded-lg border border-ui-border p-3">
          <View className="flex-row items-center gap-2">
            <TextInput accessibilityLabel={`Stage ${stageIndex + 1} name`} value={stage.name}
              onChangeText={(name) => update(stageIndex, { name })} className={`${inputClass} flex-1`} />
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${stage.name}`}
              onPress={() => onChange(stages.filter((_, index) => index !== stageIndex))}>
              <Text className="font-poppins text-sm text-core-danger-red-700">Remove</Text>
            </TouchableOpacity>
          </View>
          {stage.ranges.map((range, rangeIndex) => (
            <View key={rangeIndex} className="flex-row items-center gap-2">
              {(['from', 'to'] as const).map((field) => (
                <TextInput key={field} accessibilityLabel={`${stage.name} chest ${field}`} keyboardType="number-pad"
                  value={String(range[field])} placeholder={field === 'from' ? 'From' : 'To'}
                  onChangeText={(text) => {
                    const ranges = stage.ranges.map((entry, index) => index === rangeIndex
                      ? { ...entry, [field]: text.replace(/[^0-9]/g, '') } : entry);
                    update(stageIndex, { ranges });
                  }} className={`${inputClass} flex-1`} />
              ))}
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Remove range"
                onPress={() => update(stageIndex, { ranges: stage.ranges.filter((_, index) => index !== rangeIndex) })}>
                <Text className="font-poppins text-sm text-core-danger-red-700">×</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity accessibilityRole="button" onPress={() => update(stageIndex, { ranges: [...stage.ranges, { from: '', to: '' }] })}>
            <Text className="font-poppins-bold text-sm text-ui-primary-text">Add chest range</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}
