import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderPublishedResult } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/shadcn/tabs';
import { TeamLeaderDataError } from '@/components/team/TeamLeaderDataError';

export default function ResultsScreen() {
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [results, setResults] = useState<TeamLeaderPublishedResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!context) return;
    setLoadError(null);
    setLoading(true);
    teamLeaderPortalService.getPublishedResults().then((data) => {
      setResults(data);
      setLoading(false);
    }).catch((error: any) => { setLoadError(error?.message || 'Please retry the results request.'); setLoading(false); });
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

  const filtered = filter === 'all' ? results : results.filter((r) => {
    if (filter === 'medal') return r.rank != null && r.rank <= 3;
    return true;
  });
  const teamPrimary = context?.portal_primary_color || '#0F766E';
  const teamAccent = context?.portal_accent_color || '#14B8A6';

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <View style={{ padding: 18, borderRadius: 16, backgroundColor: `${teamAccent}12`, borderWidth: 1, borderColor: `${teamAccent}45`, borderLeftWidth: 4, borderLeftColor: teamPrimary }}>
          <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', color: teamPrimary }}>Performance</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: 'hsl(var(--foreground))', marginTop: 4 }}>Results</Text>
          <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 3 }}>
            {results.length} published result{results.length === 1 ? '' : 's'} for your team
          </Text>
        </View>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="medal">Medal Positions</TabsTrigger>
          </TabsList>

          <TabsContent value={filter}>
            {filtered.length === 0 ? (
              <Card>
                <CardContent style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>No results to display</Text>
                </CardContent>
              </Card>
            ) : (
              <View style={{ gap: 8 }}>
                {filtered.map((result) => (
                  <Card key={result.result_id}>
                    <CardContent style={{ padding: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: 'hsl(var(--foreground))' }}>
                            {result.item_name || result.item_code || 'Item'}
                          </Text>
                          <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
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
