import { coreColor, coreAlpha } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, TextInput, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useStageManagement } from '../../../../core/hooks/useStageManagement';
import { useParticipants } from '../../../../core/hooks/useParticipants';
import { useGoBack } from '../../../../core/hooks/useGoBack';
import { ArrowLeft, RefreshCw, Lock, AlertTriangle, XCircle, Edit2, Users } from 'lucide-react-native';
import { useAuthStore } from '../../../../core/store/authStore';
import { codeLetterTarget, codeLetterPreview, compareCodeLetters } from '../../../../core/utils/codeLetters';

export default function CodeLetterGeneration() {
  const { id } = useLocalSearchParams();
  const scheduleId = Array.isArray(id) ? id[0] : id;
  const goBack = useGoBack('/stage-management');
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const stage = useStageManagement({ scheduleId });
  const schedules = stage.schedules;
  const isLoadingSchedules = stage.contextQuery.isLoading || stage.schedulesQuery.isLoading;
  const schedule = schedules.find((s: any) => s.id === scheduleId);

  const { generateCodeLetters, isGeneratingCodeLetters, useParticipantConflicts } = useParticipants();
  const registrations = stage.registrations;
  const isLoadingRegs = stage.registrationsQuery.isLoading;

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

  const [editingReg, setEditingReg] = useState<any>(null);
  const [newLetter, setNewLetter] = useState<string>('');
  const [editError, setEditError] = useState<string>('');

  // Lock Modal State
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(10);
  const [isLocking, setIsLocking] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (showLockModal && lockCountdown > 0) {
      timer = setInterval(() => {
        setLockCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showLockModal, lockCountdown]);

  const { role, is_superadmin } = useAuthStore();
  
  const openLockModal = () => {
    setLockCountdown(10);
    setShowLockModal(true);
  };

  const closeLockModal = () => {
    if (isLocking) return;
    setShowLockModal(false);
    setLockCountdown(10);
  };

  const handleUnlock = async () => {
    setIsLocking(true);
    try {
      await stage.updateScheduleLock({ scheduleId, locked: false });
      if (Platform.OS === 'web') {
        window.alert('🔓 Event unlocked successfully.');
      } else {
        Alert.alert('Unlocked', 'Event unlocked successfully.');
      }
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert('Error unlocking event: ' + e.message);
      else Alert.alert('Error', e.message);
    } finally {
      setIsLocking(false);
    }
  };



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

  const isShuffleLocked = schedule.is_shuffle_locked;

  const handleGenerate = async () => {
    if (isShuffleLocked) {
      Alert.alert('Locked', 'Code letter shuffling is locked for this event.');
      return;
    }

    const hasExistingLetters = activeRegistrations.some((r: any) => r.code_letter);
    const allHaveLetters = activeRegistrations.every((r: any) => r.code_letter);

    const action = async () => {
      try {
        const result = await generateCodeLetters({
           scheduleId,
           itemId: schedule.item_id,
           festivalId: schedule.festival_id,
           overwrite: allHaveLetters,
           secureStage: true,
         });
        await stage.registrationsQuery.refetch();
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
      const msg = 'Existing assignments will stay unchanged. Draw only the remaining letters for verified participants?';
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
            { text: 'Normalize & Draw', style: 'default', onPress: action }
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
      await stage.updateCodeLetter({ scheduleId, registrationId: editingReg.id, codeLetter: letter,
        expectedLetter: editingReg.code_letter, expectedSwapId: target?.id ?? null });
      await stage.registrationsQuery.refetch();
      setEditingReg(null);
      setNewLetter('');
    } catch (err: any) {
      setEditError(err.message || 'Failed to update code letter.');
    }
  };

  const handleFinalLockApprove = async () => {
    setIsLocking(true);
    try {
      await stage.updateScheduleLock({ scheduleId: schedule.id, locked: true });
      setShowLockModal(false);
      if (Platform.OS === 'web') {
        window.alert('🔒 Code letters are now locked permanently.');
      } else {
        Alert.alert('Locked', 'Code letters are now locked permanently.');
      }
    } catch (error: any) {
      if (Platform.OS === 'web') {
        window.alert('❌ Error locking schedule: ' + error.message);
      } else {
        Alert.alert('Error', error.message);
      }
    } finally {
      setIsLocking(false);
    }
  };

  return (
    <View className="flex-1 bg-ssf-bg">
      {isMobile ? (
      <ScrollView className="flex-1 px-3 py-3" keyboardShouldPersistTaps="handled">
        <View className="mb-3 flex-row items-center gap-2">
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Stage Management" onPress={goBack} className="h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ui-border bg-core-surface-white">
            <ArrowLeft size={19} color={coreColor("#0F172A", 'overlay')} />
          </TouchableOpacity>
          <View className="min-w-0 flex-1">
            <Text className="font-poppins-black text-base text-ssf-text">Code Letters</Text>
            <Text numberOfLines={1} className="font-poppins text-xs text-ssf-text-muted">{schedule.items?.item_name_en}</Text>
          </View>
        </View>

        {isShuffleLocked ? (
          <View className="mb-3 rounded-xl border border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50 p-3">
            <View className="flex-row items-start gap-2">
              <Lock size={17} color={coreColor("#B45309", 'warning')} />
              <Text className="flex-1 font-poppins-bold text-xs leading-5 text-core-warning-amber-800">Code-letter shuffle is locked. Assignments are read-only.</Text>
            </View>
            {(role === 'admin' || is_superadmin) ? (
              <TouchableOpacity accessibilityRole="button" onPress={handleUnlock} disabled={isLocking} className={`mt-2 h-11 items-center justify-center rounded-lg bg-core-warning-action-amber-600 px-4 ${isLocking ? 'opacity-60' : ''}`}>
                <Text className="font-poppins-bold text-xs text-core-on-primary-white">{isLocking ? 'Unlocking…' : 'Unlock event'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <SsfCard className="mb-3 p-3">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="font-poppins-bold text-sm text-ssf-text">Participants</Text>
              <Text className="mt-0.5 font-poppins text-xs text-ssf-text-muted">Verified entries eligible for code letters</Text>
            </View>
            <View className="min-w-11 items-center rounded-lg bg-core-primary-soft-teal-50 px-2 py-1.5">
              <Text className="font-poppins-black text-base text-ui-primary-text">{activeRegistrations.length}</Text>
            </View>
          </View>

          {!isShuffleLocked && activeRegistrations.length > 0 ? (
            <View className="mt-3 flex-row gap-2">
              <TouchableOpacity
                accessibilityRole="button"
                onPress={handleGenerate}
                disabled={isGeneratingCodeLetters}
                className={`h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg bg-ssf-primary px-2 ${isGeneratingCodeLetters ? 'opacity-60' : ''}`}
              >
                <RefreshCw size={15} color={coreColor("#FFFFFF", 'onPrimary')} />
                <Text className="font-poppins-bold text-[11px] text-core-on-primary-white">{isGeneratingCodeLetters ? 'Drawing…' : 'Draw letters'}</Text>
              </TouchableOpacity>
              {activeRegistrations.every((r: any) => r.code_letter) ? (
                <TouchableOpacity accessibilityRole="button" onPress={openLockModal} className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-core-danger-soft-red-200 bg-core-danger-soft-red-50 px-2">
                  <Lock size={15} color={coreColor("#B91C1C", 'danger')} />
                  <Text className="font-poppins-bold text-[11px] text-core-danger-red-700">Lock letters</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </SsfCard>

        {activeRegistrations.length === 0 ? (
          <SsfCard className="mb-6 items-center py-8">
            <Users size={28} color={coreColor("#94A3B8", 'textSubtle')} />
            <Text className="mt-2 text-center font-poppins text-sm text-ssf-text-muted">No verified participants are available for this event.</Text>
          </SsfCard>
        ) : (
          <View className="gap-y-2 pb-6">
            {activeRegistrations.map((reg: any) => (
              <SsfCard key={reg.id} className="p-3">
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-core-surface-muted-slate-100">
                    <Text className="font-poppins-black text-[10px] text-core-text-slate-700">{reg.participants?.chest_number || '—'}</Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={2} className="font-poppins-bold text-sm text-ssf-text">{reg.participants?.name || 'Participant'}</Text>
                    <Text numberOfLines={1} className="mt-0.5 font-poppins text-xs text-ssf-text-muted">Chest {reg.participants?.chest_number || '—'}</Text>
                  </View>
                  <View className="h-11 min-w-11 items-center justify-center rounded-lg border border-core-primary-soft-teal-100 bg-core-primary-soft-teal-50 px-2">
                    <Text className="font-poppins-black text-lg text-ui-primary-text">{reg.code_letter || '—'}</Text>
                  </View>
                </View>
                <View className="mt-2 flex-row items-center justify-between">
                  {reg.code_letter_fixed ? (
                    <View className="rounded-full border border-core-border-slate-200 bg-core-surface-muted-slate-50 px-2.5 py-1">
                      <Text className="font-poppins-bold text-[10px] text-core-text-slate-600">Fixed letter</Text>
                    </View>
                  ) : <View />}
                  {!isShuffleLocked ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Edit code letter for ${reg.participants?.name || 'participant'}`}
                      onPress={() => { setEditingReg(reg); setNewLetter(reg.code_letter || ''); setEditError(''); }}
                      className="h-11 flex-row items-center justify-center gap-1.5 rounded-lg border border-core-info-soft-blue-200 bg-core-info-soft-blue-50 px-3"
                    >
                      <Edit2 size={15} color={coreColor("#2563EB", 'info')} />
                      <Text className="font-poppins-bold text-xs text-core-info-blue-700">Edit letter</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </SsfCard>
            ))}
          </View>
        )}
      </ScrollView>
      ) : (
      <ScrollView className="flex-1 py-3 px-3">
        <View className="flex-row items-center mb-6">
          <TouchableOpacity onPress={goBack} className="mr-3 p-2 bg-ssf-surface rounded-full">
            <ArrowLeft size={24} color={coreColor("#333", 'text')} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-2xl font-poppins-black text-ssf-text">Code Letters</Text>
            <Text className="font-poppins text-ssf-text-muted">{schedule.items?.item_name_en}</Text>
          </View>
        </View>

        {isShuffleLocked && (
          <View className="bg-core-warning-soft-amber-50 border border-core-warning-soft-amber-200 rounded-xl p-4 mb-4 flex-col gap-y-3">
            <View className="flex-row items-center gap-x-3">
              <Lock size={20} color={coreColor("#B45309", 'warning')} />
              <Text className="font-poppins-bold text-core-warning-amber-700 flex-1">
                🔒 Code Letter Shuffle Locked
              </Text>
            </View>
            {(role === 'admin' || is_superadmin) && (
              <SsfButton 
                label={isLocking ? 'Unlocking...' : 'Unlock Event'} 
                onPress={handleUnlock}
                disabled={isLocking}
                size="sm"
                className="bg-core-warning-action-amber-600 border-core-warning-amber-600 self-start"
              />
            )}
          </View>
        )}

        <SsfCard className="mb-6">
          <View className="flex-row justify-between items-center mb-4 flex-wrap gap-y-2">
            <Text className="font-poppins-bold text-lg text-ssf-text">
              Participants ({activeRegistrations.length})
            </Text>
            {!isShuffleLocked && (
              <View className="flex-row gap-x-2">
                <SsfButton
                  label={isGeneratingCodeLetters ? 'Drawing...' : 'Draw Letters'}
                  onPress={handleGenerate}
                  disabled={isGeneratingCodeLetters || activeRegistrations.length === 0}
                  icon={<RefreshCw size={14} color={coreColor("#FFF", 'onPrimary')} />}
                  size="sm"
                />
                {activeRegistrations.length > 0 && activeRegistrations.every((r: any) => r.code_letter) && (
                  <SsfButton
                    label="Lock Code Letters"
                    onPress={openLockModal}
                    className="bg-core-danger-action-red-600 border-core-danger-red-600"
                    icon={<Lock size={14} color={coreColor("#FFF", 'onPrimary')} />}
                    size="sm"
                  />
                )}
              </View>
            )}
          </View>

          {activeRegistrations.length === 0 ? (
            <Text className="font-poppins text-ssf-text-muted">No active participants registered for this item yet.</Text>
          ) : (
            <View className="border border-ssf-border rounded-xl overflow-hidden">
              <View className="flex-row bg-ssf-surface p-3 border-b border-ssf-border">
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
                  className={`flex-row p-3 items-center ${idx !== activeRegistrations.length - 1 ? 'border-b border-core-border-gray-100' : ''}`}
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
      </ScrollView>
      )}

      {/* ───── Lock Confirmation Modal ───── */}
      {showLockModal && (
        <View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
            backgroundColor: coreAlpha(coreColor('#000000', 'surface'), 0.85), justifyContent: 'center', alignItems: 'center', zIndex: 300, padding: 20,
          }}
        >
          <View style={{ backgroundColor: coreColor('#FFF', 'surface'), borderRadius: 20, width: '100%', maxWidth: 360, overflow: 'hidden' }}>
            <View style={{ backgroundColor: coreColor('#DC2626', 'dangerAction'), padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
              <View className="flex-row items-center gap-x-2">
                <AlertTriangle size={20} color={coreColor("#FFF", 'onPrimary')} />
                <Text style={{ color: coreColor('#FFF', 'onPrimary'), fontWeight: '900', fontSize: 16 }}>Lock Shuffle?</Text>
              </View>
              {!isLocking && (
                <TouchableOpacity onPress={closeLockModal}>
                  <XCircle size={24} color={coreColor("#FFF", 'onPrimary')} />
                </TouchableOpacity>
              )}
            </View>

            <View style={{ padding: 24, alignItems: 'center' }}>
              <View style={{ backgroundColor: coreColor('#FEF2F2', 'dangerSoft'), borderRadius: 10, padding: 12, width: '100%', marginBottom: 16 }}>
                <Text style={{ color: coreColor('#991B1B', 'danger'), fontSize: 13, textAlign: 'center', fontWeight: '600' }}>
                  Code Letter Shuffle Lock activate ചെയ്താൽ പിന്നീട് ഈ item/event-il code letter order മാറ്റാൻ കഴിയില്ല.
                </Text>
                <Text style={{ color: coreColor('#991B1B', 'danger'), fontSize: 13, textAlign: 'center', fontWeight: '600', marginTop: 8 }}>
                  Please verify the final order before approval.
                </Text>
              </View>

              <SsfButton
                label={
                  isLocking ? 'Locking...' :
                  lockCountdown > 0 ? `Approve available in ${lockCountdown}...` : 'Final Approve Lock'
                }
                onPress={handleFinalLockApprove}
                disabled={lockCountdown > 0 || isLocking}
                className={`w-full ${lockCountdown > 0 ? 'bg-core-primary-gray-400 border-core-border-strong-gray-400' : 'bg-core-danger-action-red-600 border-core-danger-red-600'}`}
                icon={lockCountdown === 0 ? <Lock size={18} color={coreColor("#FFF", 'onPrimary')} /> : undefined}
              />
            </View>
          </View>
        </View>
      )}

      {/* Manual Edit Modal */}
      <Modal visible={!!editingReg} transparent animationType="fade">
        <View className="flex-1 bg-core-surface-strong-black/50 justify-center items-center p-4">
          <View className="bg-core-surface-white rounded-2xl p-6 w-full max-w-sm">
            <Text className="font-poppins-bold text-xl mb-2">{editingReg?.code_letter ? 'Edit Code Letter' : 'Assign Code Letter'}</Text>
            <Text className="font-poppins text-ssf-text-muted mb-4">{editingReg?.participants?.name}</Text>
            
            <TextInput
              value={newLetter}
              editable={!stage.isUpdatingCodeLetter}
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
                disabled={stage.isUpdatingCodeLetter}
                className="flex-1" 
                onPress={() => { setEditingReg(null); setEditError(''); }} 
              />
              <SsfButton 
                label={stage.isUpdatingCodeLetter ? 'Saving...' : codeLetterTarget(activeRegistrations, editingReg?.id, newLetter) ? 'Swap' : 'Assign'}
                className="flex-1" 
                onPress={validateAndSaveEdit} 
                disabled={stage.isUpdatingCodeLetter}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
