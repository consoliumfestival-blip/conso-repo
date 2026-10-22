import React from 'react';
import { Text, View } from 'react-native';

export function GroupEntryRoster({ entry }: { entry: {
  entry_kind?: string;
  members?: { name: string; chest_number: string | null }[];
} }) {
  if (entry.entry_kind !== 'general_team') return null;
  return <View className="mt-1">
    <Text className="font-poppins-bold text-[10px] text-emerald-700">General group · Check in this entry once</Text>
    <Text className="font-poppins text-[11px] leading-4 text-ssf-text-muted">
      {entry.members?.length ? entry.members.map(member => `${member.name}${member.chest_number ? ` (${member.chest_number})` : ''}`).join(', ') : 'Roster unavailable'}
    </Text>
  </View>;
}
