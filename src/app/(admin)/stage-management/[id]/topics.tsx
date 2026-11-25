import { SsfButton } from '@/components/ui/SsfButton';
import { SsfCard } from '@/components/ui/SsfCard';
import { SsfSelectMenu } from '@/components/ui/SsfSelectMenu';
import { coreColor } from '@/constants/coreTheme';
import { scheduleTopicDrawService, type ScheduleTopicDrawState } from '@/services/scheduleTopicDrawService';
import { useGoBack } from '@/core/hooks/useGoBack';
import { useStageManagement } from '@/core/hooks/useStageManagement';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import QRCode from 'react-native-qrcode-svg';
import { ArrowLeft, Check, Copy, ExternalLink, RefreshCw, Trash2 } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Share, Switch, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';

function confirm(message: string, title: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: 'Continue', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

function message(title: string, body: string) {
  if (Platform.OS === 'web') window.alert(`${title}: ${body}`);
  else Alert.alert(title, body);
}

export default function ScheduleTopicDrawPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheduleId = Array.isArray(id) ? id[0] : id;
  const goBack = useGoBack('/stage-management');
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const stage = useStageManagement({ scheduleId });
  const schedule = stage.schedules.find((row: any) => row.id === scheduleId);
  const registrations = stage.registrations.filter((row: any) => row.schedule_id === scheduleId && row.status !== 'rejected');
  const [selectedRegistrationId, setSelectedRegistrationId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const stateQuery = useQuery<ScheduleTopicDrawState>({
    queryKey: ['schedule-topic-draw-state', scheduleId],
    queryFn: () => scheduleTopicDrawService.getState(scheduleId!),
    enabled: !!scheduleId,
    retry: false,
    staleTime: 0,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  const state = stateQuery.data;
  const assignmentsByRegistration = useMemo(() => new Map((state?.assignments ?? []).map((entry) => [entry.registration_id, entry])), [state?.assignments]);
  const selectedRegistration = registrations.find((registration: any) => registration.id === selectedRegistrationId);
  const selectedAssignment = selectedRegistration ? assignmentsByRegistration.get(selectedRegistration.id) : undefined;
  const displayRegistration = registrations.find((registration: any) => assignmentsByRegistration.get(registration.id)?.id === state?.displayed_assignment_id);
  const displayAssignment = state?.assignments.find((assignment) => assignment.id === state.displayed_assignment_id);
  const activeTopicCount = state?.topics.filter((topic) => topic.is_active).length ?? 0;
  const displayUrl = state?.display_token
    ? Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}/topic-display/${state.display_token}`
      : Linking.createURL(`/topic-display/${state.display_token}`)
    : '';

  const refreshState = () => queryClient.invalidateQueries({ queryKey: ['schedule-topic-draw-state', scheduleId] });

  const drawTopic = async () => {
    if (!selectedRegistration || !state?.enabled || activeTopicCount === 0) return;
    const isRedraw = !!selectedAssignment;
    const needsJudgingWarning = state.judging_started;
    if (isRedraw || needsJudgingWarning) {
      const title = isRedraw ? 'Confirm re-draw' : 'Confirm topic draw';
      const details = [
        isRedraw ? 'This participant already has a topic. Drawing again will replace the current topic.' : '',
        needsJudgingWarning ? 'Judging has started. Existing marks will not change; notify the assigned judge about the new topic.' : '',
      ].filter(Boolean).join('\n');
      if (!await confirm(details, title)) return;
    }

    setError('');
    setBusy('draw');
    try {
      await scheduleTopicDrawService.draw(scheduleId!, selectedRegistration.id, isRedraw, needsJudgingWarning);
      await refreshState();
    } catch (drawError: any) {
      setError(drawError?.message || 'Could not draw a topic.');
      await refreshState();
    } finally {
      setBusy('');
    }
  };

  const setTopicActive = async (topicId: string, active: boolean) => {
    setError('');
    setBusy(topicId);
    try {
      await scheduleTopicDrawService.setActive(scheduleId!, topicId, active);
      await refreshState();
    } catch (actionError: any) {
      setError(actionError?.message || 'Could not update topic status.');
    } finally {
      setBusy('');
    }
  };

  const deleteTopic = async (topicId: string) => {
    if (!await confirm('The topic will be removed from the draw pool. Existing draw history remains available.', 'Delete topic')) return;
    setError('');
    setBusy(topicId);
    try {
      await scheduleTopicDrawService.deleteTopic(scheduleId!, topicId);
      await refreshState();
    } catch (actionError: any) {
      setError(actionError?.message || 'Could not delete topic.');
    } finally {
      setBusy('');
    }
  };

  const setDisplayedTopic = async (assignmentId: string | null) => {
    setError('');
    setBusy('display');
    try {
      await scheduleTopicDrawService.setDisplayedAssignment(scheduleId!, assignmentId);
      await refreshState();
    } catch (actionError: any) {
      setError(actionError?.message || 'Could not update the display.');
    } finally {
      setBusy('');
    }
  };

  const copyDisplayLink = async () => {
    if (!displayUrl) return;
    try {
      if (Platform.OS === 'web' && navigator.clipboard) await navigator.clipboard.writeText(displayUrl);
      else await Share.share({ message: displayUrl, url: displayUrl });
      message('Display link', 'The topic display link is ready to share.');
    } catch (shareError: any) {
      message('Unable to share', shareError?.message || displayUrl);
    }
  };

  const openDisplay = () => {
    if (!displayUrl) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(displayUrl, '_blank', 'noopener,noreferrer');
    else void Linking.openURL(displayUrl);
  };

  if (stateQuery.isPending || stage.schedulesQuery.isPending || stage.registrationsQuery.isPending) {
    return <View className="flex-1 items-center justify-center bg-ssf-bg"><ActivityIndicator color={coreColor('#0F766E', 'primaryText')} /></View>;
  }

  if (stateQuery.isError) {
    return <View className="flex-1 items-center justify-center bg-ssf-bg px-5"><Text className="font-poppins text-sm text-ui-text">{(stateQuery.error as Error).message}</Text><SsfButton label="Back" variant="outline" onPress={goBack} className="mt-4" /></View>;
  }

  return (
    <ScrollView className="flex-1 bg-ssf-bg px-3 py-3" contentContainerStyle={{ paddingBottom: 28 }}>
      <View className="mb-3 flex-row items-center gap-2">
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Stage Management" onPress={goBack} className="h-10 w-10 items-center justify-center rounded-lg border border-ui-border bg-core-surface-white">
          <ArrowLeft size={18} color={coreColor('#334155', 'text')} />
        </TouchableOpacity>
        <View className="min-w-0 flex-1">
          <Text className="font-poppins-black text-lg text-ui-text">Topic Draw</Text>
          <Text numberOfLines={1} className="font-poppins text-xs text-ui-text-muted">{schedule?.items?.item_name_en || 'Schedule topic assignment'}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh topics" onPress={() => { void stateQuery.refetch(); }} className="h-10 w-10 items-center justify-center rounded-lg border border-ui-border bg-core-surface-white">
          <RefreshCw size={16} color={coreColor('#475569', 'text')} />
        </TouchableOpacity>
      </View>

      {state?.enabled ? (
        <>
          <SsfCard className="mb-3 gap-3 border border-ui-border p-3 shadow-none">
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="font-poppins-bold text-sm text-ui-text">Draw for participant</Text>
                <Text className="mt-0.5 font-poppins text-xs text-ui-text-muted">Active topics: {activeTopicCount}. Each draw uses one active topic.</Text>
              </View>
              {state.judging_started ? <View className="rounded-full border border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50 px-2.5 py-1"><Text className="font-poppins-bold text-[10px] text-core-warning-amber-800">Judging started</Text></View> : null}
            </View>
            {registrations.length ? (
              <SsfSelectMenu
                value={selectedRegistration?.id ?? ''}
                onValueChange={setSelectedRegistrationId}
                searchable
                searchPlaceholder="Search code or participant…"
                placeholder="Select participant"
                options={registrations.map((registration: any) => ({
                  value: registration.id,
                  label: `${registration.code_letter || 'No code'} · ${registration.participants?.name || 'Participant'} · ${registration.participants?.chest_number || '—'}`,
                  searchText: `${registration.code_letter || ''} ${registration.participants?.name || ''} ${registration.participants?.chest_number || ''}`,
                }))}
              />
            ) : <Text className="rounded-lg bg-ui-muted px-3 py-3 font-poppins text-xs text-ui-text-muted">No participants are available for this schedule.</Text>}
            {selectedAssignment ? (
              <View className="rounded-lg border border-ui-border bg-ui-muted p-3">
                <Text className="font-poppins text-[10px] uppercase tracking-wide text-ui-text-muted">Current topic</Text>
                <Text className="mt-1 font-poppins-bold text-sm text-ui-text">{selectedAssignment.topic_text}</Text>
              </View>
            ) : null}
            <SsfButton
              label={busy === 'draw' ? 'Drawing…' : selectedAssignment ? 'Re-draw topic' : 'Draw topic'}
              onPress={() => { void drawTopic(); }}
              isLoading={busy === 'draw'}
              disabled={!selectedRegistration || activeTopicCount === 0 || !!busy}
              icon={<RefreshCw size={15} />}
            />
            {activeTopicCount === 0 ? <Text className="font-poppins text-xs text-core-danger-red-700">No active topics. Activate one below before drawing.</Text> : null}
          </SsfCard>

          <SsfCard className="mb-3 gap-3 border border-ui-border p-3 shadow-none">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="font-poppins-bold text-sm text-ui-text">Topic pool</Text>
                <Text className="mt-0.5 font-poppins text-xs text-ui-text-muted">Drawn topics stay disabled until you activate them here.</Text>
              </View>
              <View className="rounded-full bg-ui-muted px-2.5 py-1"><Text className="font-poppins-bold text-[10px] text-ui-text">{state?.topics.length ?? 0}</Text></View>
            </View>
            {state?.topics.length ? state.topics.map((topic) => (
              <View key={topic.id} className="flex-row items-center gap-2 rounded-lg border border-ui-border bg-core-surface-white p-2.5">
                <View className="min-w-0 flex-1">
                  <Text className="font-poppins-bold text-xs text-ui-text">{topic.topic_text}</Text>
                  <Text className={`mt-0.5 font-poppins text-[10px] ${topic.is_active ? 'text-core-success-green-700' : 'text-ui-text-muted'}`}>{topic.is_active ? 'Active in draw pool' : 'Disabled'}</Text>
                </View>
                <Switch accessibilityLabel={`${topic.is_active ? 'Disable' : 'Activate'} topic`} value={topic.is_active} disabled={!!busy} onValueChange={(active) => { void setTopicActive(topic.id, active); }} />
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete topic" disabled={!!busy} onPress={() => { void deleteTopic(topic.id); }} className="h-9 w-9 items-center justify-center rounded-lg border border-core-danger-soft-red-200 bg-core-danger-soft-red-50">
                  <Trash2 size={15} color={coreColor('#B91C1C', 'danger')} />
                </TouchableOpacity>
              </View>
            )) : <Text className="rounded-lg bg-ui-muted px-3 py-3 font-poppins text-xs text-ui-text-muted">No topics yet. Add topics in Schedule Edit.</Text>}
          </SsfCard>

          <SsfCard className="mb-3 gap-3 border border-ui-border p-3 shadow-none">
            <View>
              <Text className="font-poppins-bold text-sm text-ui-text">Public topic display</Text>
              <Text className="mt-0.5 font-poppins text-xs text-ui-text-muted">Choose a current assignment to show on the QR display.</Text>
            </View>
            {state?.assignments.length ? state.assignments.map((assignment) => {
              const participant = registrations.find((registration: any) => registration.id === assignment.registration_id);
              const label = participant ? `${participant.code_letter || 'No code'} · ${participant.participants?.name || 'Participant'}` : 'Participant';
              const isDisplayed = assignment.id === state.displayed_assignment_id;
              return (
                <View key={assignment.id} className="flex-row items-center gap-2 rounded-lg border border-ui-border bg-core-surface-white p-2.5">
                  <View className="min-w-0 flex-1"><Text className="font-poppins-bold text-xs text-ui-text">{label}</Text><Text numberOfLines={2} className="mt-0.5 font-poppins text-[11px] text-ui-text-muted">{assignment.topic_text}</Text></View>
                  <TouchableOpacity accessibilityRole="button" onPress={() => { void setDisplayedTopic(isDisplayed ? null : assignment.id); }} disabled={!!busy} className={`h-9 flex-row items-center gap-1.5 rounded-lg border px-2.5 ${isDisplayed ? 'border-core-success-soft-green-300 bg-core-success-soft-green-100' : 'border-ui-border bg-core-surface-white'}`}>
                    {isDisplayed ? <Check size={14} color={coreColor('#15803D', 'success')} /> : null}
                    <Text className="font-poppins-bold text-[10px] text-ui-text">{isDisplayed ? 'On display' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
              );
            }) : <Text className="rounded-lg bg-ui-muted px-3 py-3 font-poppins text-xs text-ui-text-muted">Draw a topic to make it available for display.</Text>}
            {displayUrl ? (
              <View className="mt-1 flex-row flex-wrap items-center gap-3 rounded-lg border border-ui-border bg-core-surface-white p-3">
                <View className="rounded-md bg-white p-2"><QRCode value={displayUrl} size={Math.min(116, Math.max(84, width * 0.2))} /></View>
                <View className="min-w-[190px] flex-1 gap-2">
                  <Text numberOfLines={2} selectable className="font-poppins text-[10px] text-ui-text-muted">{displayUrl}</Text>
                  <View className="flex-row flex-wrap gap-2">
                    <TouchableOpacity accessibilityRole="button" onPress={() => { void copyDisplayLink(); }} className="h-9 flex-row items-center gap-1.5 rounded-lg border border-ui-border px-2.5"><Copy size={14} color={coreColor('#475569', 'text')} /><Text className="font-poppins-bold text-[10px] text-ui-text">Share link</Text></TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" onPress={openDisplay} className="h-9 flex-row items-center gap-1.5 rounded-lg bg-button-primary px-2.5"><ExternalLink size={14} color={coreColor('#FFFFFF', 'buttonForeground')} /><Text className="font-poppins-bold text-[10px] text-button-foreground">Open display</Text></TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : null}
            {displayRegistration && displayAssignment ? <Text className="font-poppins text-[10px] text-core-success-green-700">Showing {displayRegistration.code_letter || 'participant'} on the public display.</Text> : null}
          </SsfCard>
        </>
      ) : (
        <SsfCard className="items-start gap-2 border border-ui-border p-4 shadow-none">
          <Text className="font-poppins-bold text-sm text-ui-text">Topic Draw is off</Text>
          <Text className="font-poppins text-xs leading-5 text-ui-text-muted">Enable it in Schedule Management → Edit Schedule. Existing topics and draw history will be preserved.</Text>
        </SsfCard>
      )}
      {error ? <Text accessibilityRole="alert" className="mb-3 rounded-lg border border-core-danger-soft-red-200 bg-core-danger-soft-red-50 p-3 font-poppins text-xs text-core-danger-red-700">{error}</Text> : null}
      {stateQuery.isRefetching && busy === '' ? <Text className="text-center font-poppins text-[10px] text-ui-text-muted">Refreshing topic status…</Text> : null}
    </ScrollView>
  );
}
