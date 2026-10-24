import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import React, { useEffect, useState } from 'react';
import { TeamText as Text } from '@/components/team/TeamText';
import { TeamPageHeading } from '@/components/team/TeamPageHeading';
import { ActivityIndicator, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ExternalLink, X } from 'lucide-react-native';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderParticipant } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/team/TeamCard';
import { Badge } from '@/components/team/TeamBadge';
import { Skeleton } from '@/components/team/TeamSkeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/team/TeamTabs';

export default function ParticipantsScreen() {
  const ui = useTeamUi();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [participants, setParticipants] = useState<TeamLeaderParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [selectedParticipant, setSelectedParticipant] = useState<TeamLeaderParticipant | null>(null);
  const participantProgramsQuery = useQuery({
    queryKey: ['team-leader-participant-programs', context?.festival_id, selectedParticipant?.id],
    enabled: !!context && !!selectedParticipant,
    queryFn: () => teamLeaderPortalService.getProgramsForParticipant(selectedParticipant!.id),
    staleTime: 0,
    refetchOnMount: 'always',
  });

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
            <Text style={{ fontSize: 15, fontWeight: '700', color: ui.colors.text }}>Unable to load participants</Text>
            <Text style={{ fontSize: 13, color: ui.colors.textMuted, marginTop: 8, textAlign: 'center' }}>{loadError}</Text>
          </CardContent>
        </Card>
      </TeamLeaderAppShell>
    );
  }

  const filtered = filter === 'all' ? participants : participants.filter((p) => {
    if (filter === 'active') return p.status === 'active' || p.status === 'registered' || p.status === 'approved';
    if (filter === 'inactive') return p.status !== 'active' && p.status !== 'registered' && p.status !== 'approved';
    return true;
  });
  const isPhone = width < 600;
  const detailRows: [string, string][] = selectedParticipant ? [
    ['Chest number', selectedParticipant.chest_number ? `#${selectedParticipant.chest_number}` : 'Not provided'],
    ['Category', selectedParticipant.category_code || 'Not provided'],
    ['Gender', selectedParticipant.gender || 'Not provided'],
    ['Status', selectedParticipant.status || 'Not provided'],
  ] : [];

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <TeamPageHeading title="Participants" teamName={context?.team_name}
          subtitle={`${participants.length} registered participant${participants.length === 1 ? '' : 's'} in your team`} />

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
                  <Text style={{ fontSize: 13, color: ui.colors.textMuted }}>No participants found</Text>
                </CardContent>
              </Card>
            ) : (
              <View style={{ gap: 8 }}>
                {filtered.map((p) => (
                  <Card key={p.id}>
                      <CardContent style={{ padding: 0 }}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`View details for ${p.name || 'participant'}`}
                          onPress={() => setSelectedParticipant(p)}
                          style={{ padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: ui.colors.text }}>
                              {p.name || 'Participant'}
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                              {p.category_code && <Badge variant="outline">{p.category_code}</Badge>}
                              {p.chest_number && <Badge variant="info">Chest #{p.chest_number}</Badge>}
                            </View>
                          </View>
                          {p.status && p.status !== 'approved' ? <Badge variant={p.status === 'rejected' ? 'destructive' : p.status === 'active' || p.status === 'registered' ? 'success' : 'warning'}>{p.status}</Badge> : null}
                        </Pressable>
                      </CardContent>
                  </Card>
                ))}
              </View>
            )}
          </TabsContent>
        </Tabs>
      </View>
      <Modal visible={!!selectedParticipant} transparent animationType="slide" onRequestClose={() => setSelectedParticipant(null)}>
        <Pressable
          onPress={() => setSelectedParticipant(null)}
          style={{ flex: 1, justifyContent: isPhone ? 'flex-end' : 'center', padding: isPhone ? 0 : 20, backgroundColor: ui.colors.overlay }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, maxHeight: '88%', alignSelf: 'center', padding: 18, borderTopLeftRadius: isPhone ? 22 : 18, borderTopRightRadius: isPhone ? 22 : 18, borderBottomLeftRadius: isPhone ? 0 : 18, borderBottomRightRadius: isPhone ? 0 : 18, backgroundColor: ui.colors.surface }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: ui.colors.text }}>Participant details</Text>
                <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: '700', color: ui.colors.text, marginTop: 5 }}>{selectedParticipant?.name || 'Participant'}</Text>
                <Text style={{ fontSize: 11, color: ui.colors.textMuted, marginTop: 3 }}>{context?.team_name || 'Your team'}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close participant details" onPress={() => setSelectedParticipant(null)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <X size={19} color={ui.colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={{ flexGrow: 0, maxHeight: Math.min(height * 0.62, 520) }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {detailRows.map(([label, value]) => (
                <View key={label} style={{ minHeight: 46, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 10, backgroundColor: ui.colors.surface }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: ui.colors.textMuted }}>{label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: ui.colors.text, marginTop: 3 }}>{value}</Text>
                </View>
              ))}
              <Text style={{ fontSize: 13, fontWeight: '800', color: ui.colors.text, marginTop: 8 }}>
                Competitions ({participantProgramsQuery.data?.length ?? 0})
              </Text>
              {participantProgramsQuery.isLoading ? (
                <View style={{ minHeight: 64, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color={ui.colors.primary} />
                </View>
              ) : participantProgramsQuery.isError ? (
                <Text accessibilityRole="alert" style={{ fontSize: 12, color: ui.colors.danger }}>
                  Unable to load this participant’s competitions. Close and reopen the details to try again.
                </Text>
              ) : participantProgramsQuery.data?.length ? (
                participantProgramsQuery.data.map((program) => (
                  <View key={`${program.item_id}-${program.entry_kind}`} style={{ paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 10, backgroundColor: ui.colors.surface }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: ui.colors.text }}>
                      {program.item_name_en || program.item_name_ml || program.item_code || 'Competition'}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {program.item_code ? <Badge variant="outline">{program.item_code}</Badge> : null}
                      <Badge variant="info">{program.participation_type?.toLowerCase() === 'group' ? 'Group' : 'Individual'}</Badge>
                      {program.category_codes?.map((category) => <Badge key={category} variant="outline">{category}</Badge>)}
                      {program.registration_status ? <Badge variant={program.registration_status === 'approved' ? 'success' : 'warning'}>{program.registration_status}</Badge> : null}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={{ fontSize: 12, color: ui.colors.textMuted }}>No current competition registrations.</Text>
              )}
            </ScrollView>
            {selectedParticipant?.profile_slug ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  const profileSlug = selectedParticipant.profile_slug;
                  setSelectedParticipant(null);
                  router.push(`/candidate/${profileSlug}` as any);
                }}
                style={{ minHeight: 44, marginTop: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <ExternalLink size={15} color={ui.colors.text} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: ui.colors.text }}>Open public profile</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </TeamLeaderAppShell>
  );
}
