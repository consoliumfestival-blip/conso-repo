import { TEAM_DESKTOP_MIN_WIDTH } from '@/constants/teamLeaderTheme';
import { TeamText as Text } from '@/components/team/TeamText';
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { ArrowRight, CalendarDays, Clock3, MessageSquare, Moon, Sun, Trophy, Users } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { useTeamTheme, useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderScheduleRow, TeamLeaderPublishedResult, TeamLeaderStanding } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/team/TeamCard';
import { Skeleton } from '@/components/team/TeamSkeleton';
import { TeamLeaderDataError } from '@/components/team/TeamLeaderDataError';
import { getTeamDashboardEventsToday, getTeamDashboardUpcomingEvents, isTeamEventInProgress } from '@/core/utils/teamDashboardFlow';

const dashboardGlassSurface = Platform.OS === 'web' ? {
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
} as any : {};

function SummaryMetric({ icon: Icon, label, value, helper, tone, description, mobile }: { icon: React.ComponentType<any>; label: string; value: string; helper: string; tone: string; description: string; mobile: boolean }) {
  return (
    <View accessible accessibilityLabel={`${description}: ${value}. ${helper}`} style={{ ...dashboardGlassSurface, flex: 1, minWidth: 0, minHeight: mobile ? 68 : 78, paddingHorizontal: mobile ? 8 : 9, paddingVertical: mobile ? 8 : 10, borderRadius: 15, backgroundColor: 'rgba(255,247,241,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.68)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: mobile ? 5 : 7 }}>
        <Icon size={13} color={tone} />
        <Text numberOfLines={1} style={{ flexShrink: 1, color: '#76665D', fontSize: 9, fontWeight: '700' }}>{label}</Text>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: '#2A211D', fontSize: mobile ? 16 : 17, lineHeight: 20, fontWeight: '800' }}>{value}</Text>
      <Text numberOfLines={1} style={{ color: '#88786E', fontSize: 8, lineHeight: 12, marginTop: 2 }}>{helper}</Text>
    </View>
  );
}

function DashboardHeaderActions() {
  const { mode, toggleMode } = useTeamTheme();
  const router = useRouter();
  const ThemeIcon = mode === 'dark' ? Sun : Moon;
  const buttonStyle = {
    ...dashboardGlassSurface,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable onPress={toggleMode} accessibilityRole="button" accessibilityLabel={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} style={buttonStyle}>
        <ThemeIcon size={18} color="#FFFFFF" />
      </Pressable>
      <Pressable onPress={() => router.push('/team/announcements')} accessibilityRole="button" accessibilityLabel="Open announcements" style={buttonStyle}>
        <MessageSquare size={18} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function DashboardHero({ teamName, points, rank, todaysEvents, nextEvent, now, leaderPoints, mobile }: {
  teamName: string;
  points: number;
  rank?: number;
  todaysEvents: number;
  nextEvent?: TeamLeaderScheduleRow;
  now: number;
  leaderPoints: number;
  mobile: boolean;
}) {
  const ui = useTeamUi();
  const router = useRouter();
  const pointsProgress = leaderPoints > 0 ? Math.min(100, Math.max(0, (points / leaderPoints) * 100)) : 0;
  const progressLabel = leaderPoints > 0 ? `${Math.round(pointsProgress)}% of top score` : 'Points will appear after results are published';
  const nextIsLive = nextEvent ? isTeamEventInProgress(nextEvent, now) : false;
  const nextValue = nextEvent
    ? nextIsLive ? 'LIVE' : nextEvent.start_time ? new Date(nextEvent.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'TBA'
    : '—';
  const nextHelper = nextEvent ? nextIsLive ? 'In progress' : nextEvent.start_time ? 'Upcoming event' : 'Time TBA' : 'No event';
  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const teamInitial = teamName.trim().charAt(0).toUpperCase() || 'T';

  return (
    <View style={{ overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', ...ui.shadow }}>
      <LinearGradient colors={['rgba(75,33,16,0.97)', 'rgba(44,27,21,0.96)', 'rgba(29,27,25,0.96)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ ...dashboardGlassSurface, padding: mobile ? 15 : 22, gap: mobile ? 14 : 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.push('/team/profile')} accessibilityRole="button" accessibilityLabel="Open team profile" style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>{teamInitial}</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: mobile ? 16 : 19, lineHeight: mobile ? 21 : 24, fontWeight: '700' }}>{greeting}, {teamName}</Text>
          </View>
          {mobile && <DashboardHeaderActions />}
        </View>

        <View style={{ flexDirection: mobile ? 'column' : 'row', alignItems: 'stretch', gap: mobile ? 16 : 22 }}>
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ color: 'rgba(255,255,255,0.66)', fontSize: 10, fontWeight: '600' }}>Total points</Text>
              {leaderPoints > 0 && <View style={{ borderRadius: 999, backgroundColor: 'rgba(236,94,39,0.22)', paddingHorizontal: 8, paddingVertical: 4 }}><Text numberOfLines={1} style={{ color: '#FFAB84', fontSize: 9, fontWeight: '700' }}>{progressLabel}</Text></View>}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 2 }}>
              <Text adjustsFontSizeToFit numberOfLines={1} style={{ flexShrink: 1, color: '#FFFFFF', fontSize: mobile ? 38 : 46, lineHeight: mobile ? 44 : 52, fontWeight: '800' }}>{points.toLocaleString()}</Text>
              {leaderPoints > 0 && <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.56)', fontSize: 10 }}>/ {leaderPoints.toLocaleString()}</Text>}
            </View>
            <View style={{ marginTop: mobile ? 7 : 10 }}>
              <View accessible accessibilityRole="progressbar" accessibilityLabel={progressLabel} accessibilityValue={{ min: 0, max: 100, now: Math.round(pointsProgress) }} style={{ height: mobile ? 5 : 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
                <View style={{ width: `${pointsProgress}%`, height: '100%', borderRadius: 999, backgroundColor: ui.colors.primary }} />
              </View>
              {leaderPoints === 0 && <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, marginTop: 5 }}>{progressLabel}</Text>}
            </View>
          </View>

          <View style={{ flex: 1.35, flexDirection: 'row', alignItems: 'stretch', gap: 8 }}>
            <SummaryMetric icon={Trophy} label="Rank" value={rank ? `#${rank}` : '—'} helper="Current" tone="#EC5E27" description="Current rank" mobile={mobile} />
            <SummaryMetric icon={CalendarDays} label="Today" value={String(todaysEvents)} helper="Events" tone="#3676D9" description="Today's events" mobile={mobile} />
            <SummaryMetric icon={Clock3} label="Next" value={nextValue} helper={nextHelper} tone={nextIsLive ? '#34704B' : '#EC5E27'} description="Next competition" mobile={mobile} />
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

function SectionHeader({ icon: Icon, title, description, action, onPress, mobile }: { icon: React.ComponentType<any>; title: string; description: string; action: string; onPress: () => void; mobile: boolean }) {
  const ui = useTeamUi();
  const actionButton = (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ minHeight: mobile ? 44 : 40, alignSelf: mobile ? 'flex-end' : undefined, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, flexShrink: 0 }}>
      <Text style={{ color: ui.colors.primary, fontSize: 11, fontWeight: '700' }}>{action}</Text>
      <ArrowRight size={15} color={ui.colors.primary} />
    </Pressable>
  );

  if (mobile) {
    return (
      <View style={{ gap: 10, marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11 }}>
          <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={20} color={ui.colors.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: ui.colors.text, fontSize: 16, lineHeight: 21, fontWeight: '800' }}>{title}</Text>
            <Text style={{ color: ui.colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 3 }}>{description}</Text>
          </View>
        </View>
        {actionButton}
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={ui.colors.primary} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: ui.colors.text, fontSize: 17, lineHeight: 22, fontWeight: '800' }}>{title}</Text>
          <Text style={{ color: ui.colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 3 }}>{description}</Text>
        </View>
      </View>
      {actionButton}
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
  const now = Date.now();
  const todaysEvents = getTeamDashboardEventsToday(schedule, now);
  const upcomingEvents = getTeamDashboardUpcomingEvents(schedule, now);
  const latestResults = results.slice(0, 5);
  const ownStanding = standings.find((row) => row.is_own_team);
  const leaderPoints = standings.reduce((highest, row) => Math.max(highest, row.total_points), 0);
  const nextEvent = upcomingEvents[0];
  const goTo = (path: string) => router.push(path as any);
  const mobile = width < TEAM_DESKTOP_MIN_WIDTH;

  return (
    <TeamLeaderAppShell hideMobileHeader>
      <View style={{ gap: 20, maxWidth: 1280, width: '100%', alignSelf: 'center' }}>
        <View style={{ marginHorizontal: mobile ? -16 : 0, marginTop: mobile ? -4 : 0 }}>
          <DashboardHero teamName={teamName} points={ownStanding?.total_points ?? 0} rank={ownStanding?.rank} todaysEvents={todaysEvents.length} nextEvent={nextEvent} now={now} leaderPoints={leaderPoints} mobile={mobile} />
        </View>

        <View>
          <Text style={{ color: ui.colors.text, fontSize: 18, fontWeight: '800', marginBottom: 12 }}>Quick access</Text>
          <View style={{ ...dashboardGlassSurface, backgroundColor: ui.colors.surfaceGlass, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 17, padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[{ label: 'My team', desc: 'View and manage your team', path: '/team/my-team', icon: Users }, { label: 'Full schedule', desc: 'Browse all events & timings', path: '/team/schedule', icon: CalendarDays }, { label: 'View results', desc: 'Check results & standings', path: '/team/results', icon: Trophy }].map(({ label, desc, path, icon: Icon }) => (
              <Pressable key={path} onPress={() => goTo(path)} accessibilityRole="button" style={{ ...dashboardGlassSurface, flex: 1, minWidth: mobile ? 220 : 210, minHeight: 56, padding: mobile ? 11 : 13, borderRadius: 14, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surfaceGlass, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon size={23} color={ui.colors.primary} /><View style={{ flex: 1 }}><Text style={{ color: ui.colors.primary, fontSize: 13, fontWeight: '800' }}>{label}</Text><Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 3 }}>{desc}</Text></View><ArrowRight size={17} color={ui.colors.primary} />
              </Pressable>
            ))}
          </View>
        </View>

        <Card style={{ borderRadius: 18, borderColor: ui.colors.border, shadowColor: ui.shadow.shadowColor, shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}>
          <CardContent style={{ padding: mobile ? 14 : 20 }}>
            <SectionHeader icon={CalendarDays} title="Upcoming Competitions" description="Stay ahead of the game. Here's what's coming up." action="View full schedule" onPress={() => goTo('/team/schedule')} mobile={mobile} />
            {upcomingEvents.length === 0 ? <EmptyState icon={CalendarDays} title="No upcoming competitions" text="You're all caught up! New events will appear here." mobile={mobile} /> : <View style={{ gap: 8 }}>{upcomingEvents.map((event) => {
              const inProgress = isTeamEventInProgress(event, now);
              return <View key={event.schedule_id} style={{ minWidth: 0, padding: 12, borderRadius: 14, backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.border, flexDirection: mobile ? 'column' : 'row', alignItems: mobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={2} style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>{event.item_name || event.item_code || 'Competition'}</Text>
                  <Text style={{ color: ui.colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 4 }}>{event.start_time ? new Date(event.start_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Time to be announced'}{event.venue_name ? ` · ${event.venue_name}` : ''}</Text>
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
          <CardContent style={{ padding: mobile ? 14 : 20 }}>
            <SectionHeader icon={Trophy} title="Latest Results" description="Track your team's performance and achievements." action="View all results" onPress={() => goTo('/team/results')} mobile={mobile} />
            {latestResults.length === 0 ? <EmptyState icon={Trophy} title="No published results yet" text="Results will be published once available." mobile={mobile} /> : <View style={{ gap: 8 }}>{latestResults.map((result) => <View key={result.result_id} style={{ minWidth: 0, padding: 11, borderRadius: 12, backgroundColor: ui.colors.surfaceMuted, borderWidth: 1, borderColor: ui.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={2} style={{ color: ui.colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700' }}>{result.item_name || result.item_code || 'Item'}</Text><Text numberOfLines={2} style={{ color: ui.colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 4 }}>{result.participant_name || 'Participant'}{result.grade ? ` · Grade ${result.grade}` : ''}</Text></View>{result.rank != null && <Text style={{ flexShrink: 0, color: ui.colors.primary, fontSize: 15, fontWeight: '800' }}>#{result.rank}</Text>}</View>)}</View>}
          </CardContent>
        </Card>
      </View>
    </TeamLeaderAppShell>
  );
}

function EmptyState({ icon: Icon, title, text, mobile }: { icon: React.ComponentType<any>; title: string; text: string; mobile: boolean }) {
  const ui = useTeamUi();
  return <View style={{ minHeight: mobile ? 126 : 120, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 16 }}><View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}><Icon size={25} color={ui.colors.primary} /></View><Text style={{ width: '100%', color: ui.colors.text, fontSize: 14, lineHeight: 19, fontWeight: '800', textAlign: 'center' }}>{title}</Text><Text style={{ width: '100%', color: ui.colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4, textAlign: 'center' }}>{text}</Text></View>;
}
