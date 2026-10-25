import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import React, { useEffect, useState } from 'react';
import { TeamText as Text } from '@/components/team/TeamText';
import { TeamPageHeading } from '@/components/team/TeamPageHeading';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Download, ExternalLink, X } from 'lucide-react-native';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { useAuthStore } from '@/core/store/authStore';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderParticipant } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/team/TeamCard';
import { Badge } from '@/components/team/TeamBadge';
import { Skeleton } from '@/components/team/TeamSkeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/team/TeamTabs';
import { ParticipantExportModal, ParticipantExportKind } from '@/components/participants/ParticipantExportModal';
import { downloadItemVerificationPdf, downloadParticipantsCsv, downloadTeamItemParticipantsPdf, downloadTeamParticipantSlipsPdf, ExportAssignment, ExportItem, ExportParticipant, ExportSort, TeamLeaderParticipantExportRow } from '@/services/participantExportService';

export default function ParticipantsScreen() {
  const ui = useTeamUi();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const tenantId = useAuthStore((state) => state.tenant_id);
  const userId = useAuthStore((state) => state.user?.id);
  const [participants, setParticipants] = useState<TeamLeaderParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [selectedParticipant, setSelectedParticipant] = useState<TeamLeaderParticipant | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportRows, setExportRows] = useState<TeamLeaderParticipantExportRow[]>([]);
  const [exportKind, setExportKind] = useState<ParticipantExportKind>('item_verification');
  const [exportItemId, setExportItemId] = useState('');
  const [exportSort, setExportSort] = useState<ExportSort>('chest');
  const [exporting, setExporting] = useState(false);
  const participantProgramsQuery = useQuery({
    queryKey: ['team-leader-participant-programs', context?.festival_id, context?.assignment_id, context?.parent_tenant_id, context?.festival_team_id, context?.organisation_id, tenantId, userId, selectedParticipant?.id],
    enabled: !!context && !!userId && !!selectedParticipant,
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
  const exportParticipants: ExportParticipant[] = Array.from(new Map(exportRows.map((row) => [row.participant_id, {
    id: row.participant_id, name: row.participant_name, gender: row.gender,
    category_code: row.category_code, chest_number: row.chest_number,
    status: row.participant_status, organisation_id: row.organisation_id,
    organisation_name: row.team_name,
  }])).values());
  const exportItems: ExportItem[] = Array.from(new Map(exportRows.filter((row) => row.item_id).map((row) => [row.item_id!, {
    id: row.item_id!, item_code: row.item_code, item_name_en: row.item_name_en,
    item_name_ml: row.item_name_ml, category_codes: row.item_category_codes,
    participation_type: row.participation_type,
  }])).values());
  const exportAssignments: ExportAssignment[] = exportRows.filter((row) => row.item_id && row.registration_id).map((row) => ({
    registration_id: row.registration_id, participant_id: row.participant_id,
    item_id: row.item_id!, entry_kind: row.entry_kind,
    registration_status: row.registration_status, is_verified: row.is_verified,
    organisation_id: row.organisation_id, organisation_name: row.team_name,
  }));
  const openExport = async () => {
    setExportOpen(true);
    setExportLoading(true);
    setExportError(null);
    try {
      const rows = await teamLeaderPortalService.getParticipantExportRows();
      setExportRows(rows);
      const firstItemId = rows.find((row) => row.item_id)?.item_id;
      if (!exportItemId && firstItemId) setExportItemId(firstItemId);
    } catch (error: any) {
      setExportError(error?.message || 'Unable to load the team report data.');
    } finally {
      setExportLoading(false);
    }
  };
  const runExport = async () => {
    try {
      setExporting(true);
      if (exportKind === 'csv') {
        await downloadParticipantsCsv(participants.map((participant) => ({
          id: participant.id, name: participant.name, chest_number: participant.chest_number,
          organisation_id: participant.organisation_id, organisation_name: context?.team_name,
          category_code: participant.category_code, gender: participant.gender, status: participant.status,
        })));
      } else if (!context?.organisation_id) {
        throw new Error('The assigned team is unavailable. Please sign in again and retry.');
      } else if (exportKind === 'slips') {
        downloadTeamParticipantSlipsPdf({ teamName: context.team_name || 'Team', participants: exportParticipants, items: exportItems, assignments: exportAssignments });
      } else if (exportKind === 'team_items') {
        downloadTeamItemParticipantsPdf({ teamName: context.team_name || 'Team', teamId: context.organisation_id, participants: exportParticipants, items: exportItems, assignments: exportAssignments });
      } else {
        const item = exportItems.find((candidate) => candidate.id === exportItemId);
        if (!item) throw new Error('Select an item to export.');
        downloadItemVerificationPdf({ festivalName: context.festival_name, item, participants: exportParticipants, assignments: exportAssignments, sortBy: exportSort, teamId: context.organisation_id });
      }
      setExportOpen(false);
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(error?.message || 'Unable to create the export.');
      else Alert.alert('Export unavailable', error?.message || 'Unable to create the export.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <TeamPageHeading title="Participants" teamName={context?.team_name}
          subtitle={`${participants.length} registered participant${participants.length === 1 ? '' : 's'} in your team`}
          actions={<Pressable accessibilityRole="button" accessibilityLabel="Export participants" onPress={openExport} style={{ minHeight: 40, paddingHorizontal: 13, borderRadius: 8, borderWidth: 1, borderColor: ui.colors.primary, backgroundColor: ui.colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Download size={15} color={ui.colors.onPrimary} /><Text style={{ color: ui.colors.onPrimary, fontSize: 12, fontWeight: '700' }}>Export</Text></Pressable>} />

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
      <ParticipantExportModal
        visible={exportOpen}
        isTeamPortal
        colors={{ overlay: ui.colors.overlay, surface: ui.colors.surface, text: ui.colors.text, muted: ui.colors.textMuted, border: ui.colors.border, primary: ui.colors.primary, onPrimary: ui.colors.onPrimary, selected: ui.colors.surfaceMuted }}
        teams={[]}
        items={exportItems.map((item) => ({ id: item.id, label: item.item_code ? `${item.item_code} · ${item.item_name_en || item.item_name_ml || 'Unnamed item'}` : item.item_name_en || item.item_name_ml || 'Unnamed item' }))}
        selectedKind={exportKind}
        selectedTeamId=""
        selectedItemId={exportItemId}
        sortBy={exportSort}
        busy={exporting}
        loadingOptions={exportLoading}
        errorMessage={exportError}
        onKindChange={setExportKind}
        onTeamChange={() => undefined}
        onItemChange={setExportItemId}
        onSortChange={setExportSort}
        onClose={() => setExportOpen(false)}
        onDownload={runExport}
      />
    </TeamLeaderAppShell>
  );
}
