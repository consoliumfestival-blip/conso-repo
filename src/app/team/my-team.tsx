import { teamUi as ui } from '@/constants/teamLeaderTheme';
import React, { useEffect, useState } from 'react';
import { TeamText as Text } from '@/components/team/TeamText';
import { TeamPageHeading } from '@/components/team/TeamPageHeading';
import { View } from 'react-native';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderStanding } from '@/services/teamLeaderPortalService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/team/TeamCard';
import { Skeleton } from '@/components/team/TeamSkeleton';

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
  const teamPrimary = ui.colors.primary;
  const teamAccent = ui.colors.primary;

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <TeamPageHeading title="My Team" teamName={context?.team_name}
          subtitle="Track your team's position and points" />

        {/* Team Summary */}
        {ownTeam && (
          <Card style={{ borderTopWidth: 4, borderTopColor: teamPrimary }}>
            <CardContent style={{ padding: 18 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 12, color: ui.colors.textMuted }}>Your Team</Text>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: ui.colors.text, marginTop: 2 }}>
                    {ownTeam.team_name}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 12, color: ui.colors.textMuted }}>Rank</Text>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: teamPrimary }}>
                    #{ownRank}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
                <View>
                  <Text style={{ fontSize: 12, color: ui.colors.textMuted }}>Total Points</Text>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: ui.colors.text }}>{totalPoints}</Text>
                </View>
                {ownRank > 1 && (
                  <View>
                    <Text style={{ fontSize: 12, color: ui.colors.textMuted }}>Behind Rank 1</Text>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: ui.colors.danger }}>-{pointsBehind}</Text>
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
              <Text style={{ fontSize: 13, color: ui.colors.textMuted, textAlign: 'center', padding: 16 }}>
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
                      borderColor: team.is_own_team ? teamPrimary : ui.colors.border,
                      backgroundColor: team.is_own_team ? `${teamAccent}16` : ui.colors.surface,
                    }}
                  >
                    <View style={{ width: 32, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: team.is_own_team ? teamPrimary : ui.colors.text }}>
                        #{team.rank}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: team.is_own_team ? '700' : '500', color: ui.colors.text }}>
                        {team.team_name}
                        {team.is_own_team && (
                          <Text style={{ fontSize: 11, color: teamPrimary, marginLeft: 6 }}>Your Team</Text>
                        )}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: ui.colors.text }}>
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
