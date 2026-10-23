import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import React, { useEffect, useState } from 'react';
import { TeamText as Text } from '@/components/team/TeamText';
import { TeamPageHeading } from '@/components/team/TeamPageHeading';
import { Modal, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { Download, X } from 'lucide-react-native';
import { teamLeaderPortalService, TeamLeaderScheduleRow } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/team/TeamCard';
import { Badge } from '@/components/team/TeamBadge';
import { Button } from '@/components/team/TeamButton';
import { Skeleton } from '@/components/team/TeamSkeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/team/TeamTabs';
import { downloadTeamLeaderSchedulePdf } from '@/services/schedulePdfService';
import { TeamLeaderDataError } from '@/components/team/TeamLeaderDataError';
import { getScheduleLifecycleLabel, normalizeScheduleLifecycleStatus } from '@/core/utils/scheduleLifecycle';

export default function ScheduleScreen() {
  const ui = useTeamUi();
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [schedule, setSchedule] = useState<TeamLeaderScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('scheduled');
  const [isExporting, setIsExporting] = useState(false);
  const [exportPickerOpen, setExportPickerOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const router = useRouter();

  useEffect(() => {
    if (!context) return;
    setLoadError(null);
    setLoading(true);
    teamLeaderPortalService.getSchedule().then((data) => {
      setSchedule(data);
      setLoading(false);
    }).catch((error: any) => { setLoadError(error?.message || 'Please retry the schedule request.'); setLoading(false); });
  }, [context, reloadKey]);

  if (contextLoading || loading) {
    return (
      <TeamLeaderAppShell>
        <View style={{ gap: 12 }}>
          <Skeleton style={{ height: 40, borderRadius: 8 }} />
          <Skeleton style={{ height: 120, borderRadius: 12 }} />
          <Skeleton style={{ height: 120, borderRadius: 12 }} />
        </View>
      </TeamLeaderAppShell>
    );
  }
  if (loadError) return <TeamLeaderAppShell><TeamLeaderDataError message={loadError} onRetry={() => setReloadKey((key) => key + 1)} /></TeamLeaderAppShell>;

  const filtered = filter === 'all' ? schedule : schedule.filter((s) => filter === 'ongoing'
    ? normalizeScheduleLifecycleStatus(s.event_status) === 'ongoing'
    : normalizeScheduleLifecycleStatus(s.event_status) === filter);
  const exportMyTeamSchedule = async () => {
    if (!context || !schedule.length) return;
    try {
      setIsExporting(true);
      setExportPickerOpen(false);
      await downloadTeamLeaderSchedulePdf(context, schedule);
      if (Platform.OS === 'web') window.alert('My Team Schedule PDF downloaded successfully.');
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(error?.message || 'Unable to generate team schedule PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <TeamPageHeading title="Schedule" teamName={context?.team_name}
          subtitle={`${schedule.length} event${schedule.length === 1 ? '' : 's'} for your team`}
          actions={<View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="outline" size="sm" onPress={() => router.push('/team/schedule/full')}>
              Full Schedule
            </Button>
            <Pressable accessibilityRole="button" accessibilityLabel="Export team schedule PDFs" accessibilityState={{ disabled: isExporting || !schedule.length, busy: isExporting }} disabled={isExporting || !schedule.length} onPress={() => setExportPickerOpen(true)} style={{ minHeight: 40, paddingHorizontal: 13, borderRadius: 12, backgroundColor: ui.colors.primaryStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: isExporting || !schedule.length ? 0.55 : 1 }}>
              <Download size={15} color={ui.colors.onPrimary} />
              <Text style={{ color: ui.colors.onPrimary, fontSize: 12, fontWeight: '700' }}>{isExporting ? 'Preparing…' : 'Export'}</Text>
            </Pressable>
          </View>} />

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="scheduled">Upcoming</TabsTrigger>
            <TabsTrigger value="ongoing">Started</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value={filter}>
            {filtered.length === 0 ? (
              <Card>
                <CardContent style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: ui.colors.textMuted }}>No events found</Text>
                </CardContent>
              </Card>
            ) : (
              <View style={{ gap: 8 }}>
                {filtered.map((event) => (
                  <Card key={event.schedule_id}>
                    <CardContent style={{ padding: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: ui.colors.text }}>
                            {event.item_name || event.item_code || 'Event'}
                          </Text>
                          <Text style={{ fontSize: 12, color: ui.colors.textMuted, marginTop: 2 }}>
                            {event.start_time ? new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            {event.end_time ? ` - ${new Date(event.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                          </Text>
                          {event.venue_name && (
                            <Text style={{ fontSize: 12, color: ui.colors.textMuted, marginTop: 2 }}>
                              Venue: {event.venue_name}
                            </Text>
                          )}
                          <Text style={{ fontSize: 12, color: ui.colors.textMuted, marginTop: 2 }}>
                            {event.participant_count} participant{event.participant_count !== 1 ? 's' : ''} · {event.checked_in_count} checked in
                          </Text>
                        </View>
                        <Badge variant={normalizeScheduleLifecycleStatus(event.event_status) === 'completed' ? 'secondary' : normalizeScheduleLifecycleStatus(event.event_status) === 'ongoing' ? 'info' : 'outline'}>
                          {getScheduleLifecycleLabel(event.event_status)}
                        </Badge>
                      </View>
                    </CardContent>
                  </Card>
                ))}
              </View>
            )}
          </TabsContent>
        </Tabs>
      </View>
      <Modal visible={exportPickerOpen} transparent animationType="fade" onRequestClose={() => !isExporting && setExportPickerOpen(false)}>
        <Pressable onPress={() => !isExporting && setExportPickerOpen(false)} style={{ flex: 1, justifyContent: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20, backgroundColor: ui.colors.overlay }}>
          <Pressable onPress={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 460, alignSelf: 'center', padding: 18, borderTopLeftRadius: isMobile ? 22 : 18, borderTopRightRadius: isMobile ? 22 : 18, borderBottomLeftRadius: isMobile ? 0 : 18, borderBottomRightRadius: isMobile ? 0 : 18, backgroundColor: ui.colors.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={{ color: ui.colors.text, fontSize: 17, fontWeight: '800' }}>Export</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close export options" disabled={isExporting} onPress={() => setExportPickerOpen(false)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><X size={19} color={ui.colors.textMuted} /></Pressable>
            </View>
            <Text style={{ color: ui.colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 14 }}>Choose a PDF format to download. The current option includes all events in your team schedule.</Text>
            <Pressable accessibilityRole="button" disabled={isExporting} onPress={() => void exportMyTeamSchedule()} style={{ minHeight: 52, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surfaceGlass, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, opacity: isExporting ? 0.6 : 1 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>My Team Schedule</Text>
                <Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 2 }}>PDF · {schedule.length} events</Text>
              </View>
              <Download size={17} color={ui.colors.primaryStrong} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </TeamLeaderAppShell>
  );
}
