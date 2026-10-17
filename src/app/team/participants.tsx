import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderParticipant } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/shadcn/tabs';

export default function ParticipantsScreen() {
  const router = useRouter();
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [participants, setParticipants] = useState<TeamLeaderParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (contextLoading) return;
    if (!context) {
      setParticipants([]);
      setLoadError('Team details are unavailable for this account. Please sign in again or contact the festival administrator.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('The participant list took too long to load.')), 15000);
    });

    Promise.race([teamLeaderPortalService.getParticipants(), timeout])
      .then((data) => {
        if (cancelled) return;
        setParticipants(data as TeamLeaderParticipant[]);
      })
      .catch((error: any) => {
        if (cancelled) return;
        setParticipants([]);
        setLoadError(error?.message || 'Unable to load participants.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [context, contextLoading]);

  if (contextLoading || loading) {
    return (
      <TeamLeaderAppShell>
        <View style={{ gap: 12 }}>
          <Skeleton style={{ height: 40, borderRadius: 8 }} />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} style={{ height: 60, borderRadius: 12 }} />
          ))}
        </View>
      </TeamLeaderAppShell>
    );
  }

  if (loadError) {
    return (
      <TeamLeaderAppShell>
        <Card>
          <CardContent style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: 'hsl(var(--foreground))' }}>Unable to load participants</Text>
            <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 8, textAlign: 'center' }}>{loadError}</Text>
          </CardContent>
        </Card>
      </TeamLeaderAppShell>
    );
  }

  const filtered = filter === 'all' ? participants : participants.filter((p) => {
    if (filter === 'active') return p.status === 'active' || p.status === 'registered';
    if (filter === 'inactive') return p.status !== 'active' && p.status !== 'registered';
    return true;
  });
  const teamPrimary = context?.portal_primary_color || '#0F766E';
  const teamAccent = context?.portal_accent_color || '#14B8A6';

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <View style={{ padding: 18, borderRadius: 16, backgroundColor: `${teamAccent}12`, borderWidth: 1, borderColor: `${teamAccent}45`, borderLeftWidth: 4, borderLeftColor: teamPrimary }}>
          <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', color: teamPrimary }}>Roster</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: 'hsl(var(--foreground))', marginTop: 4 }}>Participants</Text>
          <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 3 }}>
            {participants.length} registered participant{participants.length === 1 ? '' : 's'} in your team
          </Text>
        </View>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All ({participants.length})</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="inactive">Inactive</TabsTrigger>
          </TabsList>

          <TabsContent value={filter}>
            {filtered.length === 0 ? (
              <Card>
                <CardContent style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>No participants found</Text>
                </CardContent>
              </Card>
            ) : (
              <View style={{ gap: 8 }}>
                {filtered.map((p) => (
                  <Card key={p.id}>
                    <CardContent style={{ padding: 12 }}>
                      <TouchableOpacity
                        accessible={!!p.profile_slug}
                        accessibilityRole={p.profile_slug ? 'button' : undefined}
                        accessibilityLabel={p.profile_slug ? `Open ${p.name || 'participant'} candidate profile` : undefined}
                        onPress={p.profile_slug ? () => router.push(`/candidate/${p.profile_slug}` as any) : undefined}
                        disabled={!p.profile_slug}
                        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: 'hsl(var(--foreground))' }}>
                            {p.name || 'Participant'}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                            {p.category_code && (
                              <Badge variant="outline">{p.category_code}</Badge>
                            )}
                            {p.gender && (
                              <Badge variant="secondary">{p.gender}</Badge>
                            )}
                            {p.chest_number && (
                              <Badge variant="info">Chest #{p.chest_number}</Badge>
                            )}
                          </View>
                        </View>
                        <Badge variant={p.status === 'active' || p.status === 'registered' ? 'success' : 'secondary'}>
                          {p.status || 'N/A'}
                        </Badge>
                      </TouchableOpacity>
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
