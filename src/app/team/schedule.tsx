import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import React, { useEffect, useState } from 'react';
import { TeamText as Text } from '@/components/team/TeamText';
import { TeamPageHeading } from '@/components/team/TeamPageHeading';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderScheduleRow } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/team/TeamCard';
import { Badge } from '@/components/team/TeamBadge';
import { Button } from '@/components/team/TeamButton';
import { Skeleton } from '@/components/team/TeamSkeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/team/TeamTabs';
import { downloadTeamLeaderSchedulePdf } from '@/services/schedulePdfService';
import { TeamLeaderDataError } from '@/components/team/TeamLeaderDataError';

export default function ScheduleScreen() {
  const ui = useTeamUi();
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [schedule, setSchedule] = useState<TeamLeaderScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [isExporting, setIsExporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
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
    ? s.event_status === 'ongoing' || s.event_status === 'in_progress'
    : s.event_status === filter);
  const exportMyTeamSchedule = async () => {
    if (!context || !filtered.length) return;
    try {
      setIsExporting(true);
      await downloadTeamLeaderSchedulePdf(context, filtered);
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
            <Button variant="default" size="sm" disabled={isExporting || !filtered.length} onPress={exportMyTeamSchedule}>
              {isExporting ? 'Preparing…' : 'Download My Team PDF'}
            </Button>
          </View>} />

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="scheduled">Upcoming</TabsTrigger>
            <TabsTrigger value="ongoing">Live</TabsTrigger>
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
                        <Badge variant={event.event_status === 'completed' ? 'secondary' : event.event_status === 'ongoing' || event.event_status === 'in_progress' ? 'info' : 'outline'}>
                          {event.event_status === 'in_progress' ? 'In progress' : event.event_status || 'scheduled'}
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
    </TeamLeaderAppShell>
  );
}
