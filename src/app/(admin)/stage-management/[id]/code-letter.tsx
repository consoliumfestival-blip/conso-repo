import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, Modal, TextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useStageManagement } from '../../../../core/hooks/useStageManagement';
import { useParticipants } from '../../../../core/hooks/useParticipants';
import { useGoBack } from '../../../../core/hooks/useGoBack';
import { ArrowLeft, RefreshCw, Lock, AlertTriangle, XCircle, Edit2 } from 'lucide-react-native';
import { useAuthStore } from '../../../../core/store/authStore';

export default function CodeLetterGeneration() {
  const { id } = useLocalSearchParams();
  const scheduleId = Array.isArray(id) ? id[0] : id;
  const goBack = useGoBack('/stage-management');

  const stage = useStageManagement({ scheduleId });
  const schedules = stage.schedules;
  const isLoadingSchedules = stage.contextQuery.isLoading || stage.schedulesQuery.isLoading;
  const schedule = schedules.find((s: any) => s.id === scheduleId);

  const { generateCodeLetters, isGeneratingCodeLetters, useParticipantConflicts } = useParticipants();
  const registrations = stage.registrations;
  const isLoadingRegs = stage.registrationsQuery.isLoading;

  const activeRegistrations = React.useMemo(() => {
    return (registrations || [])
      .filter((r: any) => r.status === 'approved' && r.is_verified === true)
      .sort((a: any, b: any) => {
        if (a.code_letter && b.code_letter) return a.code_letter.localeCompare(b.code_letter);
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
    return <ActivityIndicator color="#1B6B3A" style={{ marginTop: 40 }} />;
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
           overwrite: hasExistingLetters,
           secureStage: true,
         });
        await stage.registrationsQuery.refetch();
        const isSmart = result && (result as any).smartPriorityApplied;
        const msg = isSmart 
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
      const msg = '⚠️ Code letters have already been assigned for ALL participants. Drawing again will shuffle and OVERWRITE existing code letters. Are you sure you want to proceed?';
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
      const msg = 'Some participants already have code letters. Draw again to normalize all approved participants as A, B, C...?';
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
    if (!letter.match(/^[A-Z]$/)) {
      setEditError('Please enter a single valid letter (A-Z).');
      return;
    }

    // Check for duplicate in current event
    const isDuplicate = activeRegistrations.some((r:any) => r.id !== editingReg.id && r.code_letter === letter);
    if (isDuplicate) {
      setEditError('This letter is already assigned in this event.');
      return;
    }

    // Check for conflict
    const pConflicts = conflictsMap?.[editingReg.participant_id] || new Set();
    if (pConflicts.has(letter)) {
      setEditError('⚠️ This code letter conflicts with another simultaneous event assignment.');
      return;
    }

    try {
      await stage.updateCodeLetter({ scheduleId, registrationId: editingReg.id, codeLetter: letter });
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
      <ScrollView className="flex-1 py-3 px-3">
        <View className="flex-row items-center mb-6">
          <TouchableOpacity onPress={goBack} className="mr-3 p-2 bg-ssf-surface rounded-full">
            <ArrowLeft size={24} color="#333" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-2xl font-poppins-black text-ssf-text">Code Letters</Text>
            <Text className="font-poppins text-ssf-text-muted">{schedule.items?.item_name_en}</Text>
          </View>
        </View>

        {isShuffleLocked && (
          <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex-col gap-y-3">
            <View className="flex-row items-center gap-x-3">
              <Lock size={20} color="#B45309" />
              <Text className="font-poppins-bold text-amber-700 flex-1">
                🔒 Code Letter Shuffle Locked
              </Text>
            </View>
            {(role === 'admin' || is_superadmin) && (
              <SsfButton 
                label={isLocking ? 'Unlocking...' : 'Unlock Event'} 
                onPress={handleUnlock}
                disabled={isLocking}
                size="sm"
                className="bg-amber-600 border-amber-600 self-start"
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
                  icon={<RefreshCw size={14} color="#FFF" />}
                  size="sm"
                />
                {activeRegistrations.length > 0 && activeRegistrations.every((r: any) => r.code_letter) && (
                  <SsfButton
                    label="Lock Code Letters"
                    onPress={openLockModal}
                    className="bg-red-600 border-red-600"
                    icon={<Lock size={14} color="#FFF" />}
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
                  className={`flex-row p-3 items-center ${idx !== activeRegistrations.length - 1 ? 'border-b border-gray-100' : ''}`}
                >
                  <Text className="flex-[3] font-poppins text-sm text-ssf-text">{reg.participants?.name}</Text>
                  <Text className="flex-1 font-poppins-bold text-sm text-center text-ssf-text">{reg.participants?.chest_number}</Text>
                  <Text className="flex-1 font-poppins-black text-lg text-center text-ssf-primary">
                    {reg.code_letter || '-'}
                  </Text>
                  {!isShuffleLocked && (
                    <TouchableOpacity 
                      className="w-10 items-center justify-center p-2 rounded-full bg-blue-50"
                      onPress={() => {
                        setEditingReg(reg);
                        setNewLetter(reg.code_letter || '');
                      }}
                    >
                      <Edit2 size={16} color="#2563EB" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}
        </SsfCard>
      </ScrollView>

      {/* ───── Lock Confirmation Modal ───── */}
      {showLockModal && (
        <View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
            backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 300, padding: 20,
          }}
        >
          <View style={{ backgroundColor: '#FFF', borderRadius: 20, width: '100%', maxWidth: 360, overflow: 'hidden' }}>
            <View style={{ backgroundColor: '#DC2626', padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
              <View className="flex-row items-center gap-x-2">
                <AlertTriangle size={20} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 16 }}>Lock Shuffle?</Text>
              </View>
              {!isLocking && (
                <TouchableOpacity onPress={closeLockModal}>
                  <XCircle size={24} color="#FFF" />
                </TouchableOpacity>
              )}
            </View>

            <View style={{ padding: 24, alignItems: 'center' }}>
              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, width: '100%', marginBottom: 16 }}>
                <Text style={{ color: '#991B1B', fontSize: 13, textAlign: 'center', fontWeight: '600' }}>
                  Code Letter Shuffle Lock activate ചെയ്താൽ പിന്നീട് ഈ item/event-il code letter order മാറ്റാൻ കഴിയില്ല.
                </Text>
                <Text style={{ color: '#991B1B', fontSize: 13, textAlign: 'center', fontWeight: '600', marginTop: 8 }}>
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
                className={`w-full ${lockCountdown > 0 ? 'bg-gray-400 border-gray-400' : 'bg-red-600 border-red-600'}`}
                icon={lockCountdown === 0 ? <Lock size={18} color="#FFF" /> : undefined}
              />
            </View>
          </View>
        </View>
      )}

      {/* Manual Edit Modal */}
      <Modal visible={!!editingReg} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <Text className="font-poppins-bold text-xl mb-2">Edit Code Letter</Text>
            <Text className="font-poppins text-ssf-text-muted mb-4">{editingReg?.participants?.name}</Text>
            
            <TextInput
              value={newLetter}
              onChangeText={setNewLetter}
              placeholder="Enter letter (A-Z)"
              className="border border-ssf-border rounded-xl p-4 font-poppins-black text-2xl text-center uppercase mb-2"
              maxLength={1}
              autoCapitalize="characters"
            />
            
            {!!editError && (
              <View className="bg-red-50 p-3 rounded-lg flex-row items-start gap-x-2 mb-4">
                <AlertTriangle size={16} color="#DC2626" style={{ marginTop: 2 }} />
                <Text className="font-poppins text-sm text-red-700 flex-1">{editError}</Text>
              </View>
            )}

            <View className="flex-row gap-x-3 mt-2">
              <SsfButton 
                label="Cancel" 
                variant="outline" 
                className="flex-1" 
                onPress={() => { setEditingReg(null); setEditError(''); }} 
              />
              <SsfButton 
                label={stage.isUpdatingCodeLetter ? 'Saving...' : 'Save'}
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
