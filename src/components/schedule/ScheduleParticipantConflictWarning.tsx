import React from 'react';
import { Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { coreColor } from '@/constants/coreTheme';
import { formatScheduleTime } from '@/core/utils/scheduleTime';
import type { ScheduleParticipantConflict } from '@/services/scheduleParticipantConflictService';

const formatConflictStartTime = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return `${date.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${formatScheduleTime(date)}`;
};

export function ScheduleParticipantConflictWarning({
  conflicts,
  isLoading = false,
  error,
}: {
  conflicts?: ScheduleParticipantConflict[];
  isLoading?: boolean;
  error?: Error | null;
}) {
  if (isLoading) {
    return <Text className="mt-2 font-poppins text-[11px] text-ui-text-muted">Checking participant timing conflicts…</Text>;
  }

  if (error) {
    return <Text className="mt-2 font-poppins text-[11px] text-core-warning-amber-700">Participant conflict check is unavailable. Schedule saving is not blocked.</Text>;
  }

  if (!conflicts?.length) return null;
  const visible = conflicts.slice(0, 5);

  return (
    <View className="mt-2 rounded-xl border border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50 p-3">
      <View className="flex-row items-start gap-2">
        <AlertTriangle size={18} color={coreColor('#B45309', 'warning')} />
        <View className="flex-1">
          <Text className="font-poppins-bold text-sm text-core-warning-amber-700">Participant timing warning</Text>
          <Text className="mt-0.5 font-poppins text-xs text-core-warning-amber-700">
            {conflicts.length} participant timing conflict{conflicts.length === 1 ? '' : 's'} found. This is a warning only; saving remains available.
          </Text>
        </View>
      </View>
      {visible.map((conflict, index) => {
        const otherSchedule = conflict.conflicting_candidate_key
          ? 'another schedule being prepared'
          : `${conflict.conflicting_item_name || 'another program'}${conflict.conflicting_venue_name ? ` · ${conflict.conflicting_venue_name}` : ''}`;
        return <Text key={`${conflict.candidate_key}:${conflict.participant_id}:${conflict.conflicting_schedule_id ?? conflict.conflicting_candidate_key}:${index}`} className="mt-2 font-poppins text-[11px] text-core-warning-amber-700">
          {conflict.chest_number ? `${conflict.chest_number} · ` : ''}{conflict.participant_name || 'Participant'}{conflict.candidate_is_group_member || conflict.conflict_is_group_member ? ' (group member)' : ''} — {otherSchedule}, {formatConflictStartTime(conflict.conflicting_start_time)}–{formatScheduleTime(conflict.conflicting_end_time)}
        </Text>;
      })}
      {conflicts.length > visible.length && <Text className="mt-2 font-poppins-bold text-[11px] text-core-warning-amber-700">+ {conflicts.length - visible.length} more conflicts</Text>}
    </View>
  );
}
