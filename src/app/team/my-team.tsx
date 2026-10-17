import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderStanding } from '@/services/teamLeaderPortalService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Skeleton } from '@/components/ui/shadcn/skeleton';

export default function MyTeamScreen() {
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [standings, setStandings] = useState<TeamLeaderStanding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!context) return;
    teamLeaderPortalService.getStandings().then((data) => {
      setStandings(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [context]);

  if (contextLoading || loading) {
    return (
      <TeamLeaderAppShell>
        <View style={{ gap: 12 }}>
          <Skeleton style={{ height: 100, borderRadius: 12 }} />
          <Skeleton style={{ height: 200, borderRadius: 12 }} />
        </View>
      </TeamLeaderAppShell>
    );
  }

  const ownTeam = standings.find((s) => s.is_own_team);
  const ownRank = ownTeam?.rank ?? 0;
  const totalPoints = ownTeam?.total_points ?? 0;
  const pointsBehind = standings.length > 0 ? standings[0].total_points - totalPoints : 0;
  const teamPrimary = context?.portal_primary_color || '#0F766E';
  const teamAccent = context?.portal_accent_color || '#14B8A6';

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <View style={{ padding: 18, borderRadius: 16, backgroundColor: `${teamAccent}12`, borderWidth: 1, borderColor: `${teamAccent}45`, borderLeftWidth: 4, borderLeftColor: teamPrimary }}>
          <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', color: teamPrimary }}>Leaderboard</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: 'hsl(var(--foreground))', marginTop: 4 }}>My Team</Text>
          <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 3 }}>
            Track your team&apos;s position and points
          </Text>
        </View>

        {/* Team Summary */}
        {ownTeam && (
          <Card style={{ borderTopWidth: 4, borderTopColor: teamPrimary }}>
            <CardContent style={{ padding: 18 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Your Team</Text>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: 'hsl(var(--foreground))', marginTop: 2 }}>
                    {ownTeam.team_name}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Rank</Text>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: teamPrimary }}>
                    #{ownRank}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
                <View>
                  <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Total Points</Text>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: 'hsl(var(--foreground))' }}>{totalPoints}</Text>
                </View>
                {ownRank > 1 && (
                  <View>
                    <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Behind Rank 1</Text>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: 'hsl(var(--destructive))' }}>-{pointsBehind}</Text>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>
        )}

        {/* All Standings */}
        <Card>
          <CardHeader>
            <CardTitle>Festival Standings</CardTitle>
          </CardHeader>
          <CardContent>
            {standings.length === 0 ? (
              <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', textAlign: 'center', padding: 16 }}>
                No standings available
              </Text>
            ) : (
              <View style={{ gap: 4 }}>
                {standings.map((team) => (
                  <View
                    key={team.organisation_id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: team.is_own_team ? teamPrimary : 'hsl(var(--border))',
                      backgroundColor: team.is_own_team ? `${teamAccent}16` : 'hsl(var(--card))',
                    }}
                  >
                    <View style={{ width: 32, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: team.is_own_team ? teamPrimary : 'hsl(var(--foreground))' }}>
                        #{team.rank}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: team.is_own_team ? '700' : '500', color: 'hsl(var(--foreground))' }}>
                        {team.team_name}
                        {team.is_own_team && (
                          <Text style={{ fontSize: 11, color: teamPrimary, marginLeft: 6 }}>Your Team</Text>
                        )}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: 'hsl(var(--foreground))' }}>
                      {team.total_points}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </CardContent>
        </Card>
      </View>
    </TeamLeaderAppShell>
  );
}
