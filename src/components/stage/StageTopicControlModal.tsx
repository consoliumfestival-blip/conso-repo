import { Modal } from '@/components/ui/CoreModal';
import { SsfButton } from '@/components/ui/SsfButton';
import { stageTopicSecondsRemaining } from '@/core/utils/stageTopicCountdown';
import { selectedSavedDraw } from '@/core/utils/stageTopicSelection';
import { scheduleTopicDrawService, type ScheduleTopicDrawState, type StageTopicDisplayState, type ScheduleTopicAssignment } from '@/services/scheduleTopicDrawService';
import { stageManagementService, type StageRegistrationRow, type StageScheduleRow } from '@/services/stageManagementService';
import { getCurrentOriginAppUrl } from '@/core/utils/appUrls';
import QRCode from 'react-native-qrcode-svg';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error
    && typeof error.message === 'string' && error.message.trim()) return error.message;
  return fallback;
}

function confirmDraw(redraw: boolean, judgingStarted: boolean): Promise<boolean> {
  const details = [
    redraw ? 'This participant already has a topic. A new draw will replace that assignment.' : '',
    judgingStarted ? 'Judging has started. Existing marks will not change; notify the assigned judge.' : '',
  ].filter(Boolean).join('\n');
  if (!details) return Promise.resolve(true);
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`Confirm topic draw\n\n${details}`));
  return new Promise((resolve) => Alert.alert('Confirm topic draw', details, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: 'Draw', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

export function StageTopicControlModal({
  venueId, venueName, schedules, onClose, onOpenLink, portal = false,
}: {
  venueId: string;
  venueName: string;
  schedules: StageScheduleRow[];
  onClose: () => void;
  onOpenLink?: () => void;
  portal?: boolean;
}) {
  const { height } = useWindowDimensions();
  const queryClient = useQueryClient();
  const [scheduleId, setScheduleId] = React.useState(schedules[0]?.id ?? '');
  const [registrationId, setRegistrationId] = React.useState('');
  const [lastDraw, setLastDraw] = React.useState<{ scheduleId: string; assignment: ScheduleTopicAssignment } | null>(null);
  const [search, setSearch] = React.useState('');
  const [busy, setBusy] = React.useState<'draw' | 'next' | 'pause' | 'topic' | ''>('');
  const [showLink, setShowLink] = React.useState(false);
  const [actionError, setActionError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [now, setNow] = React.useState(() => Date.now());
  const serverOffsetMs = React.useRef(0);
  const stageKey = [portal ? 'portal-stage-topic-display' : 'admin-stage-topic-display', venueId];
  const topicKey = [portal ? 'portal-schedule-topic-draw-state' : 'schedule-topic-draw-state', venueId, scheduleId];
  const stageQuery = useQuery<StageTopicDisplayState>({
    queryKey: stageKey,
    queryFn: () => portal ? scheduleTopicDrawService.getPortalDisplayState(venueId) : scheduleTopicDrawService.getStageDisplayState(venueId),
    refetchInterval: 5000,
  });
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  React.useEffect(() => {
    if (stageQuery.data?.server_time) {
      serverOffsetMs.current = Date.parse(stageQuery.data.server_time) - Date.now();
    }
  }, [stageQuery.data]);
  const topicQuery = useQuery<ScheduleTopicDrawState>({
    queryKey: topicKey,
    queryFn: () => portal ? scheduleTopicDrawService.getPortalState(venueId, scheduleId) : scheduleTopicDrawService.getState(scheduleId),
    enabled: !!scheduleId,
    refetchInterval: 5000,
  });
  const registrationsQuery = useQuery<StageRegistrationRow[]>({
    queryKey: ['stage-topic-draw-registrations', scheduleId],
    queryFn: async () => portal
      ? (await stageManagementService.getVenuePortalScheduleDetailV2(venueId, '', scheduleId)).registrations
      : stageManagementService.getRegistrations({ scheduleId }),
    enabled: !!scheduleId,
  });
  const schedule = schedules.find((item) => item.id === scheduleId);
  const selected = registrationsQuery.data?.find((item) => item.id === registrationId);
  const assignment = lastDraw?.scheduleId === scheduleId && lastDraw.assignment.registration_id === registrationId
    ? lastDraw.assignment
    : topicQuery.data?.assignments.find((item) => item.registration_id === registrationId);
  const selectedPreview = selectedSavedDraw(schedule, selected, assignment, topicQuery.data?.participant_duration_seconds);
  const activeTopics = topicQuery.data?.topics.filter((item) => item.is_active).length ?? 0;
  const onScreen = stageQuery.data?.on_screen;
  const remaining = onScreen ? stageTopicSecondsRemaining(
    onScreen.published_at, onScreen.duration_seconds, serverOffsetMs.current, now,
  ) : 0;
  const timer = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const available = (registrationsQuery.data ?? []).filter((item) => item.status !== 'rejected');
  const visible = available.filter((item) => {
    const needle = search.toLowerCase().trim();
    return !needle || [item.code_letter, item.participant_name, item.participant_chest_number]
      .some((part) => part?.toLowerCase().includes(needle));
  });
  const displayUrl = stageQuery.data?.display_token
    ? getCurrentOriginAppUrl(`/stage-topic-display/${stageQuery.data.display_token}`)
    : null;
  const copyDisplayLink = async () => {
    if (!displayUrl) return;
    try {
      if (Platform.OS === 'web' && navigator.clipboard?.writeText) await navigator.clipboard.writeText(displayUrl);
      else await Share.share({ message: displayUrl, url: displayUrl });
      setNotice('Display link copied.');
    } catch (error: any) { setActionError(error?.message || 'Could not share the display link.'); }
  };
  const toggleTopic = async (topicId: string, active: boolean) => {
    if (!scheduleId || busy) return;
    setBusy('topic'); setActionError('');
    try {
      if (portal) await scheduleTopicDrawService.setPortalActive(venueId, scheduleId, topicId, active);
      else await scheduleTopicDrawService.setActive(scheduleId, topicId, active);
      await queryClient.invalidateQueries({ queryKey: topicKey });
    } catch (error: any) { setActionError(error?.message || 'Could not update this topic.'); }
    finally { setBusy(''); }
  };

  const draw = async () => {
    if (!scheduleId || !registrationId || !topicQuery.data?.enabled || !activeTopics || busy) return;
    const redraw = !!assignment;
    const judgingStarted = !!topicQuery.data.judging_started;
    setBusy('draw');
    setActionError('');
    setNotice('');
    try {
      if (!await confirmDraw(redraw, judgingStarted)) return;
      const drawn = portal
        ? await scheduleTopicDrawService.drawPortalTopic(venueId, scheduleId, registrationId, redraw, judgingStarted)
        : await scheduleTopicDrawService.draw(scheduleId, registrationId, redraw, judgingStarted);
      setLastDraw({ scheduleId, assignment: {
        id: drawn.assignment_id, registration_id: drawn.registration_id, topic_id: drawn.topic_id,
        topic_text: drawn.topic_text, drawn_at: drawn.drawn_at, is_current: true,
      } });
      const [refreshed] = await Promise.all([
        stageQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: topicKey }),
      ]);
      setNotice(refreshed.isError
        ? 'Topic saved. Refresh the stage display to check whether it is ready.'
        : 'Topic saved. Show Next will display this selected draw after checking its stage and participant.');
    } catch (error: any) {
      setActionError(error?.message || 'Could not draw a topic.');
    } finally {
      setBusy('');
    }
  };
  const showNext = async () => {
    if (busy) return;
    setNotice('');
    if (stageQuery.isError) {
      setActionError(`Show Next unavailable: ${errorMessage(stageQuery.error, 'Could not load stage display. Retry stage display.')}`);
      return;
    }
    if (!stageQuery.data || stageQuery.isPending || stageQuery.isFetching) {
      setActionError('Stage display is still loading. Wait for it to finish, then try Show Next again.');
      return;
    }
    if (stageQuery.data.paused) {
      setActionError('The stage display is paused. Press Resume before Show Next.');
      return;
    }
    if (!schedule || !selected) {
      setActionError('Select the event and participant whose topic should be shown.');
      return;
    }
    if (topicQuery.isError || registrationsQuery.isError || topicQuery.isFetching || registrationsQuery.isFetching) {
      setActionError('The selected event or participant is still loading or could not be refreshed. Retry before Show Next.');
      return;
    }
    if (!selectedPreview) {
      setActionError('Select a participant with a saved topic and a code letter. Refresh event topics if the saved draw is not visible.');
      return;
    }
    setBusy('next');
    setActionError('');
    try {
      const next = portal
        ? await scheduleTopicDrawService.showSavedPortalDraw(venueId, stageQuery.data.version, selectedPreview)
        : await scheduleTopicDrawService.showSavedStageDraw(venueId, stageQuery.data.version, selectedPreview);
      queryClient.setQueryData(stageKey, next);
      setNotice(`Shown: ${selectedPreview.item_name} · Code ${selectedPreview.code_letter} · ${selectedPreview.topic_text}`);
    } catch (error: any) {
      setActionError(`Show Next failed: ${errorMessage(error, 'The request failed without an error description. Check your connection and retry stage display.')}`);
      // Reload only this event's saved draw and participants after a rejected
      // preview; do not retain a local draw snapshot that may have been replaced.
      setLastDraw(null);
      await Promise.all([stageQuery.refetch(), topicQuery.refetch(), registrationsQuery.refetch()]);
    } finally {
      setBusy('');
    }
  };
  const togglePause = async () => {
    if (!stageQuery.data || busy) return;
    setBusy('pause');
    setActionError('');
    try {
      const next = portal
        ? await scheduleTopicDrawService.setPortalDisplayPaused(venueId, !stageQuery.data.paused, stageQuery.data.version)
        : await scheduleTopicDrawService.setStageDisplayPaused(venueId, !stageQuery.data.paused, stageQuery.data.version);
      queryClient.setQueryData(stageKey, next);
    } catch (error: any) {
      setActionError(error?.message || 'Could not change display state.');
      await stageQuery.refetch();
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-core-surface-strong-black/40 p-3">
        <Pressable accessibilityLabel="Close topic controls" onPress={onClose} className="absolute inset-0" />
        <View style={{ width: '100%', maxWidth: 620, maxHeight: Math.min(height - 30, 760) }} className="overflow-hidden rounded-2xl border border-ui-border bg-core-surface-white">
          <View className="flex-row items-start justify-between border-b border-ui-border px-4 py-3">
            <View className="min-w-0 flex-1">
              <Text className="font-poppins-bold text-base text-ui-text">Stage topics · {venueName}</Text>
              <Text className="font-poppins text-xs text-ui-text-muted">Select an event and participant. Show Next displays only their current drawn topic.</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close topic controls" onPress={onClose} className="ml-2 rounded-lg border border-ui-border px-3 py-1.5">
              <Text className="font-poppins-bold text-sm text-ui-text">✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
            {topicQuery.isError && <View className="gap-2">
              <Text accessibilityRole="alert" selectable className="font-poppins text-xs text-core-danger-red-700">Event topics: {errorMessage(topicQuery.error, 'Could not load event topics.')}</Text>
              <SsfButton label="Retry event topics" size="sm" variant="outline" disabled={!!busy} isLoading={topicQuery.isFetching} onPress={() => { void topicQuery.refetch(); }} />
            </View>}
            {registrationsQuery.isError && <View className="gap-2">
              <Text accessibilityRole="alert" selectable className="font-poppins text-xs text-core-danger-red-700">Participants: {errorMessage(registrationsQuery.error, 'Could not load participants.')}</Text>
              <SsfButton label="Retry participants" size="sm" variant="outline" disabled={!!busy} isLoading={registrationsQuery.isFetching} onPress={() => { void registrationsQuery.refetch(); }} />
            </View>}
            <Text className="font-poppins-bold text-sm text-ui-text">Draw a topic</Text>
            <Text className="font-poppins text-xs text-ui-text-muted">Choose an event at this stage.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {schedules.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.id === scheduleId }}
                  disabled={!!busy}
                  onPress={() => { setScheduleId(item.id); setRegistrationId(''); setLastDraw(null); setSearch(''); setNotice(''); setActionError(''); }}
                  className={`rounded-lg border px-3 py-2 ${item.id === scheduleId ? 'border-ui-primary bg-ui-muted' : 'border-ui-border bg-core-surface-white'}`}
                >
                  <Text className="font-poppins-bold text-xs text-ui-text">{item.item_name_en || item.item_code || 'Event'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {!schedules.length ? <Text className="font-poppins text-xs text-ui-text-muted">No events assigned to this stage.</Text> : null}
            <View className="gap-2 rounded-xl border border-ui-border bg-ui-muted p-3">
              <Text className="font-poppins text-xs text-ui-text-muted">Selected event</Text>
              <Text className="font-poppins-bold text-sm text-ui-text">{schedule?.item_name_en || schedule?.item_name_ml || schedule?.item_code || 'Choose an event'}</Text>
              <Text className="font-poppins text-xs text-ui-text-muted">{selected ? `${selected.participant_name || 'Participant'} · Code ${selected.code_letter || 'Not assigned'}` : 'Choose a participant below to preview their saved draw.'}</Text>
              <Text selectable className="font-poppins-bold text-sm text-ui-text">{selectedPreview ? selectedPreview.topic_text : 'No saved draw selected.'}</Text>
              {selectedPreview ? <Text className="font-poppins text-xs text-ui-text-muted">Duration: {Math.floor(selectedPreview.duration_seconds / 60)} min</Text> : null}
              <View className="flex-row flex-wrap items-center gap-2">
                <SsfButton label="Show Next" accessibilityLabel={`Show selected draw for ${schedule?.item_name_en || schedule?.item_name_ml || schedule?.item_code || 'selected event'}`} size="sm" onPress={() => { void showNext(); }} isLoading={busy === 'next'} disabled={!!busy} />
              </View>
              {!!actionError && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" selectable className="font-poppins text-xs text-core-danger-red-700">{actionError}</Text>}
              {stageQuery.data?.paused ? <Text className="font-poppins text-xs text-ui-text-muted">Audience display is paused. Use Resume under Audience display before Show Next.</Text> : null}
            </View>
            {schedule && topicQuery.data?.enabled ? (
              <>
                <Text className="font-poppins text-xs text-ui-text-muted">
                  {activeTopics} active topics · {Math.round(topicQuery.data.participant_duration_seconds / 60)} min per participant
                </Text>
                <View className="gap-1">
                  {topicQuery.data.topics.map((topic) => <View key={topic.id} className="flex-row items-center justify-between gap-2 rounded-lg border border-ui-border bg-core-surface-white px-3 py-1.5">
                    <Text className="min-w-0 flex-1 font-poppins text-xs text-ui-text">{topic.topic_text}</Text>
                    <SsfButton label={topic.is_active ? 'Disable' : 'Enable'} size="sm" variant="outline" disabled={!!busy} onPress={() => { void toggleTopic(topic.id, !topic.is_active); }} />
                  </View>)}
                </View>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search code letter or participant"
                  className="h-10 rounded-lg border border-ui-border bg-core-surface-white px-3 font-poppins text-xs text-ui-text"
                />
                <ScrollView nestedScrollEnabled style={{ maxHeight: Math.min(190, height * 0.22) }}>
                  {visible.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: item.id === registrationId }}
                      disabled={!!busy}
                      onPress={() => { setRegistrationId(item.id); setLastDraw(null); setNotice(''); setActionError(''); }}
                      className={`mb-1.5 rounded-lg border px-3 py-2 ${item.id === registrationId ? 'border-ui-primary bg-ui-muted' : 'border-ui-border bg-core-surface-white'}`}
                    >
                      <Text className="font-poppins-bold text-xs text-ui-text">
                        {item.code_letter || 'No code'} · {item.participant_name || 'Participant'}
                      </Text>
                      {item.participant_chest_number ? <Text className="font-poppins text-[10px] text-ui-text-muted">Chest {item.participant_chest_number}</Text> : null}
                    </TouchableOpacity>
                  ))}
                  {!visible.length ? <Text className="font-poppins text-xs text-ui-text-muted">No matching participants.</Text> : null}
                </ScrollView>
                {assignment ? <Text className="font-poppins text-xs text-ui-text-muted">Current draw: {assignment.topic_text}</Text> : null}
                {selected && !selected.code_letter?.trim() ? <Text className="font-poppins text-xs text-ui-text-muted">Assign a code letter before showing this saved draw. A new random draw is not required.</Text> : null}
                <SsfButton label={assignment ? 'Re-draw topic' : 'Draw topic'} size="sm" onPress={() => { void draw(); }} isLoading={busy === 'draw'} disabled={!!busy || !selected || !activeTopics} />
              </>
            ) : topicQuery.isPending ? <Text className="font-poppins text-xs text-ui-text-muted">Loading topic setup…</Text>
              : topicQuery.isError ? null
              : schedule ? <Text className="font-poppins text-xs text-ui-text-muted">Enable Topic Draw in Schedule Edit first.</Text> : null}
            {notice ? <Text className="font-poppins text-xs text-ui-text">{notice}</Text> : null}
            <Text className="font-poppins-bold text-sm text-ui-text">Audience display</Text>
            {(stageQuery.isPending || stageQuery.isError || !stageQuery.data) && <View className="gap-2 rounded-xl border border-ui-border bg-ui-muted p-3">
              <Text className="font-poppins text-xs text-ui-text-muted">{stageQuery.isError ? 'Stage display could not be refreshed. Retry to enable Show Next.' : 'Loading stage display…'}</Text>
              <SsfButton label="Retry stage display" size="sm" variant="outline" isLoading={stageQuery.isFetching} disabled={!!busy} onPress={() => { void stageQuery.refetch(); }} />
            </View>}
            {stageQuery.isPending ? null
              : stageQuery.isError ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" selectable className="font-poppins text-xs text-core-danger-red-700">Stage display: {errorMessage(stageQuery.error, 'The request failed without an error description. Check your connection and retry.')}</Text>
              : stageQuery.data ? (
                <View className="gap-2 rounded-xl border border-ui-border bg-ui-muted p-3">
                  <Text className="font-poppins-bold text-sm text-ui-text">
                    {stageQuery.data.paused ? 'Display paused' : stageQuery.data.on_screen
                      ? `Audience screen now: ${stageQuery.data.on_screen.item_name} · Code ${stageQuery.data.on_screen.code_letter}`
                      : 'Audience screen waiting'}
                  </Text>
                  {onScreen && !stageQuery.data.paused ? (
                    <Text className="font-poppins-bold text-sm text-ui-text">On-screen timer: {timer}</Text>
                  ) : null}
                  <View className="flex-row flex-wrap gap-2">
                    <SsfButton label="Refresh stage display" size="sm" variant="outline" isLoading={stageQuery.isFetching} disabled={!!busy} onPress={() => { void stageQuery.refetch(); }} />
                    <SsfButton label={stageQuery.data.paused ? 'Resume' : 'Pause'} size="sm" variant="outline" onPress={() => { void togglePause(); }} isLoading={busy === 'pause'} disabled={!!busy} />
                    <SsfButton label="Link & QR" size="sm" variant="outline" onPress={() => portal ? setShowLink((value) => !value) : onOpenLink?.()} disabled={!!busy || (portal && !displayUrl)} />
                  </View>
                  {stageQuery.data.paused ? <Text className="font-poppins text-xs text-ui-text-muted">Resume the display before Show Next. The selected topic will not be shown until you press Show Next.</Text> : null}
                  {showLink && displayUrl ? <View className="items-center gap-2 rounded-lg border border-ui-border bg-core-surface-white p-3">
                    <QRCode value={displayUrl} size={150} />
                    <Text selectable className="font-poppins text-xs text-ui-text-muted">{displayUrl}</Text>
                    <SsfButton label="Copy link" size="sm" onPress={() => { void copyDisplayLink(); }} />
                  </View> : null}
                </View>
              ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
