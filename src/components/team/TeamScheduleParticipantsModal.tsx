import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { X } from 'lucide-react-native';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamLeaderContext, TeamLeaderScheduleParticipants, TeamLeaderScheduleRow, teamLeaderPortalService } from '@/services/teamLeaderPortalService';
import { downloadItemVerificationPdf } from '@/services/participantExportService';
import { getTeamScheduleParticipantStatus, prepareTeamScheduleReport } from '@/core/utils/teamScheduleParticipants';
import { TeamText as Text } from './TeamText';
import { Button } from './TeamButton';

export function TeamScheduleParticipantsModal({ event, context, onClose }: {
  event: TeamLeaderScheduleRow;
  context: TeamLeaderContext;
  onClose: () => void;
}) {
  const ui = useTeamUi();
  const { width, height } = useWindowDimensions();
  const compact = width < 600;
  const [details, setDetails] = useState<TeamLeaderScheduleParticipants | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const title = event.item_name || event.item_code || 'Event';

  const load = useCallback(async (exportPdf = false) => {
    const version = ++request.current;
    setLoading(true);
    setError(null);
    setDetails(null);
    setExporting(exportPdf);
    try {
      const next = await teamLeaderPortalService.getScheduleParticipants(event.schedule_id);
      if (version !== request.current) return;
      if (next.item_id !== event.item_id || next.participants.some(row => row.organisation_id !== context.organisation_id || row.item_id !== event.item_id)) {
        throw new Error('The event participant scope changed. Close this popup and retry.');
      }
      setDetails(next);
      if (exportPdf && next.checkin_complete) {
        const report = prepareTeamScheduleReport(next.participants, next.item_id, context.organisation_id);
        downloadItemVerificationPdf({
          festivalName: context.festival_name, item: { id: next.item_id, item_code: event.item_code, item_name_en: event.item_name },
          ...report, sortBy: 'chest', teamId: context.organisation_id,
        });
      }
    } catch (cause: any) {
      if (version === request.current) setError(cause?.message || 'Unable to load participants. Please retry.');
    } finally {
      if (version === request.current) { setLoading(false); setExporting(false); }
    }
  }, [event.schedule_id, event.item_id, event.item_code, event.item_name, context.organisation_id, context.festival_name]);

  useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]);

  const close = () => { request.current += 1; onClose(); };
  const rows = [...(details?.participants ?? [])].sort((a, b) =>
    (a.chest_number || '').localeCompare(b.chest_number || '', undefined, { numeric: true }) || a.participant_name.localeCompare(b.participant_name));
  const complete = details?.checkin_complete === true;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: ui.colors.overlay, padding: compact ? 12 : 24, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable role="region" accessibilityViewIsModal accessibilityLabel={`${title} participants`} onPress={e => e.stopPropagation()}
          style={{ width: '100%', maxWidth: 680, maxHeight: Math.max(160, height - (compact ? 24 : 48)), flexShrink: 1, borderRadius: 17, backgroundColor: ui.colors.surface, overflow: 'hidden', borderWidth: 1, borderColor: ui.colors.border }}>
          <View style={{ padding: compact ? 14 : 18, flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderBottomWidth: 1, borderBottomColor: ui.colors.border }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: ui.colors.text }}>{title}</Text>
              <Text style={{ fontSize: 12, color: ui.colors.textMuted, marginTop: 3 }}>{context.team_name || 'Your team'} · Participants</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close participants" onPress={close} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color={ui.colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: compact ? 14 : 18, gap: 10 }}>
            {loading ? <View style={{ padding: 24, alignItems: 'center', gap: 10 }}><ActivityIndicator color={ui.colors.primary} /><Text style={{ fontSize: 12, color: ui.colors.textMuted }}>{exporting ? 'Checking latest verification…' : 'Loading participants…'}</Text></View>
              : error ? <View accessibilityRole="alert" style={{ gap: 12 }}><Text style={{ color: ui.colors.danger, fontSize: 13 }}>{error}</Text><Button size="sm" variant="outline" onPress={() => void load()}>Retry</Button></View>
                : <>
                  <Text style={{ fontSize: 12, color: ui.colors.textMuted }}>{complete ? 'Check-in Completed' : 'Check-in Pending'} · {rows.length} student{rows.length === 1 ? '' : 's'}</Text>
                  {!complete ? <Text style={{ fontSize: 12, color: ui.colors.textMuted }}>Item Verification PDF is available after check-in is completed.</Text> : null}
                  {rows.some(row => row.entry_kind === 'general_team') ? <Text style={{ fontSize: 11, color: ui.colors.textMuted }}>Group members show their group entry’s verification status.</Text> : null}
                  {!rows.length ? <Text style={{ paddingVertical: 20, fontSize: 13, color: ui.colors.textMuted }}>No students from your team are assigned to this event.</Text> : rows.map(row => {
                    const status = getTeamScheduleParticipantStatus(row);
                    const color = !complete ? ui.colors.textMuted : status === 'Verified' ? ui.colors.success : status === 'Not Verified' ? ui.colors.warning : ui.colors.danger;
                    return <View key={`${row.registration_id}:${row.participant_id}`} style={{ padding: 11, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 10, backgroundColor: complete ? ui.colors.surface : ui.colors.surfaceMuted, gap: 5 }}>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: complete ? ui.colors.primary : ui.colors.textMuted }}>{row.chest_number || '—'}</Text>
                        <Text style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: '600', color: complete ? ui.colors.text : ui.colors.textMuted }}>{row.participant_name}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                        <Text style={{ fontSize: 11, color: ui.colors.textMuted }}>{row.category_code || '—'}</Text>
                        <Text style={{ fontSize: 11, fontWeight: '700', color }}>{status}</Text>
                      </View>
                    </View>;
                  })}
                </>}
          </ScrollView>
          <View style={{ padding: compact ? 12 : 16, borderTopWidth: 1, borderTopColor: ui.colors.border, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
            <Button size="sm" variant="outline" disabled={loading} onPress={() => void load()}>Refresh</Button>
            {Platform.OS === 'web' && complete && rows.length > 0 && !error ? <Button size="sm" disabled={loading} onPress={() => void load(true)}>Item Verification PDF</Button> : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
