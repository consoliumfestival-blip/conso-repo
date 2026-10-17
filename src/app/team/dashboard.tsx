import { ui } from '@/constants/designSystem';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { ArrowRight, CalendarDays, Megaphone, Radio, Trophy, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderScheduleRow, TeamLeaderPublishedResult, TeamLeaderAnnouncement, TeamLeaderStanding } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { TeamLeaderDataError } from '@/components/team/TeamLeaderDataError';


function StatCard({ icon: Icon, label, value, helper, tone, iconBg }: { icon: React.ComponentType<any>; label: string; value: string | number; helper: string; tone: string; iconBg: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 170, borderRadius: 16, borderColor: ui.colors.border, shadowColor: ui.shadow.shadowColor, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }}>
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
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: '#E5F5F1', alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={ui.colors.primary} /></View>
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
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [schedule, setSchedule] = useState<TeamLeaderScheduleRow[]>([]);
  const [results, setResults] = useState<TeamLeaderPublishedResult[]>([]);
  const [announcements, setAnnouncements] = useState<TeamLeaderAnnouncement[]>([]);
  const [standings, setStandings] = useState<TeamLeaderStanding[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!context) return;
    let cancelled = false;
    setDataError(null);
    Promise.all([
      teamLeaderPortalService.getSchedule(),
      teamLeaderPortalService.getPublishedResults(),
      teamLeaderPortalService.getAnnouncements(),
      teamLeaderPortalService.getStandings(),
    ]).then(([s, r, a, standingRows]) => {
      if (cancelled) return;
      setSchedule(s); setResults(r); setAnnouncements(a); setStandings(standingRows);
    }).catch((error: any) => {
      if (!cancelled) setDataError(error?.message || 'Please retry the team dashboard request.');
    });
    return () => { cancelled = true; };
  }, [context, reloadKey]);

  if (contextLoading) return <TeamLeaderAppShell><View style={{ gap: 12 }}><Skeleton style={{ height: 200, borderRadius: 20 }} /><Skeleton style={{ height: 110, borderRadius: 16 }} /><Skeleton style={{ height: 160, borderRadius: 16 }} /></View></TeamLeaderAppShell>;
  if (contextError || !context) return <TeamLeaderAppShell><Card><CardContent style={{ padding: 24, alignItems: 'center' }}><Text style={{ color: ui.colors.textMuted, textAlign: 'center' }}>{contextError || 'Unable to load portal context. Please try again.'}</Text></CardContent></Card></TeamLeaderAppShell>;
  if (dataError) return <TeamLeaderAppShell><TeamLeaderDataError message={dataError} onRetry={() => setReloadKey((key) => key + 1)} /></TeamLeaderAppShell>;

  const teamName = context.team_name || 'Your Team';
  const teamPrimary = context.portal_primary_color || ui.colors.primary;
  const todayKey = new Date().toDateString();
  const todaysEvents = schedule.filter((event) => event.start_time && new Date(event.start_time).toDateString() === todayKey);
  const upcomingEvents = schedule.filter((event) => !event.start_time || new Date(event.start_time).getTime() >= Date.now()).slice(0, 5);
  const latestResults = results.slice(0, 5);
  const ownStanding = standings.find((row) => row.is_own_team);
  const nextEvent = upcomingEvents[0];
  const goTo = (path: string) => router.push(path as any);
  const statWidth = width < 600 ? 300 : width < 1100 ? 250 : 170;

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 20, maxWidth: 1280, width: '100%', alignSelf: 'center' }}>
        <View style={{ minHeight: 190, padding: 26, borderRadius: 22, backgroundColor: teamPrimary, overflow: 'hidden', position: 'relative' }}>
          <View style={{ position: 'absolute', right: 0, top: 8, width: 255, height: 190, borderRadius: 130, borderWidth: 1, borderColor: 'rgba(100,240,220,0.12)', transform: [{ rotate: '-20deg' }] }} />
          <View style={{ position: 'absolute', right: 76, top: 40, width: 108, height: 108, borderRadius: 54, borderWidth: 1, borderColor: 'rgba(100,240,220,0.1)' }} />
          <View style={{ position: 'absolute', right: 78, top: 51, opacity: 0.2 }}><Trophy size={100} color="#79E5D5" strokeWidth={1.3} /></View>
          <Text style={{ color: '#6CE3D2', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' }}>Team Leader Portal</Text>
          <Text style={{ color: ui.colors.surface, fontSize: width < 600 ? 30 : 39, fontWeight: '800', marginTop: 7 }}>{teamName}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.86)', fontSize: 14, marginTop: 3 }}>You&apos;re in charge. Lead, inspire, achieve.</Text>
          <Pressable onPress={() => goTo('/team/my-team')} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: 19, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11, backgroundColor: ui.colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Radio size={15} color={ui.colors.primary} /><Text style={{ color: ui.colors.primary, fontSize: 11, fontWeight: '800' }}>LIVE TEAM SPACE</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ width: statWidth }}><StatCard icon={Trophy} label="Current Rank" value={ownStanding?.rank ? `#${ownStanding.rank}` : '—'} helper="Keep pushing!" tone="#23B981" iconBg={ui.colors.successSoft} /></View>
          <View style={{ width: statWidth }}><StatCard icon={Trophy} label="Total Points" value={ownStanding?.total_points ?? 0} helper="Points earned" tone="#3478F6" iconBg={ui.colors.primarySoft} /></View>
          <View style={{ width: statWidth }}><StatCard icon={CalendarDays} label="Today&apos;s Events" value={todaysEvents.length} helper="Events today" tone="#9366E8" iconBg={ui.colors.infoSoft} /></View>
          <View style={{ width: statWidth }}><StatCard icon={CalendarDays} label="Next Reporting" value={nextEvent?.start_time ? new Date(nextEvent.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} helper="No upcoming report" tone="#E9962F" iconBg={ui.colors.warningSoft} /></View>
          <View style={{ width: statWidth }}><StatCard icon={Megaphone} label="Announcements" value={announcements.length} helper="Unread" tone="#55B64B" iconBg={ui.colors.successSoft} /></View>
        </View>

        <View>
          <Text style={{ color: ui.colors.text, fontSize: 18, fontWeight: '800', marginBottom: 12 }}>Quick access</Text>
          <View style={{ backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 18, padding: 13, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {[{ label: 'My team', desc: 'View and manage your team', path: '/team/my-team', icon: Users }, { label: 'Full schedule', desc: 'Browse all events & timings', path: '/team/schedule', icon: CalendarDays }, { label: 'View results', desc: 'Check results & standings', path: '/team/results', icon: Trophy }].map(({ label, desc, path, icon: Icon }) => (
              <Pressable key={path} onPress={() => goTo(path)} accessibilityRole="button" style={{ flex: 1, minWidth: 210, padding: 14, borderRadius: 13, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: '#FAFDFC', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon size={23} color={ui.colors.primary} /><View style={{ flex: 1 }}><Text style={{ color: ui.colors.primary, fontSize: 13, fontWeight: '800' }}>{label}</Text><Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 3 }}>{desc}</Text></View><ArrowRight size={17} color={ui.colors.primary} />
              </Pressable>
            ))}
          </View>
        </View>

        <Card style={{ borderRadius: 18, borderColor: ui.colors.border, shadowColor: ui.shadow.shadowColor, shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}>
          <CardContent style={{ padding: 20 }}>
            <SectionHeader icon={CalendarDays} title="Upcoming Competitions" description="Stay ahead of the game. Here&apos;s what&apos;s coming up." action="View full schedule" onPress={() => goTo('/team/schedule')} />
            {upcomingEvents.length === 0 ? <EmptyState icon={CalendarDays} title="No upcoming competitions" text="You&apos;re all caught up! New events will appear here." /> : <View style={{ gap: 8 }}>{upcomingEvents.map((event) => <View key={event.schedule_id} style={{ padding: 11, borderRadius: 11, backgroundColor: ui.colors.surfaceMuted, borderWidth: 1, borderColor: ui.colors.border, flexDirection: 'row', justifyContent: 'space-between' }}><View><Text style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>{event.item_name || event.item_code || 'Competition'}</Text><Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 4 }}>{event.start_time ? new Date(event.start_time).toLocaleString() : 'Time to be announced'}{event.venue_name ? ` · ${event.venue_name}` : ''}</Text></View><Text style={{ color: ui.colors.primary, fontSize: 10, fontWeight: '700' }}>{event.participant_count} participants</Text></View>)}</View>}
          </CardContent>
        </Card>

        <Card style={{ borderRadius: 18, borderColor: ui.colors.border, shadowColor: ui.shadow.shadowColor, shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}>
          <CardContent style={{ padding: 20 }}>
            <SectionHeader icon={Trophy} title="Latest Results" description="Track your team&apos;s performance and achievements." action="View all results" onPress={() => goTo('/team/results')} />
            {latestResults.length === 0 ? <EmptyState icon={Trophy} title="No published results yet" text="Results will be published once available." /> : <View style={{ gap: 8 }}>{latestResults.map((result) => <View key={result.result_id} style={{ padding: 11, borderRadius: 11, backgroundColor: ui.colors.surfaceMuted, borderWidth: 1, borderColor: ui.colors.border, flexDirection: 'row', justifyContent: 'space-between' }}><View><Text style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>{result.item_name || result.item_code || 'Item'}</Text><Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 4 }}>{result.participant_name || 'Participant'}{result.grade ? ` · Grade ${result.grade}` : ''}</Text></View>{result.rank != null && <Text style={{ color: ui.colors.primary, fontSize: 15, fontWeight: '800' }}>#{result.rank}</Text>}</View>)}</View>}
          </CardContent>
        </Card>
      </View>
    </TeamLeaderAppShell>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: React.ComponentType<any>; title: string; text: string }) {
  return <View style={{ minHeight: 120, alignItems: 'center', justifyContent: 'center', paddingVertical: 18 }}><View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#E8F5F2', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}><Icon size={25} color="#71C9BD" /></View><Text style={{ color: ui.colors.text, fontSize: 14, fontWeight: '800' }}>{title}</Text><Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 4 }}>{text}</Text></View>;
}
