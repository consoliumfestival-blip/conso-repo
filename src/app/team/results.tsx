import { useTeamReadQuery } from '@/core/hooks/useTeamReadQuery';
import { TeamReadStatus } from '@/components/team/TeamReadStatus';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import React, { useState } from 'react';
import { TeamText as Text } from '@/components/team/TeamText';
import { TeamPageHeading } from '@/components/team/TeamPageHeading';
import { View } from 'react-native';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/team/TeamCard';
import { Badge } from '@/components/team/TeamBadge';
import { Skeleton } from '@/components/team/TeamSkeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/team/TeamTabs';
import { TeamLeaderDataError } from '@/components/team/TeamLeaderDataError';

export default function ResultsScreen() {
  const ui = useTeamUi();
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const resultsQuery = useTeamReadQuery('results', teamLeaderPortalService.getPublishedResults);
  const results = resultsQuery.data ?? [];
  const loading = resultsQuery.isLoading;
  const [filter, setFilter] = useState('all');

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
  if (!context || !resultsQuery.data) return <TeamLeaderAppShell><TeamLeaderDataError message={!context ? 'Team details are unavailable.' : (resultsQuery.error as Error)?.message || 'Unable to load results.'} onRetry={() => void resultsQuery.retry()} /></TeamLeaderAppShell>;

  const filtered = filter === 'all' ? results : results.filter((r) => {
    if (filter === 'medal') return r.rank != null && r.rank <= 3;
    return true;
  });
  return (
    <TeamLeaderAppShell>
      <TeamReadStatus fetching={resultsQuery.isFetching} error={resultsQuery.error} onRefresh={() => void resultsQuery.refetch()} />
      <View style={{ gap: 16 }}>
        <TeamPageHeading title="Results" teamName={context?.team_name}
          subtitle={`${results.length} published result${results.length === 1 ? '' : 's'} for your team`} />

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="medal">Medal Positions</TabsTrigger>
          </TabsList>

          <TabsContent value={filter}>
            {filtered.length === 0 ? (
              <Card>
                <CardContent style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: ui.colors.textMuted }}>Public results will appear here when they are released.</Text>
                </CardContent>
              </Card>
            ) : (
              <View style={{ gap: 8 }}>
                {filtered.map((result) => (
                  <Card key={result.result_id}>
                    <CardContent style={{ padding: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: ui.colors.text }}>
                            {result.item_name || result.item_code || 'Item'}
                          </Text>
                          <Text style={{ fontSize: 12, color: ui.colors.textMuted, marginTop: 2 }}>
                            {result.participant_name || 'Participant'}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                            {result.rank != null && (
                              <Badge variant={result.rank <= 3 ? 'success' : 'outline'}>
                                #{result.rank}
                              </Badge>
                            )}
                            {result.grade && (
                              <Badge variant="outline">Grade: {result.grade}</Badge>
                            )}
                            {result.points_awarded != null && (
                              <Badge variant="info">{result.points_awarded} pts</Badge>
                            )}
                          </View>
                        </View>
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
