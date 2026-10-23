import { coreColor } from '@/constants/coreTheme';
import React from 'react';
import { GroupEntryRoster } from './GroupEntryRoster';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Lock,
  LockKeyhole,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react-native';
import { SsfButton } from '@/components/ui/SsfButton';
import { SsfCard } from '@/components/ui/SsfCard';
import { SsfSelectMenu } from '@/components/ui/SsfSelectMenu';
import { stageManagementService, StageRegistrationRow, StageScheduleRow } from '@/services/stageManagementService';
import { codeLetterTarget, codeLetterPreview } from '@/core/utils/codeLetters';
import { invalidateCodeLetters } from '@/core/utils/invalidateCodeLetters';
import { useCodeLetterUpdates } from '@/core/hooks/useCodeLetterUpdates';
import { ScheduleLifecycleActions } from '@/components/schedule/ScheduleLifecycleActions';
import { getScheduleLifecycleLabel, normalizeScheduleLifecycleStatus } from '@/core/utils/scheduleLifecycle';

type PortalRegistration = StageRegistrationRow & {
  entry_kind?: string;
  members?: { name: string; chest_number: string | null }[];
};

type PortalMode = 'checkin' | 'codes';

const message = (title: string, body: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${body}`);
  else Alert.alert(title, body);
};

const confirmAction = (title: string, body: string, action: () => void) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${body}`)) action();
    return;
  }
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Continue', style: 'destructive', onPress: action },
  ]);
};

const dateText = (value: string | null) => value ? new Date(value).toLocaleDateString() : '—';
const timeText = (value: string | null) => value
  ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  : '—';

function WorkflowBadges({ registrations, status, isShuffleLocked }: { registrations: PortalRegistration[]; status?: string | null; isShuffleLocked?: boolean }) {
  const active = registrations.filter((row) => row.status !== 'rejected');
  const verified = active.filter((row) => row.is_verified);
  const checkinDone = (active.length > 0 && active.every((row) => row.is_verified)) || isShuffleLocked;
  const checkinPending = active.length > 0 && active.some((row) => !row.is_verified);
  const codesDone = (verified.length > 0 && verified.every((row) => !!row.code_letter)) || isShuffleLocked;
  const codesPending = verified.length > 0 && verified.some((row) => !row.code_letter);

  return (
    <View className="flex-row flex-wrap gap-1.5">
      {status ? <Badge label={getScheduleLifecycleLabel(status)} tone={normalizeScheduleLifecycleStatus(status) === 'completed' ? 'gray' : normalizeScheduleLifecycleStatus(status) === 'ongoing' ? 'green' : 'blue'} /> : null}
      {checkinDone && codesDone ? <Badge label="Ready to start" tone="green" /> : null}
      {!checkinDone && checkinPending ? <Badge label="Check-in Pending" tone="amber" /> : null}
      {!codesDone && codesPending ? <Badge label="Codes Pending" tone="gray" /> : null}
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: 'green' | 'amber' | 'blue' | 'gray' }) {
  const classes = {
    green: 'bg-core-success-soft-emerald-50 border-core-success-soft-emerald-200 text-core-success-emerald-700',
    amber: 'bg-core-warning-soft-amber-100 border-core-warning-soft-amber-200 text-core-warning-amber-700',
    blue: 'bg-core-info-soft-sky-50 border-core-info-soft-sky-200 text-core-info-sky-700',
    gray: 'bg-core-surface-muted-gray-100 border-core-border-gray-200 text-core-text-muted-gray-500',
  }[tone];
  return (
    <View className={`h-6 self-start flex-row items-center rounded-md border px-2 ${classes.split(' ').slice(0, 2).join(' ')}`}>
      <Text className={`font-poppins-bold text-[9px] ${classes.split(' ')[2]}`}>{label}</Text>
    </View>
  );
}

export default function StageVenuePortal({ venueId }: { venueId: string }) {
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [pinInput, setPinInput] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('All');
  const [selectedStatus, setSelectedStatus] = React.useState('All');
  const [selectedScheduleId, setSelectedScheduleId] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<PortalMode>('checkin');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [entrySearch, setEntrySearch] = React.useState('');
  const [editingEntry, setEditingEntry] = React.useState<PortalRegistration | null>(null);
  const [letterDraft, setLetterDraft] = React.useState('');
  const [letterError, setLetterError] = React.useState('');

  const venueQuery = useQuery({
    queryKey: ['stage-venue-portal', venueId, pin],
    queryFn: () => stageManagementService.getVenuePortalData(venueId, pin),
    enabled: !!pin,
    retry: false,
    staleTime: 0,
  });
  const schedules = venueQuery.data?.schedules ?? [];
  const registrations = (venueQuery.data?.registrations ?? []) as PortalRegistration[];
  useCodeLetterUpdates(pin ? `venue:${venueId}` : null, () => venueQuery.refetch());
  const selectedSchedule = schedules.find((row) => row.id === selectedScheduleId) ?? null;

  const refresh = async () => {
    await venueQuery.refetch();
  };

  const submitPin = () => {
    if (!/^\d{4}$/.test(pinInput)) {
      message('PIN required', 'Enter the four-digit PIN provided for this stage.');
      return;
    }
    setPin(pinInput);
    setPinInput('');
  };

  const runMutation = async (id: string, operation: () => Promise<unknown>, successText: string) => {
    setBusyId(id);
    try {
      const result = await operation();
      await venueQuery.refetch();
      const warning = (result as { conflictsUnavoidable?: boolean } | null)?.conflictsUnavoidable
        ? '\nSome overlapping-event letter conflicts remain. Review the assigned order.' : '';
      message('Updated', successText + warning);
    } catch (error: any) {
      message('Unable to update', error?.message || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const eventRegistrations = (scheduleId: string) => registrations.filter((row) => row.schedule_id === scheduleId);
  const categories = ['All', ...Array.from(new Set(schedules.flatMap((row) => row.category_codes ?? []))).sort()];
  const statuses = [
    { id: 'All', name: 'All Statuses' },
    { id: 'scheduled', name: 'Scheduled' },
    { id: 'ongoing', name: 'Started' },
    { id: 'completed', name: 'Completed' },
    { id: 'checkin_pending', name: 'Check-in Pending' },
    { id: 'checkin_done', name: 'Check-in Completed' },
    { id: 'codes_pending', name: 'Codes Pending' },
    { id: 'codes_done', name: 'Codes Shuffled' },
  ];

  const filteredSchedules = schedules.filter((schedule) => {
    const text = search.trim().toLocaleLowerCase();
    const rowRegs = eventRegistrations(schedule.id).filter((row) => row.status !== 'rejected');
    const verified = rowRegs.filter((row) => row.is_verified);
    const checkinDone = rowRegs.length > 0 && rowRegs.every((row) => row.is_verified);
    const checkinPending = rowRegs.length > 0 && rowRegs.some((row) => !row.is_verified);
    const codesDone = verified.length > 0 && verified.every((row) => !!row.code_letter);
    const codesPending = verified.length > 0 && verified.some((row) => !row.code_letter);
    const categoryMatch = selectedCategory === 'All' || (schedule.category_codes ?? []).includes(selectedCategory);
    const textMatch = !text || [schedule.item_name_en, schedule.item_name_ml, schedule.item_code, ...(schedule.category_codes ?? [])]
      .some((value) => String(value ?? '').toLocaleLowerCase().includes(text));
    const statusMatch = selectedStatus === 'All'
      || (['scheduled', 'ongoing', 'completed'].includes(selectedStatus) && normalizeScheduleLifecycleStatus(schedule.status) === selectedStatus)
      || (selectedStatus === 'checkin_pending' && checkinPending)
      || (selectedStatus === 'checkin_done' && checkinDone)
      || (selectedStatus === 'codes_pending' && codesPending)
      || (selectedStatus === 'codes_done' && codesDone);
    return categoryMatch && textMatch && statusMatch;
  });

  const openSchedule = (schedule: StageScheduleRow, nextMode: PortalMode) => {
    setSelectedScheduleId(schedule.id);
    setMode(nextMode);
    setEntrySearch('');
    setLetterError('');
  };

  const drawCodeLetters = async () => {
    if (!selectedSchedule) return;
    const eligible = eventRegistrations(selectedSchedule.id).filter((row) => row.status !== 'rejected' && row.is_verified);
    const overwrite = eligible.length > 0 && eligible.every((row) => !!row.code_letter);
    if (overwrite) {
      const action = () => runMutation(
        `draw-${selectedSchedule.id}`,
        () => stageManagementService.venuePortalDrawLetters(venueId, pin, selectedSchedule.id, true),
        'Code letters were assigned.',
      );
      confirmAction('Redraw code letters?', 'Fixed manual letters will stay unchanged. Only the remaining letters will be redrawn.', () => { void action(); });
      return;
    }
    await runMutation(
      `draw-${selectedSchedule.id}`,
      () => stageManagementService.venuePortalDrawLetters(venueId, pin, selectedSchedule.id, false),
      'Code letters were assigned.',
    );
  };

  const updateRegistration = (entry: PortalRegistration, action: 'verify' | 'unverify' | 'reject' | 'restore') => {
    if (!selectedSchedule) return;
    const execute = () => runMutation(
      entry.id,
      () => stageManagementService.venuePortalUpdateRegistration(venueId, pin, selectedSchedule.id, entry.id, action),
      action === 'verify' ? 'Entry checked in.'
        : action === 'unverify' ? 'Check-in removed.'
          : action === 'reject' ? 'Entry rejected.' : 'Entry restored.',
    );
    if (action === 'reject') {
      confirmAction('Reject entry?', `Reject ${entry.participant_name || 'this entry'}?`, () => { void execute(); });
    } else {
      void execute();
    }
  };

  const saveLetter = async () => {
    if (!selectedSchedule || !editingEntry) return;
    const letter = letterDraft.trim().toUpperCase();
    setLetterError('');
    if (!/^[A-Z]$/.test(letter)) {
      setLetterError('Enter one letter from A to Z.');
      return;
    }
    const target = codeLetterTarget(eventRegistrations(selectedSchedule.id), editingEntry.id, letter);
    if (target && !editingEntry.code_letter) {
      setLetterError('This entry has no letter to swap. Choose an unused letter.');
      return;
    }
    try {
      setBusyId(editingEntry.id);
      await stageManagementService.venuePortalUpdateCodeLetter(venueId, pin, selectedSchedule.id, editingEntry.id, letter,
        editingEntry.code_letter, target?.id ?? null);
      await invalidateCodeLetters(queryClient, { venueId, scheduleId: selectedSchedule.id });
      setEditingEntry(null);
      setLetterDraft('');
      message('Updated', target ? 'Code letters swapped and fixed for future draws.' : 'Code letter assigned and fixed for future draws.');
    } catch (error: any) {
      setLetterError(error?.message || 'Unable to save this code letter.');
    } finally {
      setBusyId(null);
    }
  };

  if (!pin) {
    return (
      <View className="flex-1 bg-ssf-bg items-center justify-center px-5 py-8">
        <SsfCard className={`w-full max-w-md shadow-sm ${isMobile ? 'p-4' : 'p-6'}`}>
          <View className="mb-4 h-12 w-12 items-center justify-center rounded-xl bg-core-primary-soft-teal-50"><LockKeyhole size={23} color={coreColor("#0F766E", 'primaryText')} /></View>
          <Text className="text-2xl font-poppins-black text-ssf-text">Stage access</Text>
          <Text className="mt-1 font-poppins text-sm text-ssf-text-muted">Enter the four-digit PIN provided for this stage.</Text>
          <TextInput
            accessibilityLabel="Four-digit stage PIN"
            value={pinInput}
            onChangeText={(value) => setPinInput(value.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            placeholder="••••"
            onSubmitEditing={submitPin}
            className="mt-5 h-10 rounded-xl border border-ssf-border bg-core-surface-white px-4 text-center text-xl tracking-[10px] text-ssf-text"
          />
          <SsfButton label="Continue" onPress={submitPin} className="mt-3 w-full" />
        </SsfCard>
      </View>
    );
  }

  if (venueQuery.isLoading) return <View className="flex-1 items-center justify-center bg-ssf-bg"><ActivityIndicator size="large" color={coreColor("#0F766E", 'primaryText')} /></View>;
  if (venueQuery.isError) {
    return (
      <View className="flex-1 items-center justify-center bg-ssf-bg px-5">
        <SsfCard className={`w-full max-w-md ${isMobile ? 'p-4' : 'p-6'}`}>
          <Text className="font-poppins-bold text-lg text-ssf-text">Stage access was not granted</Text>
          <Text className="mt-2 font-poppins text-sm text-ssf-text-muted">{(venueQuery.error as Error).message}</Text>
          <SsfButton
            label="Try another PIN"
            onPress={() => {
              queryClient.removeQueries({ queryKey: ['stage-venue-portal', venueId, pin], exact: true });
              setPin('');
              setPinInput('');
            }}
            className="mt-4"
          />
        </SsfCard>
      </View>
    );
  }

  if (selectedSchedule) {
    const allEntries = eventRegistrations(selectedSchedule.id);
    const visibleEntries = allEntries.filter((entry) => {
      const query = entrySearch.trim().toLocaleLowerCase();
      if (!query) return true;
      return [entry.participant_name, entry.participant_chest_number, entry.organisation_name,
        ...(entry.members ?? []).flatMap((member) => [member.name, member.chest_number])]
        .some((value) => String(value ?? '').toLocaleLowerCase().includes(query));
    });
    const activeEntries = allEntries.filter((entry) => entry.status !== 'rejected');
    const eligibleForCodes = activeEntries.filter((entry) => entry.is_verified);
    const verifiedCount = activeEntries.filter((entry) => entry.is_verified).length;
    const isLocked = selectedSchedule.is_shuffle_locked;
    const allVerified = activeEntries.length > 0 && verifiedCount === activeEntries.length;

    return (
      <View className="flex-1 bg-ssf-bg">
        <ScrollView className="flex-1 px-3 py-3" refreshControl={<RefreshControl refreshing={venueQuery.isRefetching} onRefresh={refresh} />}>
          <View className="mb-4 flex-row items-center">
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to stage events" onPress={() => setSelectedScheduleId(null)} className={`${isMobile ? 'mr-2 h-11 w-11 rounded-xl' : 'mr-3 h-9 w-9 rounded-lg'} shrink-0 items-center justify-center border border-ui-border bg-core-surface-white`}>
              <ArrowLeft size={18} color={coreColor("#0F172A", 'overlay')} />
            </TouchableOpacity>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={isMobile ? 1 : undefined} className={`${isMobile ? 'text-base' : 'text-xl'} font-poppins-black text-ssf-text`}>{mode === 'checkin' ? 'Green Room Check-In' : 'Code Letters'}</Text>
              <Text numberOfLines={1} className="font-poppins text-xs text-ssf-text-muted">{selectedSchedule.item_name_en || selectedSchedule.item_code}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh stage data" onPress={refresh} className={`${isMobile ? 'h-11 w-11 rounded-xl' : 'h-9 w-9 rounded-lg'} ml-2 shrink-0 items-center justify-center border border-ui-border bg-core-surface-white`}>
              <RefreshCw size={15} color={coreColor("#475569", 'text')} />
            </TouchableOpacity>
          </View>

          {isLocked ? (
            <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50 p-3">
              <Lock size={17} color={coreColor("#B45309", 'warning')} />
              <Text className="flex-1 font-poppins-bold text-xs text-core-warning-amber-800">Event is locked. Check-in and code letters are read-only.</Text>
            </View>
          ) : null}

          {mode === 'checkin' ? (
            <>
              <SsfCard className="mb-3 p-3">
                <View className="mb-2 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2"><Users size={17} color={coreColor("#1B6B3A", 'primaryText')} /><Text className="font-poppins-bold text-ssf-text">Verified</Text></View>
                  <Text className="font-poppins-bold text-lg text-ui-primary-text">{verifiedCount}/{activeEntries.length}</Text>
                </View>
                <View className="h-2 w-full overflow-hidden rounded-full bg-core-surface-muted-gray-100"><View className="h-2 rounded-full bg-ssf-primary" style={{ width: activeEntries.length ? `${verifiedCount / activeEntries.length * 100}%` : '0%' }} /></View>
                {allVerified ? (
                  <View className={`mt-3 ${isMobile ? 'gap-y-2' : 'flex-row items-center justify-between'}`}>
                    <View className="flex-row items-center gap-1"><ShieldCheck size={16} color={coreColor("#16A34A", 'success')} /><Text className="font-poppins-bold text-sm text-core-success-green-700">All Participants Verified!</Text></View>
                    {isMobile ? (
                      <TouchableOpacity accessibilityRole="button" onPress={() => setMode('codes')} className="mt-2 h-11 w-full items-center justify-center rounded-lg bg-ssf-primary px-3">
                        <Text className="font-poppins-bold text-xs text-core-on-primary-white">Start Draw →</Text>
                      </TouchableOpacity>
                    ) : <SsfButton label="Start Draw →" size="sm" onPress={() => setMode('codes')} />}
                  </View>
                ) : activeEntries.length > 0 ? (
                  <Text className="mt-3 font-poppins-bold text-xs text-core-warning-amber-700">{activeEntries.length - verifiedCount} participants remaining unverified.</Text>
                ) : null}
              </SsfCard>
              <View className="mb-3 h-10 flex-row items-center rounded-lg border border-ssf-border bg-core-surface-white px-3">
                <Search size={16} color={coreColor("#9CA3AF", 'textMuted')} />
                <TextInput value={entrySearch} onChangeText={setEntrySearch} placeholder="Search by name or chest number..." className="ml-2 h-full flex-1 font-poppins text-sm text-ssf-text" />
                {entrySearch ? <TouchableOpacity onPress={() => setEntrySearch('')}><X size={15} color={coreColor("#9CA3AF", 'textMuted')} /></TouchableOpacity> : null}
              </View>
            </>
          ) : (
            <SsfCard className={`mb-3 ${isMobile ? 'p-3' : 'p-4'}`}>
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <Text className="font-poppins-bold text-lg text-ssf-text">Participants ({eligibleForCodes.length})</Text>
                {!isLocked ? isMobile ? (
                  <TouchableOpacity accessibilityRole="button" onPress={drawCodeLetters} disabled={busyId === `draw-${selectedSchedule.id}` || eligibleForCodes.length === 0} className={`h-11 w-full flex-row items-center justify-center rounded-lg bg-ssf-primary px-3 ${busyId === `draw-${selectedSchedule.id}` || eligibleForCodes.length === 0 ? 'opacity-50' : ''}`}>
                    <RefreshCw size={14} color={coreColor("#FFFFFF", 'onPrimary')} />
                    <Text className="ml-2 font-poppins-bold text-xs text-core-on-primary-white">{busyId === `draw-${selectedSchedule.id}` ? 'Drawing...' : 'Draw Letters'}</Text>
                  </TouchableOpacity>
                ) : <SsfButton label={busyId === `draw-${selectedSchedule.id}` ? 'Drawing...' : 'Draw Letters'} onPress={drawCodeLetters} disabled={busyId === `draw-${selectedSchedule.id}` || eligibleForCodes.length === 0} icon={<RefreshCw size={14} color={coreColor("#FFF", 'onPrimary')} />} size="sm" /> : null}
              </View>
              <Text className="mt-1 font-poppins text-xs text-ssf-text-muted">Only checked-in entries are included. Fixed manual letters stay unchanged.</Text>
            </SsfCard>
          )}

          {visibleEntries.length === 0 ? (
            <SsfCard className="mb-6 items-center py-8">
              <Users size={28} color={coreColor("#94A3B8", 'textSubtle')} />
              <Text className="mt-2 text-center font-poppins text-sm text-ssf-text-muted">No participants found.</Text>
            </SsfCard>
          ) : isMobile ? (
            <View className="mb-6 gap-y-2">
              {visibleEntries.map((entry) => {
                const rejected = entry.status === 'rejected';
                const eligible = entry.status !== 'rejected' && !!entry.is_verified;
                const saving = busyId === entry.id;
                const statusStyle = rejected ? 'border-core-danger-soft-red-200 bg-core-danger-soft-red-50 text-core-danger-red-700' : entry.is_verified ? 'border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50 text-core-success-emerald-700' : 'border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50 text-core-warning-amber-800';
                return (
                  <SsfCard key={entry.id} className={`p-3 ${rejected ? 'opacity-70' : ''}`}>
                    <View className="flex-row items-start gap-3">
                      <View className={`h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 ${rejected ? 'border-core-danger-soft-red-300 bg-core-danger-soft-red-50' : entry.is_verified ? 'border-core-success-green-500 bg-core-success-soft-green-50' : 'border-core-border-gray-300 bg-core-surface-muted-gray-50'}`}>
                        <Text numberOfLines={1} className={`font-poppins-black text-[10px] ${rejected ? 'text-core-danger-red-600' : entry.is_verified ? 'text-core-success-green-700' : 'text-core-text-gray-600'}`}>{entry.participant_chest_number || '?'}</Text>
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={2} className={`font-poppins-bold text-sm ${rejected ? 'text-core-text-muted-slate-400 line-through' : 'text-ssf-text'}`}>{entry.participant_name || 'Entry'}</Text>
                        <Text numberOfLines={1} className="mt-0.5 font-poppins text-xs text-ssf-text-muted">{entry.organisation_name || '—'}{entry.entry_kind === 'general_team' ? ' · Team' : ''}</Text>
                        <GroupEntryRoster entry={entry} />
                      </View>
                      {mode === 'checkin' ? (
                        <View className={`min-h-7 shrink-0 items-center justify-center rounded-full border px-2 ${statusStyle.split(' ').slice(0, 2).join(' ')}`}>
                          <Text className={`font-poppins-bold text-[9px] ${statusStyle.split(' ')[2]}`}>{rejected ? 'Rejected' : entry.is_verified ? 'Verified' : 'Pending'}</Text>
                        </View>
                      ) : (
                        <View className={`h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border px-2 ${eligible ? 'border-core-primary-soft-teal-100 bg-core-primary-soft-teal-50' : 'border-core-border-slate-200 bg-core-surface-muted-slate-50'}`}>
                          <Text className={`font-poppins-black text-lg ${eligible ? 'text-ui-primary-text' : 'text-core-text-muted-slate-300'}`}>{eligible ? entry.code_letter || '—' : '—'}</Text>
                        </View>
                      )}
                    </View>
                    {mode === 'checkin' ? (
                      !isLocked ? (
                        <View className="mt-3 flex-row gap-2">
                          {rejected ? (
                            <PortalAction label="Restore" mobile disabled={saving} onPress={() => updateRegistration(entry, 'restore')} />
                          ) : (
                            <>
                              <PortalAction label={entry.is_verified ? 'Undo' : 'Verify'} mobile disabled={saving} onPress={() => updateRegistration(entry, entry.is_verified ? 'unverify' : 'verify')} />
                              <PortalAction label="Reject" mobile danger disabled={saving} onPress={() => updateRegistration(entry, 'reject')} />
                            </>
                          )}
                        </View>
                      ) : null
                    ) : (
                      <View className="mt-2 flex-row items-center justify-between">
                        {eligible && entry.code_letter_fixed ? <Text className="font-poppins text-[10px] text-ssf-text-muted">Fixed letter</Text> : <View />}
                        {eligible && !isLocked ? <PortalAction label={entry.code_letter ? 'Edit letter' : 'Assign letter'} mobile disabled={!!busyId} onPress={() => { setEditingEntry(entry); setLetterDraft(entry.code_letter || ''); setLetterError(''); }} /> : null}
                      </View>
                    )}
                  </SsfCard>
                );
              })}
            </View>
          ) : (
          <SsfCard className="mb-6 overflow-hidden p-0">
            {visibleEntries.map((entry) => {
              const rejected = entry.status === 'rejected';
              const eligible = entry.status !== 'rejected' && !!entry.is_verified;
              const saving = busyId === entry.id;
              return (
                <View key={entry.id} className={`flex-row items-center justify-between gap-3 border-b border-core-border-gray-100 px-3 py-2.5 ${rejected ? 'opacity-60' : ''}`}>
                  <View className="flex-1 flex-row items-center">
                    <View className={`mr-3 h-10 w-10 items-center justify-center rounded-full border-2 ${rejected ? 'border-core-danger-red-400 bg-core-danger-soft-red-50' : entry.is_verified ? 'border-core-success-green-500 bg-core-success-soft-green-50' : 'border-core-border-gray-300 bg-core-surface-muted-gray-50'}`}>
                      <Text numberOfLines={1} className={`font-poppins-black text-[10px] ${rejected ? 'text-core-danger-red-600' : entry.is_verified ? 'text-core-success-green-700' : 'text-core-text-gray-600'}`}>{entry.participant_chest_number || '?'}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className={`font-poppins-bold text-sm ${rejected ? 'text-core-text-muted-slate-400 line-through' : 'text-ssf-text'}`}>{entry.participant_name || 'Entry'}</Text>
                      <Text className="font-poppins text-[11px] text-ssf-text-muted">{entry.organisation_name || '—'}{entry.entry_kind === 'general_team' ? ' · Team' : ''}</Text>
                        <GroupEntryRoster entry={entry} />
                    </View>
                  </View>
                  {mode === 'checkin' ? (
                    <View className="flex-row items-center gap-1.5">
                      {entry.is_verified ? <CheckCircle2 size={16} color={coreColor("#16A34A", 'success')} /> : null}
                      <Text className="mr-1 font-poppins-bold text-[10px] text-ssf-text-muted">{rejected ? 'Rejected' : entry.is_verified ? 'Verified' : 'Pending'}</Text>
                      {!isLocked ? rejected
                        ? <PortalAction label="Restore" disabled={saving} onPress={() => updateRegistration(entry, 'restore')} />
                        : <>
                          <PortalAction label={entry.is_verified ? 'Undo' : 'Verify'} disabled={saving} onPress={() => updateRegistration(entry, entry.is_verified ? 'unverify' : 'verify')} />
                          <PortalAction label="Reject" danger disabled={saving} onPress={() => updateRegistration(entry, 'reject')} />
                        </>
                        : null}
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-2">
                      <View className="min-w-[24px] items-center">
                        <Text className={`font-poppins-black text-lg ${eligible ? 'text-ui-primary-text' : 'text-core-text-muted-slate-300'}`}>{eligible ? entry.code_letter || '—' : '—'}</Text>
                        {eligible && entry.code_letter_fixed ? <Text className="font-poppins text-[10px] text-ssf-text-muted">Fixed</Text> : null}
                      </View>
                      {eligible && !isLocked ? <PortalAction label={entry.code_letter ? 'Edit' : 'Assign'} disabled={!!busyId} onPress={() => { setEditingEntry(entry); setLetterDraft(entry.code_letter || ''); setLetterError(''); }} /> : null}
                    </View>
                  )}
                </View>
              );
            })}
          </SsfCard>
          )}

          {mode === 'codes' && !isLocked && eligibleForCodes.length > 0 && eligibleForCodes.every((entry) => !!entry.code_letter) ? (
            isMobile ? (
              <TouchableOpacity accessibilityRole="button" onPress={() => confirmAction('Lock this event?', 'Code letters and check-in changes will become read-only.', () => {
                void runMutation(`lock-${selectedSchedule.id}`, () => stageManagementService.venuePortalLockSchedule(venueId, pin, selectedSchedule.id), 'Event locked.');
              })} className="mb-6 h-11 flex-row items-center justify-center rounded-lg border border-ui-border bg-core-surface-white px-3">
                <Lock size={14} color={coreColor("#475569", 'text')} /><Text className="ml-2 font-poppins-bold text-xs text-ui-text">Lock code-letter shuffle</Text>
              </TouchableOpacity>
            ) : (
              <SsfButton
                label="Lock code-letter shuffle"
                variant="outline"
                onPress={() => confirmAction('Lock this event?', 'Code letters and check-in changes will become read-only.', () => {
                  void runMutation(`lock-${selectedSchedule.id}`, () => stageManagementService.venuePortalLockSchedule(venueId, pin, selectedSchedule.id), 'Event locked.');
                })}
                className="mb-6 self-start"
                icon={<Lock size={14} color={coreColor("#475569", 'text')} />}
              />
            )
          ) : null}
        </ScrollView>

        {editingEntry ? (
          <View className="absolute inset-0 z-50 items-center justify-center bg-core-surface-strong-black/50 p-4">
            <SsfCard className="w-full max-w-sm p-5">
              <Text className="font-poppins-bold text-lg text-ssf-text">{editingEntry.code_letter ? 'Edit Code Letter' : 'Assign Code Letter'}</Text>
              <Text className="mb-4 mt-1 font-poppins text-sm text-ssf-text-muted">{editingEntry.participant_name}</Text>
              <TextInput value={letterDraft} editable={!busyId} onChangeText={(value) => setLetterDraft(value.slice(-1).toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="A-Z" maxLength={1} autoCapitalize="characters" className="h-10 rounded-xl border border-ssf-border text-center font-poppins-black text-xl text-ssf-text" />
              <Text className="mt-2 font-poppins text-xs text-ssf-text-muted">{codeLetterPreview(editingEntry.code_letter, letterDraft,
                codeLetterTarget(eventRegistrations(selectedSchedule.id), editingEntry.id, letterDraft)?.participant_name || undefined)}</Text>
              {letterError ? <Text className="mt-2 font-poppins text-xs text-core-danger-red-600">{letterError}</Text> : null}
              <View className="mt-4 flex-row gap-2">
                <SsfButton label="Cancel" variant="outline" className="flex-1" disabled={!!busyId} onPress={() => setEditingEntry(null)} />
                <SsfButton label={busyId === editingEntry.id ? 'Saving...' : codeLetterTarget(eventRegistrations(selectedSchedule.id), editingEntry.id, letterDraft) ? 'Swap' : 'Assign'} className="flex-1" onPress={() => { void saveLetter(); }} disabled={!!busyId} />
              </View>
            </SsfCard>
          </View>
        ) : null}
      </View>
    );
  }

  const filteredCategory = selectedCategory !== 'All';
  const filteredWorkflow = selectedStatus !== 'All';

  return (
      <ScrollView className={`flex-1 bg-ssf-bg ${isMobile ? 'px-3 py-3' : 'px-4 py-6'}`} refreshControl={<RefreshControl refreshing={venueQuery.isRefetching} onRefresh={refresh} />}>
      <View className="mb-5 flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text numberOfLines={isMobile ? 2 : undefined} className={`${isMobile ? 'text-xl' : 'text-3xl'} font-poppins-black text-ssf-text`}>{venueQuery.data?.venue.name || 'Stage Management'}</Text>
          <Text className="mt-1 font-poppins text-sm text-ssf-text-muted">{filteredSchedules.length} scheduled events</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh stage events" onPress={refresh} disabled={venueQuery.isRefetching} className={`${isMobile ? 'h-11 w-11' : 'h-9 w-9'} items-center justify-center rounded-xl border border-ssf-border bg-core-surface-white`}>
          <RefreshCw size={16} color={coreColor("#475569", 'text')} />
        </TouchableOpacity>
      </View>

      <View className="mb-4 flex-row flex-wrap gap-3">
        <View className="min-w-[140px] flex-1 flex-row items-center justify-between rounded-xl border border-ui-border bg-core-surface-white p-3">
          <View><Text className="font-poppins-black text-lg text-ui-text">1</Text><Text className="font-poppins text-xs text-ui-text-muted">Venue</Text></View><MapPin color={coreColor("#0F766E", 'primaryText')} size={22} />
        </View>
        <View className="min-w-[140px] flex-1 flex-row items-center justify-between rounded-xl border border-ui-border bg-core-surface-white p-3">
          <View><Text className="font-poppins-black text-lg text-ui-text">{filteredSchedules.length}</Text><Text className="font-poppins text-xs text-ui-text-muted">Scheduled Events</Text></View><Calendar color={coreColor("#0F766E", 'primaryText')} size={22} />
        </View>
      </View>

      <View className="mb-3 h-11 flex-row items-center rounded-xl border border-ui-border bg-core-surface-white px-4">
        <Search size={18} color={coreColor("#9CA3AF", 'textMuted')} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search by item name or category (e.g. LP, UP)..." className="ml-2 h-full flex-1 font-poppins text-sm text-ssf-text" />
        {search ? <TouchableOpacity onPress={() => setSearch('')}><X size={16} color={coreColor("#9CA3AF", 'textMuted')} /></TouchableOpacity> : null}
      </View>

      <View className="mb-5 rounded-xl border border-ui-border bg-core-surface-white p-3">
        <View className="flex-row flex-wrap items-center gap-2">
          <SsfSelectMenu
            value={selectedCategory}
            onValueChange={setSelectedCategory}
            accessibilityLabel="Filter by category"
            width={isMobile ? Math.max(120, (width - 72) / 2) : 180}
            compact
            active={filteredCategory}
            options={categories.map((category) => ({ label: category === 'All' ? 'Category: All' : `Category: ${category}`, value: category }))}
          />
          <SsfSelectMenu
            value={selectedStatus}
            onValueChange={setSelectedStatus}
            accessibilityLabel="Filter by workflow status"
            width={isMobile ? Math.max(180, width - 56) : 210}
            compact
            active={filteredWorkflow}
            options={statuses.map((status) => ({ label: status.id === 'All' ? 'Workflow: All' : `Workflow: ${status.name}`, value: status.id }))}
          />
          {filteredCategory || filteredWorkflow ? (
            <TouchableOpacity onPress={() => { setSelectedCategory('All'); setSelectedStatus('All'); }} className="h-9 flex-row items-center justify-center rounded-lg border border-ui-border bg-core-surface-white px-3">
              <RotateCcw size={13} color={coreColor("#64748B", 'textMuted')} /><Text className="ml-1.5 font-poppins-bold text-[10px] text-ui-text-muted">Reset</Text>
            </TouchableOpacity>
          ) : null}
          <View className="h-9 items-center justify-center rounded-lg bg-ui-muted px-3"><Text className="font-poppins-bold text-[10px] text-ui-text-muted">{filteredSchedules.length} results</Text></View>
        </View>
      </View>

      {schedules.length === 0 ? (
        <SsfCard className="items-center py-10"><Calendar size={44} color={coreColor("#D1D5DB", 'textMuted')} /><Text className="mt-3 text-center font-poppins text-sm text-ssf-text-muted">No schedules assigned to this stage yet.</Text></SsfCard>
      ) : filteredSchedules.length === 0 ? (
        <SsfCard className="items-center py-10"><Search size={42} color={coreColor("#D1D5DB", 'textMuted')} /><Text className="mt-3 text-center font-poppins text-sm text-ssf-text-muted">No scheduled events found matching your search or filters.</Text><TouchableOpacity onPress={() => { setSearch(''); setSelectedCategory('All'); setSelectedStatus('All'); }} className="mt-4"><Text className="font-poppins-bold text-sm text-ui-primary-text">Reset All Filters</Text></TouchableOpacity></SsfCard>
      ) : !isMobile ? (
        <View className="w-full overflow-hidden rounded-xl border border-ui-border bg-core-surface-white">
          <View className="h-11 flex-row items-center border-b border-ui-border bg-ui-muted px-4">
            <Text style={{ flex: 1.4 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Event</Text>
            <Text style={{ flex: 1 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Venue / Category</Text>
            <Text style={{ flex: 1 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Date & Time</Text>
            <Text style={{ flex: 1.3 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Workflow</Text>
            <Text style={{ width: 190 }} className="text-right font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Actions</Text>
          </View>
          {filteredSchedules.map((schedule) => (
            <View key={schedule.id} className="min-h-16 flex-row items-center border-b border-ui-border bg-core-surface-white px-4 py-2">
              <View style={{ flex: 1.4 }} className="pr-3"><Text numberOfLines={1} className="font-poppins-bold text-xs text-ui-text">{schedule.item_name_en || 'Unknown Event'}</Text><Text numberOfLines={1} className="mt-0.5 font-poppins text-[10px] text-ui-text-muted">{schedule.item_name_ml || schedule.item_code || '—'}</Text></View>
              <View style={{ flex: 1 }} className="items-start pr-3"><View className="rounded-md border border-core-success-soft-emerald-100 bg-core-success-soft-emerald-50 px-2 py-1"><Text numberOfLines={1} className="font-poppins-bold text-[9px] text-core-success-emerald-700">{schedule.venue_name || venueQuery.data?.venue.name || 'Stage'}</Text></View>{!!schedule.category_codes?.length ? <Text className="mt-1 font-poppins-bold text-[9px] text-core-primary-text-teal-700">{schedule.category_codes.join(', ')}</Text> : null}</View>
              <View style={{ flex: 1 }} className="pr-3"><View className="flex-row items-center"><Calendar size={12} color={coreColor("#64748B", 'textMuted')} /><Text className="ml-1.5 font-poppins text-[10px] text-ui-text-muted">{dateText(schedule.start_time)}</Text></View><View className="mt-1 flex-row items-center"><Clock size={12} color={coreColor("#64748B", 'textMuted')} /><Text className="ml-1.5 font-poppins text-[10px] text-ui-text-muted">{timeText(schedule.start_time)} – {timeText(schedule.end_time)}</Text></View></View>
              <View style={{ flex: 1.3 }} className="pr-3"><WorkflowBadges status={schedule.status} isShuffleLocked={schedule.is_shuffle_locked} registrations={eventRegistrations(schedule.id)} /></View>
              <View style={{ width: 235 }} className="flex-row justify-end gap-x-2"><PortalAction label="Check-in" onPress={() => openSchedule(schedule, 'checkin')} /><PortalAction label="Code Letters" primary onPress={() => openSchedule(schedule, 'codes')} /><ScheduleLifecycleActions scheduleName={schedule.item_name_en || 'Event'} status={schedule.status} disabled={busyId === `status-${schedule.id}`} onStatusChange={(status, expectedStatus) => runMutation(`status-${schedule.id}`, () => stageManagementService.venuePortalSetScheduleStatus(venueId, pin, schedule.id, status, expectedStatus), `Event status changed to ${getScheduleLifecycleLabel(status)}.`)} /></View>
            </View>
          ))}
        </View>
      ) : (
        <View className="gap-y-4">
          {filteredSchedules.map((schedule) => (
            <SsfCard key={schedule.id} className={isMobile ? 'p-3' : 'p-4'}>
              <View className="mb-2">
                <Text numberOfLines={2} className="font-poppins-bold text-base text-ssf-text">{schedule.item_name_en || 'Unknown Event'}</Text>
                {schedule.item_name_ml ? <Text numberOfLines={1} className="mt-0.5 font-poppins text-xs text-ssf-text-muted">{schedule.item_name_ml}</Text> : null}
                <View className="mt-2 self-start rounded bg-core-success-soft-green-100 px-2 py-1"><Text className="font-poppins-bold text-xs text-core-success-green-800">{schedule.venue_name || venueQuery.data?.venue.name || 'Stage'}</Text></View>
                {!!schedule.category_codes?.length ? <View className="mt-2 flex-row flex-wrap gap-1">{schedule.category_codes.map((code) => <View key={code} className="rounded-full border border-ssf-primary/20 bg-ssf-primary/10 px-2 py-0.5"><Text className="font-poppins-bold text-[10px] text-ui-primary-text">{code}</Text></View>)}</View> : null}
              </View>
              <View className="mb-3 flex-row flex-wrap items-center gap-x-4 gap-y-1"><View className="flex-row items-center gap-x-1"><Clock size={13} color={coreColor("#6B7280", 'text')} /><Text className="font-poppins text-xs text-core-text-gray-600">{timeText(schedule.start_time)} – {timeText(schedule.end_time)}</Text></View><View className="flex-row items-center gap-x-1"><Calendar size={13} color={coreColor("#6B7280", 'text')} /><Text className="font-poppins text-xs text-core-text-gray-600">{dateText(schedule.start_time)}</Text></View></View>
              <WorkflowBadges status={schedule.status} isShuffleLocked={schedule.is_shuffle_locked} registrations={eventRegistrations(schedule.id)} />
              <View className="mt-3 flex-row gap-x-2 border-t border-core-border-gray-100 pt-3"><SsfButton label="Check-In" variant="outline" size={isMobile ? 'md' : 'sm'} className="flex-1" onPress={() => openSchedule(schedule, 'checkin')} /><SsfButton label="Code Letters" variant="outline" size={isMobile ? 'md' : 'sm'} className="flex-1" onPress={() => openSchedule(schedule, 'codes')} /><ScheduleLifecycleActions scheduleName={schedule.item_name_en || 'Event'} status={schedule.status} disabled={busyId === `status-${schedule.id}`} onStatusChange={(status, expectedStatus) => runMutation(`status-${schedule.id}`, () => stageManagementService.venuePortalSetScheduleStatus(venueId, pin, schedule.id, status, expectedStatus), `Event status changed to ${getScheduleLifecycleLabel(status)}.`)} /></View>
            </SsfCard>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function PortalAction({ label, onPress, disabled, danger, primary, mobile }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean; primary?: boolean; mobile?: boolean }) {
  const style = primary ? 'border-core-primary-teal-700 bg-core-primary-teal-700 text-core-on-primary-white' : danger ? 'border-core-danger-soft-red-200 bg-core-danger-soft-red-50 text-core-danger-red-700' : 'border-ui-border bg-core-surface-white text-ui-text';
  const textClass = style.split(' ').slice(2).join(' ');
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} disabled={disabled} className={`${mobile ? 'h-11 min-w-0 flex-1 px-2' : 'h-8 px-3'} items-center justify-center rounded-lg border ${style.split(' ').slice(0, 2).join(' ')} ${disabled ? 'opacity-50' : ''}`}>
      <Text numberOfLines={1} className={`font-poppins-bold ${mobile ? 'text-[10px]' : 'text-[9px]'} ${textClass}`}>{label}</Text>
    </TouchableOpacity>
  );
}
