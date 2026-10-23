import React, { useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { GeneralTeamEntry, generalEntryService } from '../../services/generalEntryService';
import { invalidateGeneralMembership } from '../../core/utils/invalidateGeneralMembership';

export function GroupEntryDeleteDialog({ entry, festivalId, onClose, onDeleted }: {
  entry: GeneralTeamEntry; festivalId: string; onClose: () => void; onDeleted: () => void;
}) {
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    if (saving) return;
    setSaving(true); setError('');
    try {
      const result = await generalEntryService.remove(entry.id);
      if (result.status !== 'removed') throw new Error(result.message || 'Entry not found. Refresh the page.');
      await Promise.allSettled([
        invalidateGeneralMembership(client, festivalId, result.member_ids ?? entry.members.map(member => member.participant_id)),
        ...[['festivalRegistrations', festivalId], ['participantRegistrations'], ['scheduleRegistrations'],
          ['entrySizes'], ['itemRegistrations', entry.item?.id], ['program-intake-statuses', festivalId]]
          .map(queryKey => client.invalidateQueries({ queryKey })),
      ]);
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the entry.');
    } finally { setSaving(false); }
  };
  return <Modal visible transparent animationType="fade" onRequestClose={() => !saving && onClose()}>
    <View className="flex-1 items-center justify-center bg-black/40 p-3">
      <View className="max-h-[90%] w-full max-w-md rounded-xl bg-white p-4">
        <ScrollView>
          <Text className="font-poppins-bold text-base text-ui-text">Delete group entry?</Text>
          <Text className="mt-2 font-poppins text-sm text-ui-text">{entry.item?.item_name_en || entry.item?.item_code} · {entry.organisation?.name}</Text>
          <Text className="mt-2 font-poppins text-xs text-ui-text-muted">This removes the whole entry and its member assignments. Students, their chest numbers and team remain. Entries with check-in, marks, results or other competition history cannot be deleted.</Text>
          {!!error && <Text accessibilityRole="alert" className="mt-2 font-poppins text-xs text-red-700">{error}</Text>}
          <View className="mt-4 flex-row flex-wrap justify-end gap-2">
            <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={onClose} className="min-h-11 justify-center rounded-lg border border-ui-border px-3"><Text className="font-poppins-bold text-xs text-ui-text">Cancel</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={remove} className={`min-h-11 justify-center rounded-lg bg-red-700 px-3 ${saving ? 'opacity-50' : ''}`}><Text className="font-poppins-bold text-xs text-white">{saving ? 'Deleting…' : 'Delete entry'}</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
