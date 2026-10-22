import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfInput } from '../../../components/ui/SsfInput';
import { useAuthStore } from '../../../core/store/authStore';
import { useFestival } from '../../../core/hooks/useFestival';
import { graceMarksService, GraceEntries, GraceWorkspace } from '../../../services/graceMarksService';

type Inputs = Record<string, Record<string, string>>;
export default function GraceMarksScreen() {
  const router = useRouter(), queryClient = useQueryClient();
  const { role, is_superadmin } = useAuthStore();
  const { useActiveFestival } = useFestival();
  const { data: festival, isLoading: festivalLoading } = useActiveFestival();
  const queryKey = ['grace-workspace', festival?.id];
  const query = useQuery({
    queryKey, queryFn: () => graceMarksService.getWorkspace(festival!.id), enabled: !!festival?.id,
    refetchOnWindowFocus: false,
  });
  const [local, setLocal] = useState<Inputs | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const workspace = query.data;
  const savedInputs: Inputs = Object.fromEntries(Object.entries(workspace?.entries ?? {}).map(([id, values]) =>
    [id, Object.fromEntries(Object.entries(values).map(([field, value]) => [field, String(value)]))]));
  const inputs = local ?? savedInputs;
  const teams = workspace?.teams ?? [], fields = workspace?.fields ?? [];
  const currentTeam = teams.find(team => team.id === selected) ?? teams[0];
  const isValid = (team: string, field: { id: string; max_marks: number }) => {
    const value = inputs[team]?.[field.id];
    return value !== undefined && value.trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0 && Number(value) <= field.max_marks;
  };
  const completeTeams = teams.filter(team => fields.length > 0 && fields.every(field => isValid(team.id, field))).length;
  const complete = teams.length > 0 && fields.length > 0 && completeTeams === teams.length;
  const alreadySubmitted = !local && workspace?.last_submission?.revision === workspace?.revision
    && workspace?.last_submission?.config_version === workspace?.config_version;
  const serialized = (): GraceEntries => {
    const entries: GraceEntries = {};
    teams.forEach(team => {
      fields.forEach(field => {
        const value = inputs[team.id]?.[field.id];
        if (value === undefined || value.trim() === '') return;
        if (!isValid(team.id, field)) throw new Error('Enter whole-number marks within the configured maximum.');
        entries[team.id] ??= {};
        entries[team.id][field.id] = Number(value);
      });
    });
    return entries;
  };
  const invalidateTotals = async () => {
    await queryClient.invalidateQueries({ predicate: q => Array.isArray(q.queryKey)
      && ['admin-leaderboard', 'public-leaderboard', 'leaderboard', 'leaderboard-preview', 'public-published-results', 'festival-results', 'team-standings', 'team-leader-standings', 'unitProfile'].includes(String(q.queryKey[0])) });
  };
  const save = async (finalize: boolean) => {
    if (!workspace || !festival) return;
    setWorking(true); setFailure(''); setMessage('');
    try {
      let next: GraceWorkspace = workspace;
      if (local || workspace.draft_config_version !== workspace.config_version) {
        next = await graceMarksService.saveDraft(festival.id, workspace.config_version, workspace.revision, serialized());
        queryClient.setQueryData(queryKey, next); setLocal(null);
      }
      if (finalize) {
        if (!complete) throw new Error('Complete all configured fields for every participating team.');
        await graceMarksService.submitAll(festival.id, next.config_version, next.revision);
        await query.refetch(); await invalidateTotals();
        setMessage('All teams submitted. Final grace points are now updated.');
      } else setMessage('Draft saved. Final points have not changed.');
    } catch (error) { setFailure(error instanceof Error ? error.message : 'Could not save grace marks.'); }
    finally { setWorking(false); }
  };
  if (festivalLoading || query.isLoading) return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  if (role !== 'admin' && !is_superadmin) return <View className="p-5"><Text>Administrator access is required.</Text></View>;
  if (query.error) return <View className="p-5"><Text className="font-poppins text-red-700">{query.error.message}</Text>
    <SsfButton label="Retry" onPress={() => query.refetch()} className="mt-3" />
    <SsfButton label="Points Configuration" variant="outline" onPress={() => router.push('/(admin)/settings/points' as any)} className="mt-3" /></View>;
  return <ScrollView className="flex-1 bg-ssf-bg p-4" contentContainerStyle={{ paddingBottom: 36 }}>
    <Text className="font-poppins-black text-2xl text-ui-text">Grace Marks</Text>
    <Text className="font-poppins text-xs text-ui-text-muted mt-1 mb-4">Draft entries reach final points only after All Submit.</Text>
    {!workspace?.enabled || !fields.length ? <SsfCard>
      <Text className="font-poppins text-ui-text mb-3">Enable grace marks and add fields with their maximum marks in Points Configuration.</Text>
      <SsfButton label="Points Configuration" variant="outline" onPress={() => router.push('/(admin)/settings/points' as any)} />
    </SsfCard> : <>
      <View className="flex-row flex-wrap gap-2 mb-4">{teams.map(team =>
        <TouchableOpacity key={team.id} onPress={() => setSelected(team.id)} accessibilityRole="button"
          accessibilityState={{ selected: currentTeam?.id === team.id }} className={'rounded-lg border px-3 py-2 ' + (currentTeam?.id === team.id ? 'bg-ui-primary border-ui-primary' : 'bg-white border-ui-border')}>
          <Text className={'font-poppins-bold text-xs ' + (currentTeam?.id === team.id ? 'text-white' : 'text-ui-text')}>{team.name}</Text>
        </TouchableOpacity>)}</View>
      {!teams.length && <Text className="font-poppins text-ui-text-muted mb-4">No participating teams are available.</Text>}
      {currentTeam && <SsfCard className="mb-4"><Text className="font-poppins-bold text-lg text-ui-text mb-4">{currentTeam.name}</Text>
        {fields.map(field => {
          const value = inputs[currentTeam.id]?.[field.id] ?? '';
          return <View key={field.id} className="flex-row flex-wrap items-center gap-3 mb-3">
            <View className="flex-1 min-w-[140px]"><Text className="font-poppins-bold text-sm text-ui-text">{field.name}</Text>
              <Text className="font-poppins text-xs text-ui-text-muted">Maximum: {field.max_marks}</Text></View>
            <SsfInput accessibilityLabel={currentTeam.name + ' ' + field.name} keyboardType="numeric" value={value}
              className="w-28 mb-0" style={{ minHeight: 40, minWidth: 0, width: 0 }}
              error={value.trim() !== '' && !isValid(currentTeam.id, field) ? 'Check maximum' : undefined}
              onChangeText={text => { setMessage(''); setLocal({ ...inputs, [currentTeam.id]: { ...inputs[currentTeam.id], [field.id]: text } }); }} />
          </View>;
        })}
      </SsfCard>}
      <SsfCard className="mb-4"><Text className="font-poppins-bold text-sm text-ui-text mb-3">Completion: {completeTeams}/{teams.length} teams</Text>
        {teams.map(team => <View key={team.id} className="flex-row justify-between gap-3 py-2 border-t border-ui-border">
          <Text className="font-poppins text-xs text-ui-text flex-1">{team.name}</Text>
          <Text className="font-poppins text-xs text-ui-text-muted">{fields.every(field => isValid(team.id, field))
            ? fields.reduce((total, field) => total + Number(inputs[team.id][field.id]), 0) + ' draft points' : 'Pending'}</Text>
        </View>)}
        {workspace.draft_config_version !== workspace.config_version && workspace.revision > 0 &&
          <Text className="font-poppins text-xs text-amber-800 mt-3">Configuration changed. Review the fields and save the draft again before submission.</Text>}
        {!!workspace.last_submission && <Text className="font-poppins text-xs text-ui-text-muted mt-3">Last final submission: {new Date(workspace.last_submission.created_at).toLocaleString()}</Text>}
      </SsfCard>
      {!!failure && <Text accessibilityRole="alert" className="font-poppins text-sm text-red-700 mb-3">{failure}</Text>}
      {!!message && <Text accessibilityRole="alert" className="font-poppins text-sm text-green-800 mb-3">{message}</Text>}
      <View className="flex-row flex-wrap gap-3">
        <SsfButton label="Save draft" variant="outline" onPress={() => save(false)} disabled={working || !local || !teams.length} />
        <SsfButton label={alreadySubmitted ? 'All submitted' : 'All Submit'} onPress={() => save(true)}
          disabled={working || !complete || alreadySubmitted} isLoading={working} />
      </View>
    </>}
  </ScrollView>;
}
