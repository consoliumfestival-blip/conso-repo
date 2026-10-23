import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import React, { useEffect, useState } from 'react';
import { TeamText as Text } from '@/components/team/TeamText';
import { TeamPageHeading } from '@/components/team/TeamPageHeading';
import { View } from 'react-native';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderScheduleRow } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/team/TeamCard';
import { Badge } from '@/components/team/TeamBadge';
import { Skeleton } from '@/components/team/TeamSkeleton';
import { getScheduleLifecycleLabel, normalizeScheduleLifecycleStatus } from '@/core/utils/scheduleLifecycle';

export default function FullScheduleScreen() {
  const ui = useTeamUi();
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [schedule, setSchedule] = useState<TeamLeaderScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!context) return;
    teamLeaderPortalService.getSchedule().then((data) => {
      setSchedule(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [context]);

  if (contextLoading || loading) {
    return (
      <TeamLeaderAppShell>
        <View style={{ gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} style={{ height: 80, borderRadius: 12 }} />
          ))}
        </View>
      </TeamLeaderAppShell>
    );
  }

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <TeamPageHeading title="Full Schedule" teamName={context?.team_name}
          subtitle="Complete event schedule for your team" />

        {schedule.length === 0 ? (
          <Card>
            <CardContent style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: ui.colors.textMuted }}>No events scheduled</Text>
            </CardContent>
          </Card>
        ) : (
          <View style={{ gap: 8 }}>
            {schedule.map((event) => (
              <Card key={event.schedule_id}>
                <CardContent style={{ padding: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: ui.colors.text }}>
                        {event.item_name || event.item_code || 'Event'}
                      </Text>
                      <Text style={{ fontSize: 12, color: ui.colors.textMuted, marginTop: 2 }}>
                        {event.start_time ? new Date(event.start_time).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        }) : ''}
                        {event.end_time ? ` - ${new Date(event.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                      </Text>
                      {event.venue_name && (
                        <Text style={{ fontSize: 12, color: ui.colors.textMuted, marginTop: 2 }}>
                          Venue: {event.venue_name}
                        </Text>
                      )}
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        <Text style={{ fontSize: 12, color: ui.colors.textMuted }}>
                          {event.participant_count} participant{event.participant_count !== 1 ? 's' : ''}
                        </Text>
                        <Text style={{ fontSize: 12, color: ui.colors.textMuted }}>
                          {event.checked_in_count} checked in
                        </Text>
                      </View>
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
      </View>
    </TeamLeaderAppShell>
  );
}
