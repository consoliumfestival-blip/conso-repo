import { Modal } from '@/components/ui/CoreModal';
import { SsfButton } from '@/components/ui/SsfButton';
import { stageTopicSecondsRemaining } from '@/core/utils/stageTopicCountdown';
import { scheduleTopicDrawService, type ScheduleTopicDrawState, type StageTopicDisplayState } from '@/services/scheduleTopicDrawService';
import { stageManagementService, type StageRegistrationRow, type StageScheduleRow } from '@/services/stageManagementService';
import { getCurrentOriginAppUrl } from '@/core/utils/appUrls';
import QRCode from 'react-native-qrcode-svg';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';

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
  const assignment = topicQuery.data?.assignments.find((item) => item.registration_id === registrationId);
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
    if (!await confirmDraw(redraw, judgingStarted)) return;
    setBusy('draw');
    setActionError('');
    setNotice('');
    try {
      if (portal) await scheduleTopicDrawService.drawPortalTopic(venueId, scheduleId, registrationId, redraw, judgingStarted);
      else await scheduleTopicDrawService.draw(scheduleId, registrationId, redraw, judgingStarted);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: topicKey }),
        queryClient.invalidateQueries({ queryKey: stageKey }),
      ]);
      setNotice(selected?.code_letter?.trim()
        ? 'Topic drawn and ready for Show Next.'
        : 'Topic saved, but not ready for the stage display. Assign a code letter and re-draw this participant.');
    } catch (error: any) {
      setActionError(error?.message || 'Could not draw a topic.');
    } finally {
      setBusy('');
    }
  };
  const showNext = async () => {
    if (!stageQuery.data || busy) return;
    setBusy('next');
    setActionError('');
    try {
      const next = portal
        ? await scheduleTopicDrawService.showNextPortalTopic(venueId, stageQuery.data.version)
        : await scheduleTopicDrawService.showNextStageTopic(venueId, stageQuery.data.version);
      queryClient.setQueryData(stageKey, next);
    } catch (error: any) {
      setActionError(error?.message || 'Could not show the next topic.');
      await stageQuery.refetch();
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
              <Text className="font-poppins text-xs text-ui-text-muted">Draw prepares the next topic. Show Next changes the audience screen.</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close topic controls" onPress={onClose} className="ml-2 rounded-lg border border-ui-border px-3 py-1.5">
              <Text className="font-poppins-bold text-sm text-ui-text">✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
            {stageQuery.isPending ? <Text className="font-poppins text-xs text-ui-text-muted">Loading stage display…</Text>
              : stageQuery.isError ? <Text className="font-poppins text-xs text-core-danger-red-700">{(stageQuery.error as Error)?.message}</Text>
              : stageQuery.data ? (
                <View className="gap-2 rounded-xl border border-ui-border bg-ui-muted p-3">
                  <Text className="font-poppins-bold text-sm text-ui-text">
                    {stageQuery.data.paused ? 'Display paused' : stageQuery.data.on_screen
                      ? `On screen: ${stageQuery.data.on_screen.item_name} · ${stageQuery.data.on_screen.code_letter}`
                      : 'Audience screen waiting'}
                  </Text>
                  <Text className="font-poppins text-xs text-ui-text-muted">
                    {stageQuery.data.ready.length
                      ? `Ready next: ${stageQuery.data.ready[0].item_name} · ${stageQuery.data.ready[0].code_letter} · ${stageQuery.data.ready[0].topic_text}`
                      : 'No topic ready next.'}
                  </Text>
                  {onScreen && !stageQuery.data.paused ? (
                    <Text className="font-poppins-bold text-sm text-ui-text">On-screen timer: {timer}</Text>
                  ) : null}
                  {stageQuery.data.ready.length ? (
                    <Text className="font-poppins text-xs text-ui-text-muted">
                      Next duration: {Math.floor(stageQuery.data.ready[0].duration_seconds / 60)} min
                    </Text>
                  ) : null}
                  <View className="flex-row flex-wrap gap-2">
                    <SsfButton label="Show Next" size="sm" onPress={() => { void showNext(); }} isLoading={busy === 'next'} disabled={!!busy || stageQuery.data.paused || !stageQuery.data.ready.length} />
                    <SsfButton label={stageQuery.data.paused ? 'Resume' : 'Pause'} size="sm" variant="outline" onPress={() => { void togglePause(); }} isLoading={busy === 'pause'} disabled={!!busy} />
                    <SsfButton label="Link & QR" size="sm" variant="outline" onPress={() => portal ? setShowLink((value) => !value) : onOpenLink?.()} disabled={!!busy || (portal && !displayUrl)} />
                  </View>
                  {showLink && displayUrl ? <View className="items-center gap-2 rounded-lg border border-ui-border bg-core-surface-white p-3">
                    <QRCode value={displayUrl} size={150} />
                    <Text selectable className="font-poppins text-xs text-ui-text-muted">{displayUrl}</Text>
                    <SsfButton label="Copy link" size="sm" onPress={() => { void copyDisplayLink(); }} />
                  </View> : null}
                </View>
              ) : null}
            <Text className="font-poppins-bold text-sm text-ui-text">Draw a topic</Text>
            <Text className="font-poppins text-xs text-ui-text-muted">Choose an event at this stage.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {schedules.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.id === scheduleId }}
                  onPress={() => { setScheduleId(item.id); setRegistrationId(''); setSearch(''); setNotice(''); }}
                  className={`rounded-lg border px-3 py-2 ${item.id === scheduleId ? 'border-ui-primary bg-ui-muted' : 'border-ui-border bg-core-surface-white'}`}
                >
                  <Text className="font-poppins-bold text-xs text-ui-text">{item.item_name_en || item.item_code || 'Event'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {!schedules.length ? <Text className="font-poppins text-xs text-ui-text-muted">No events assigned to this stage.</Text> : null}
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
                      onPress={() => setRegistrationId(item.id)}
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
                {selected && !selected.code_letter?.trim() ? <Text className="font-poppins text-xs text-ui-text-muted">A code letter is needed before this draw can appear in Ready next.</Text> : null}
                <SsfButton label={assignment ? 'Re-draw topic' : 'Draw topic'} size="sm" onPress={() => { void draw(); }} isLoading={busy === 'draw'} disabled={!!busy || !selected || !activeTopics} />
              </>
            ) : topicQuery.isPending ? <Text className="font-poppins text-xs text-ui-text-muted">Loading topic setup…</Text>
              : topicQuery.isError ? <Text className="font-poppins text-xs text-core-danger-red-700">{(topicQuery.error as Error)?.message}</Text>
              : schedule ? <Text className="font-poppins text-xs text-ui-text-muted">Enable Topic Draw in Schedule Edit first.</Text> : null}
            {actionError ? <Text className="font-poppins text-xs text-core-danger-red-700">{actionError}</Text> : null}
            {notice ? <Text className="font-poppins text-xs text-ui-text">{notice}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
