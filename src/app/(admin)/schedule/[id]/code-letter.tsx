import { coreColor } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import { ui } from '@/constants/designSystem';
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useSchedule } from '../../../../core/hooks/useSchedule';
import { useParticipants } from '../../../../core/hooks/useParticipants';
import { useGoBack } from '../../../../core/hooks/useGoBack';
import { ArrowLeft, RefreshCw, Lock, Edit2, AlertTriangle } from 'lucide-react-native';
import { TextInput } from 'react-native';
import { codeLetterTarget, codeLetterPreview, compareCodeLetters } from '../../../../core/utils/codeLetters';

export default function CodeLetterGeneration() {
  const { id } = useLocalSearchParams();
  const scheduleId = Array.isArray(id) ? id[0] : id;
  const goBack = useGoBack('/(admin)/schedule');

  const { schedules, isLoadingSchedules } = useSchedule();
  const schedule = schedules.find((s: any) => s.id === scheduleId);

  const { useScheduleRegistrations, generateCodeLetters, isGeneratingCodeLetters, updateCodeLetter, isUpdatingCodeLetter, useParticipantConflicts } = useParticipants();
  const { data: registrations, isLoading: isLoadingRegs } = useScheduleRegistrations(scheduleId);

  const activeRegistrations = React.useMemo(() => {
    return (registrations || [])
      .filter((r: any) => r.status !== 'rejected' && r.is_verified === true)
      .sort((a: any, b: any) => {
        if (a.code_letter && b.code_letter) return compareCodeLetters(a.code_letter, b.code_letter);
        if (a.code_letter) return -1;
        if (b.code_letter) return 1;
        return (a.participants?.chest_number || '').localeCompare(b.participants?.chest_number || '');
      });
  }, [registrations]);

  const participantIds = React.useMemo(() => activeRegistrations.map((r:any) => r.participant_id), [activeRegistrations]);
  const { data: conflictsMap } = useParticipantConflicts(participantIds, scheduleId);

  const [editingReg, setEditingReg] = React.useState<any>(null);
  const [newLetter, setNewLetter] = React.useState<string>('');
  const [editError, setEditError] = React.useState<string>('');

  if (isLoadingSchedules || isLoadingRegs) {
    return <ActivityIndicator color={coreColor("#1B6B3A", 'primaryText')} style={{ marginTop: 40 }} />;
  }

  if (!schedule) {
    return (
      <View className="flex-1 bg-ssf-bg justify-center items-center p-6">
        <Text className="font-poppins text-ssf-text">Schedule not found.</Text>
        <SsfButton label="Go Back" onPress={goBack} className="mt-4" />
      </View>
    );
  }

  const isShuffleLocked = schedule?.is_shuffle_locked;

  const handleGenerate = async () => {
    const hasExistingLetters = activeRegistrations.some((r: any) => r.code_letter);
    const allHaveLetters = activeRegistrations.every((r: any) => r.code_letter);

    const action = async () => {
      try {
        const result = await generateCodeLetters({
          scheduleId,
          itemId: schedule.item_id,
          festivalId: schedule.festival_id,
          // Preserve every already assigned letter when only restored/new
          // participants need a letter. Overwrite is reserved for the
          // explicit full re-draw confirmation below.
          overwrite: allHaveLetters,
          secureStage: true,
        });
        const isSmart = result && (result as any).smartPriorityApplied;
        const msg = result?.conflictsUnavoidable
          ? 'Code letters assigned. Some overlapping-event letter conflicts remain; review the order.'
          : isSmart
          ? '✅ Code letters assigned successfully!\n(Smart conflict-safe priority applied)' 
          : '✅ Code letters assigned successfully!';

        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Success', msg);
        }
      } catch (error: any) {
        if (Platform.OS === 'web') {
          window.alert('❌ Error: ' + (error.message || 'Failed to generate code letters'));
        } else {
          Alert.alert('Error', error.message || 'Failed to generate code letters');
        }
      }
    };

    if (allHaveLetters) {
      const msg = 'Fixed manual letters will stay unchanged. Only the remaining letters will be redrawn. Continue?';
      if (Platform.OS === 'web') {
        if (window.confirm(msg)) {
          await action();
        }
      } else {
        Alert.alert(
          'Confirm Re-shuffle',
          msg,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Draw Letters (Overwrite)', style: 'destructive', onPress: action }
          ]
        );
      }
    } else if (hasExistingLetters) {
      // Partial assignment case
      const msg = 'Some participants already have code letters. Existing assignments will stay unchanged; only new verified participants will receive the next available letters. Continue?';
      if (Platform.OS === 'web') {
        if (window.confirm(msg)) {
          await action();
        }
      } else {
        Alert.alert(
          'Assign New Participants',
          msg,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Assign New Letters', style: 'default', onPress: action }
          ]
        );
      }
    } else {
      await action();
    }
  };

  const validateAndSaveEdit = async () => {
    setEditError('');
    const letter = newLetter.trim().toUpperCase();
    if (!letter.match(/^[A-Z]+$/)) {
      setEditError('Enter one or more letters from A to Z.');
      return;
    }

    const target = codeLetterTarget(activeRegistrations, editingReg.id, letter);
    if (target && !editingReg.code_letter) {
      setEditError('This entry has no letter to swap. Choose an unused letter.');
      return;
    }

    // Check for conflict
    const pConflicts = conflictsMap?.[editingReg.participant_id] || new Set();
    if (pConflicts.has(letter)) {
      setEditError('⚠️ This code letter conflicts with another simultaneous event assignment.');
      return;
    }

    try {
      await updateCodeLetter({ registrationId: editingReg.id, codeLetter: letter, itemId: schedule.item_id, scheduleId, secureStage: true,
        expectedLetter: editingReg.code_letter, expectedSwapId: target?.id ?? null });
      setEditingReg(null);
      setNewLetter('');
    } catch (err: any) {
      setEditError(err.message || 'Failed to update code letter.');
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-ssf-bg"
      contentContainerStyle={{ width: '100%', maxWidth: 960, alignSelf: 'center', padding: 12, paddingBottom: 28 }}
    >
      <View className="flex-row items-center mb-3">
        <TouchableOpacity onPress={goBack} className="mr-3 h-9 w-9 items-center justify-center rounded-lg border border-ui-border bg-core-surface-white">
          <ArrowLeft size={18} color={ui.colors.text} />
        </TouchableOpacity>
        <View>
          <Text className="text-lg font-poppins-black text-ssf-text">Code Letters</Text>
          <Text className="font-poppins text-[11px] text-ssf-text-muted">{schedule.items?.item_name_en}</Text>
        </View>
      </View>

      {isShuffleLocked && (
        <View className="bg-core-warning-soft-amber-50 border border-core-warning-soft-amber-200 rounded-lg p-3 mb-3 flex-row items-center gap-x-3">
          <Lock size={20} color={coreColor("#B45309", 'warning')} />
          <Text className="font-poppins-bold text-core-warning-amber-700">🔒 Code Letter Shuffle Locked by Stage Portal</Text>
        </View>
      )}

      <SsfCard className="mb-6 p-0 overflow-hidden">
        <View className="flex-row justify-between items-center border-b border-ui-border p-3">
          <Text className="font-poppins-bold text-sm text-ssf-text">
            Participants ({activeRegistrations.length})
          </Text>
          {!isShuffleLocked && (
            <SsfButton
              label={isGeneratingCodeLetters ? 'Drawing...' : 'Draw Letters'}
              onPress={handleGenerate}
              disabled={isGeneratingCodeLetters || activeRegistrations.length === 0}
              icon={<RefreshCw size={14} color={ui.colors.onPrimary} />}
            />
          )}
        </View>

        {activeRegistrations.length === 0 ? (
          <Text className="font-poppins text-ssf-text-muted">No active participants registered for this item yet.</Text>
        ) : (
          <View>
            <View className="flex-row bg-ui-muted p-3 border-b border-ssf-border">
              <Text className="flex-[3] font-poppins-bold text-xs text-ssf-text-muted uppercase">Participant</Text>
              <Text className="flex-1 font-poppins-bold text-xs text-ssf-text-muted uppercase text-center">Chest No</Text>
              <Text className="flex-1 font-poppins-bold text-xs text-ssf-text-muted uppercase text-center">Code Letter</Text>
              {!isShuffleLocked && (
                <Text className="w-10 text-center"></Text>
              )}
            </View>
            {activeRegistrations.map((reg: any, idx: number) => (
              <View
                key={reg.id}
                className={`min-h-[52px] flex-row px-3 py-2 items-center ${idx !== activeRegistrations.length - 1 ? 'border-b border-core-border-gray-100' : ''}`}
              >
                <Text className="flex-[3] font-poppins text-sm text-ssf-text">{reg.participants?.name}</Text>
                <Text className="flex-1 font-poppins-bold text-sm text-center text-ssf-text">{reg.participants?.chest_number}</Text>
                <View className="flex-1 items-center">
                  <Text className="font-poppins-black text-lg text-ui-primary-text">{reg.code_letter || '-'}</Text>
                  {reg.code_letter_fixed ? <Text className="font-poppins text-[10px] text-ssf-text-muted">Fixed</Text> : null}
                </View>
                {!isShuffleLocked && (
                  <TouchableOpacity 
                    className="w-10 items-center justify-center p-2 rounded-full bg-core-info-soft-blue-50"
                    onPress={() => {
                      setEditingReg(reg);
                      setNewLetter(reg.code_letter || '');
                    }}
                  >
                    <Edit2 size={16} color={coreColor("#2563EB", 'info')} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}
      </SsfCard>

      {/* Manual Edit Modal */}
      <Modal visible={!!editingReg} transparent animationType="fade">
        <View className="flex-1 bg-core-surface-strong-black/50 justify-center items-center p-4">
          <View className="bg-core-surface-white rounded-xl border border-ui-border p-5 w-full max-w-sm">
            <Text className="font-poppins-bold text-xl mb-2">{editingReg?.code_letter ? 'Edit Code Letter' : 'Assign Code Letter'}</Text>
            <Text className="font-poppins text-ssf-text-muted mb-4">{editingReg?.participants?.name}</Text>
            
            <TextInput
              value={newLetter}
              editable={!isUpdatingCodeLetter}
              onChangeText={setNewLetter}
              placeholder="Enter code (A-Z, AA, AB...)"
              className="h-10 border border-ssf-border rounded-xl px-3 font-poppins-black text-xl text-center uppercase mb-2"
              autoCapitalize="characters"
            />
            <Text className="font-poppins text-xs text-ssf-text-muted mb-2">{codeLetterPreview(editingReg?.code_letter ?? null, newLetter,
              codeLetterTarget(activeRegistrations, editingReg?.id, newLetter)?.participants?.name)}</Text>
            
            {!!editError && (
              <View className="bg-core-danger-soft-red-50 p-3 rounded-lg flex-row items-start gap-x-2 mb-4">
                <AlertTriangle size={16} color={coreColor("#DC2626", 'danger')} style={{ marginTop: 2 }} />
                <Text className="font-poppins text-sm text-core-danger-red-700 flex-1">{editError}</Text>
              </View>
            )}

            <View className="flex-row gap-x-3 mt-2">
              <SsfButton 
                label="Cancel" 
                variant="outline" 
                disabled={isUpdatingCodeLetter}
                className="flex-1" 
                onPress={() => { setEditingReg(null); setEditError(''); }} 
              />
              <SsfButton 
                label={isUpdatingCodeLetter ? 'Saving...' : codeLetterTarget(activeRegistrations, editingReg?.id, newLetter) ? 'Swap' : 'Assign'}
                className="flex-1" 
                onPress={validateAndSaveEdit} 
                disabled={isUpdatingCodeLetter}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
