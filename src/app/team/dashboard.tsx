import { TEAM_DESKTOP_MIN_WIDTH } from '@/constants/teamLeaderTheme';
import { TeamText as Text } from '@/components/team/TeamText';
import React, { useCallback, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { ArrowRight, CalendarDays, Trophy, Users } from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderScheduleRow, TeamLeaderPublishedResult, TeamLeaderStanding } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/team/TeamCard';
import { Skeleton } from '@/components/team/TeamSkeleton';
import { TeamLeaderDataError } from '@/components/team/TeamLeaderDataError';
import { getTeamDashboardEventsToday, getTeamDashboardUpcomingEvents, isTeamEventInProgress } from '@/core/utils/teamDashboardFlow';


function StatCard({ icon: Icon, label, value, helper, tone, iconBg }: { icon: React.ComponentType<any>; label: string; value: string | number; helper: string; tone: string; iconBg: string }) {
  const ui = useTeamUi();
  return (
    <Card style={{ flex: 1, minWidth: 0, borderRadius: 16, borderColor: ui.colors.border, shadowColor: ui.shadow.shadowColor, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }}>
      <CardContent style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={21} color={tone} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: ui.colors.text, fontSize: 12, fontWeight: '500' }}>{label}</Text>
            <Text style={{ color: ui.colors.primary, fontSize: 25, fontWeight: '800', marginTop: 2 }}>{value}</Text>
            <Text style={{ color: ui.colors.textMuted, fontSize: 10, marginTop: 1 }}>{helper}</Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ icon: Icon, title, description, action, onPress }: { icon: React.ComponentType<any>; title: string; description: string; action: string; onPress: () => void }) {
  const ui = useTeamUi();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={ui.colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: ui.colors.text, fontSize: 17, fontWeight: '800' }}>{title}</Text>
          <Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 3 }}>{description}</Text>
        </View>
      </View>
      <Pressable onPress={onPress} accessibilityRole="button" style={{ borderWidth: 1, borderColor: ui.colors.border, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: ui.colors.primary, fontSize: 11, fontWeight: '700' }}>{action}</Text>
        <ArrowRight size={14} color={ui.colors.primary} />
      </Pressable>
    </View>
  );
}

export default function TeamLeaderDashboard() {
  const { context, loading: contextLoading, error: contextError } = useTeamLeaderContext();
  const ui = useTeamUi();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [schedule, setSchedule] = useState<TeamLeaderScheduleRow[]>([]);
  const [results, setResults] = useState<TeamLeaderPublishedResult[]>([]);
  const [standings, setStandings] = useState<TeamLeaderStanding[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const assignmentId = context?.assignment_id;

  useFocusEffect(useCallback(() => {
    // Updating this key intentionally reruns the focused load when Retry is pressed.
    void reloadKey;
    if (!assignmentId) return;
    let cancelled = false;
    setDataError(null);
    setDataLoading(true);
    Promise.all([
      teamLeaderPortalService.getSchedule(),
      teamLeaderPortalService.getPublishedResults(),
      teamLeaderPortalService.getStandings(),
    ]).then(([s, r, standingRows]) => {
      if (cancelled) return;
      setSchedule(s); setResults(r); setStandings(standingRows);
    }).catch((error: any) => {
      if (!cancelled) setDataError(error?.message || 'Please retry the team dashboard request.');
    }).finally(() => {
      if (!cancelled) setDataLoading(false);
    });
    return () => { cancelled = true; };
  }, [assignmentId, reloadKey]));

  if (contextLoading) return <TeamLeaderAppShell><View style={{ gap: 12 }}><Skeleton style={{ height: 200, borderRadius: 20 }} /><Skeleton style={{ height: 110, borderRadius: 16 }} /><Skeleton style={{ height: 160, borderRadius: 16 }} /></View></TeamLeaderAppShell>;
  if (contextError || !context) return <TeamLeaderAppShell><Card><CardContent style={{ padding: 24, alignItems: 'center' }}><Text style={{ color: ui.colors.textMuted, textAlign: 'center' }}>{contextError || 'Unable to load portal context. Please try again.'}</Text></CardContent></Card></TeamLeaderAppShell>;
  if (dataError) return <TeamLeaderAppShell><TeamLeaderDataError message={dataError} onRetry={() => setReloadKey((key) => key + 1)} /></TeamLeaderAppShell>;
  if (dataLoading) return <TeamLeaderAppShell><View style={{ gap: 10 }}><Skeleton style={{ height: 120, borderRadius: 17 }} /><Skeleton style={{ height: 100, borderRadius: 17 }} /><Skeleton style={{ height: 210, borderRadius: 17 }} /></View></TeamLeaderAppShell>;

  const teamName = context.team_name || 'Your Team';
  const teamPrimary = ui.colors.primary;
  const now = Date.now();
  const todaysEvents = getTeamDashboardEventsToday(schedule, now);
  const upcomingEvents = getTeamDashboardUpcomingEvents(schedule, now);
  const latestResults = results.slice(0, 5);
  const ownStanding = standings.find((row) => row.is_own_team);
  const nextEvent = upcomingEvents[0];
  const goTo = (path: string) => router.push(path as any);
  const mobile = width < TEAM_DESKTOP_MIN_WIDTH;
  const statWidth = mobile ? (width < 370 ? '100%' : '47%') : width < 1100 ? 250 : 170;

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 20, maxWidth: 1280, width: '100%', alignSelf: 'center' }}>
        <Card>
          <CardContent style={{ padding: 20, minHeight: mobile ? 128 : 116, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Users size={25} color={teamPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: ui.colors.text, fontSize: mobile ? 21 : 20, fontWeight: '700' }}>Welcome back, {teamName}!</Text>
                <Text style={{ color: ui.colors.textMuted, fontSize: 12, marginTop: 3 }}>Here is what is happening with your team today.</Text>
              </View>
            </View>
          </CardContent>
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: mobile ? 'space-between' : 'flex-start', gap: mobile ? 8 : 12 }}>
          <View style={{ width: statWidth }}><StatCard icon={Trophy} label="Current Rank" value={ownStanding?.rank ? `#${ownStanding.rank}` : '—'} helper="Keep pushing!" tone={ui.colors.primary} iconBg={ui.colors.successSoft} /></View>
          <View style={{ width: statWidth }}><StatCard icon={Trophy} label="Total Points" value={ownStanding?.total_points ?? 0} helper="Points earned" tone={ui.colors.primary} iconBg={ui.colors.primarySoft} /></View>
          <View style={{ width: statWidth }}><StatCard icon={CalendarDays} label="Today's Events" value={todaysEvents.length} helper="Events today" tone={ui.colors.primary} iconBg={ui.colors.infoSoft} /></View>
          <View style={{ width: statWidth }}><StatCard icon={CalendarDays} label="Next Competition" value={nextEvent ? isTeamEventInProgress(nextEvent, now) ? 'Live' : nextEvent.start_time ? new Date(nextEvent.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBA' : '—'} helper={nextEvent ? isTeamEventInProgress(nextEvent, now) ? 'In progress now' : nextEvent.start_time ? 'Upcoming event' : 'Time to be announced' : 'No upcoming competition'} tone={ui.colors.primary} iconBg={ui.colors.infoSoft} /></View>
        </View>

        <View>
          <Text style={{ color: ui.colors.text, fontSize: 18, fontWeight: '800', marginBottom: 12 }}>Quick access</Text>
          <View style={{ backgroundColor: ui.colors.surfaceGlass, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 17, padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[{ label: 'My team', desc: 'View and manage your team', path: '/team/my-team', icon: Users }, { label: 'Full schedule', desc: 'Browse all events & timings', path: '/team/schedule', icon: CalendarDays }, { label: 'View results', desc: 'Check results & standings', path: '/team/results', icon: Trophy }].map(({ label, desc, path, icon: Icon }) => (
              <Pressable key={path} onPress={() => goTo(path)} accessibilityRole="button" style={{ flex: 1, minWidth: mobile ? 220 : 210, minHeight: 56, padding: mobile ? 11 : 13, borderRadius: 14, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon size={23} color={ui.colors.primary} /><View style={{ flex: 1 }}><Text style={{ color: ui.colors.primary, fontSize: 13, fontWeight: '800' }}>{label}</Text><Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 3 }}>{desc}</Text></View><ArrowRight size={17} color={ui.colors.primary} />
              </Pressable>
            ))}
          </View>
        </View>

        <Card style={{ borderRadius: 18, borderColor: ui.colors.border, shadowColor: ui.shadow.shadowColor, shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}>
          <CardContent style={{ padding: 20 }}>
            <SectionHeader icon={CalendarDays} title="Upcoming Competitions" description="Stay ahead of the game. Here's what's coming up." action="View full schedule" onPress={() => goTo('/team/schedule')} />
            {upcomingEvents.length === 0 ? <EmptyState icon={CalendarDays} title="No upcoming competitions" text="You're all caught up! New events will appear here." /> : <View style={{ gap: 8 }}>{upcomingEvents.map((event) => {
              const inProgress = isTeamEventInProgress(event, now);
              return <View key={event.schedule_id} style={{ minWidth: 0, padding: 12, borderRadius: 14, backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.border, flexDirection: mobile ? 'column' : 'row', alignItems: mobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={2} style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>{event.item_name || event.item_code || 'Competition'}</Text>
                  <Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 4 }}>{event.start_time ? new Date(event.start_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Time to be announced'}{event.venue_name ? ` · ${event.venue_name}` : ''}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: mobile ? '100%' : undefined }}>
                  <View style={{ borderRadius: 999, backgroundColor: inProgress ? ui.colors.navActive : ui.colors.infoSoft, paddingHorizontal: 9, paddingVertical: 4 }}>
                    <Text style={{ color: inProgress ? ui.colors.navActiveText : ui.colors.info, fontSize: 10, fontWeight: '700' }}>{inProgress ? 'In progress' : event.event_status || 'Scheduled'}</Text>
                  </View>
                  <Text style={{ color: ui.colors.textMuted, fontSize: 10, fontWeight: '600' }}>{event.participant_count} participants</Text>
                </View>
              </View>;
            })}</View>}
          </CardContent>
        </Card>

        <Card style={{ borderRadius: 18, borderColor: ui.colors.border, shadowColor: ui.shadow.shadowColor, shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}>
          <CardContent style={{ padding: 20 }}>
            <SectionHeader icon={Trophy} title="Latest Results" description="Track your team's performance and achievements." action="View all results" onPress={() => goTo('/team/results')} />
            {latestResults.length === 0 ? <EmptyState icon={Trophy} title="No published results yet" text="Results will be published once available." /> : <View style={{ gap: 8 }}>{latestResults.map((result) => <View key={result.result_id} style={{ padding: 11, borderRadius: 11, backgroundColor: ui.colors.surfaceMuted, borderWidth: 1, borderColor: ui.colors.border, flexDirection: 'row', justifyContent: 'space-between' }}><View><Text style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>{result.item_name || result.item_code || 'Item'}</Text><Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 4 }}>{result.participant_name || 'Participant'}{result.grade ? ` · Grade ${result.grade}` : ''}</Text></View>{result.rank != null && <Text style={{ color: ui.colors.primary, fontSize: 15, fontWeight: '800' }}>#{result.rank}</Text>}</View>)}</View>}
          </CardContent>
        </Card>
      </View>
    </TeamLeaderAppShell>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: React.ComponentType<any>; title: string; text: string }) {
  const ui = useTeamUi();
  return <View style={{ minHeight: 120, alignItems: 'center', justifyContent: 'center', paddingVertical: 18 }}><View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}><Icon size={25} color={ui.colors.primary} /></View><Text style={{ color: ui.colors.text, fontSize: 14, fontWeight: '800' }}>{title}</Text><Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 4 }}>{text}</Text></View>;
}
