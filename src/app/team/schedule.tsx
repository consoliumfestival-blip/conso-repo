import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderScheduleRow } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/shadcn/tabs';
import { downloadTeamLeaderSchedulePdf } from '@/services/schedulePdfService';
import { TeamLeaderDataError } from '@/components/team/TeamLeaderDataError';

export default function ScheduleScreen() {
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

  const filtered = filter === 'all' ? schedule : schedule.filter((s) => s.event_status === filter);
  const teamPrimary = context?.portal_primary_color || '#0F766E';
  const teamAccent = context?.portal_accent_color || '#14B8A6';

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
        <View style={{ padding: 18, borderRadius: 16, backgroundColor: `${teamAccent}12`, borderWidth: 1, borderColor: `${teamAccent}45`, borderLeftWidth: 4, borderLeftColor: teamPrimary, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <View>
            <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', color: teamPrimary }}>Planning</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: 'hsl(var(--foreground))', marginTop: 4 }}>Schedule</Text>
            <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
              {schedule.length} event{schedule.length === 1 ? '' : 's'} for your team
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="outline" size="sm" onPress={() => router.push('/team/schedule/full')}>
              Full Schedule
            </Button>
            <Button variant="default" size="sm" disabled={isExporting || !filtered.length} onPress={exportMyTeamSchedule}>
              {isExporting ? 'Preparing…' : 'Download My Team PDF'}
            </Button>
          </View>
        </View>

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
                  <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>No events found</Text>
                </CardContent>
              </Card>
            ) : (
              <View style={{ gap: 8 }}>
                {filtered.map((event) => (
                  <Card key={event.schedule_id}>
                    <CardContent style={{ padding: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: 'hsl(var(--foreground))' }}>
                            {event.item_name || event.item_code || 'Event'}
                          </Text>
                          <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                            {event.start_time ? new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            {event.end_time ? ` - ${new Date(event.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                          </Text>
                          {event.venue_name && (
                            <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                              Venue: {event.venue_name}
                            </Text>
                          )}
                          <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                            {event.participant_count} participant{event.participant_count !== 1 ? 's' : ''} · {event.checked_in_count} checked in
                          </Text>
                        </View>
                        <Badge variant={event.event_status === 'completed' ? 'secondary' : event.event_status === 'ongoing' ? 'info' : 'outline'}>
                          {event.event_status || 'scheduled'}
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
