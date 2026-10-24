import { Modal } from '@/components/ui/CoreModal';
import { coreColor } from '@/constants/coreTheme';
import { supabase } from '@/core/config/supabase';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, RefreshCw, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

type ProgressRow = {
  festival_team_id: string;
  organisation_id: string;
  team_name: string;
  participant_count: number;
  assigned_participant_count: number;
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  assigned_count: number;
  is_completed: boolean;
};

type TeamProgress = {
  id: string;
  name: string;
  participantCount: number;
  assignedParticipantCount: number;
  programs: ProgressRow[];
  completedCount: number;
};

export function TeamProgramProgressModal({ festivalId, onClose }: { festivalId: string; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const isPhone = width < 600;
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const progress = useQuery({
    queryKey: ['admin-team-program-progress', festivalId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_team_program_progress', {
        p_festival_id: festivalId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProgressRow[];
    },
  });

  const teams = useMemo(() => {
    const byId = new Map<string, TeamProgress>();
    for (const row of progress.data ?? []) {
      let team = byId.get(row.festival_team_id);
      if (!team) {
        team = {
          id: row.festival_team_id,
          name: row.team_name,
          participantCount: Number(row.participant_count),
          assignedParticipantCount: Number(row.assigned_participant_count),
          programs: [],
          completedCount: 0,
        };
        byId.set(team.id, team);
      }
      if (row.item_id && Number(row.assigned_count) > 0) {
        team.programs.push(row);
        if (row.is_completed) team.completedCount += 1;
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [progress.data]);

  return <Modal visible transparent animationType={isPhone ? 'slide' : 'fade'} onRequestClose={onClose}>
    <View className="flex-1 items-center bg-core-surface-strong-black/40" style={{ justifyContent: isPhone ? 'flex-end' : 'center', padding: isPhone ? 0 : 16 }}>
      <View className="w-full bg-core-surface-white" style={{ width: isPhone ? width : Math.min(width - 32, 880), height: isPhone ? Math.max(0, height - 16) : Math.min(height - 32, 820), borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: isPhone ? 0 : 16, borderBottomRightRadius: isPhone ? 0 : 16 }}>
        <View className="flex-row items-center gap-2 border-b border-ui-border px-4 py-3">
          <View className="min-w-0 flex-1">
            <Text className="font-poppins-bold text-lg text-ui-text">Team progress</Text>
            <Text className="font-poppins text-xs text-ui-text-muted">Individual program assignments and Team Leader completion</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh team progress" onPress={() => progress.refetch()} className="min-h-11 min-w-11 items-center justify-center rounded-lg border border-ui-border">
            <RefreshCw size={17} color={coreColor('#475569', 'text')} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close team progress" onPress={onClose} className="min-h-11 min-w-11 items-center justify-center rounded-lg border border-ui-border">
            <X size={18} color={coreColor('#475569', 'text')} />
          </Pressable>
        </View>
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 28 }}>
          {progress.isLoading ? <ActivityIndicator color={coreColor('#047857', 'success')} style={{ marginTop: 30 }} /> : null}
          {progress.isError ? <View className="rounded-xl border border-core-danger-soft-red-200 bg-core-danger-soft-red-50 p-4">
            <Text accessibilityRole="alert" className="font-poppins text-sm text-core-danger-red-700">Could not load team progress: {(progress.error as Error).message}</Text>
            <Pressable accessibilityRole="button" onPress={() => progress.refetch()} className="mt-3 min-h-11 self-start justify-center rounded-lg border border-ui-border bg-core-surface-white px-4"><Text className="font-poppins-bold text-xs text-ui-text">Retry</Text></Pressable>
          </View> : null}
          {progress.isSuccess && teams.length === 0 ? <Text className="py-8 text-center font-poppins text-sm text-ui-text-muted">No active teams are available for this festival.</Text> : null}
          {teams.map(team => {
            const expanded = expandedTeamId === team.id;
            return <View key={team.id} className="rounded-xl border border-ui-border bg-core-surface-white">
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`View ${team.name} progress`} onPress={() => setExpandedTeamId(expanded ? null : team.id)} className="min-h-14 flex-row items-center gap-2 p-3">
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={2} className="font-poppins-bold text-sm text-ui-text">{team.name}</Text>
                  <Text className="mt-1 font-poppins text-xs text-ui-text-muted">{team.assignedParticipantCount} of {team.participantCount} participants assigned · {team.programs.length} programs with participants</Text>
                  <Text className="mt-1 font-poppins-bold text-xs text-core-success-emerald-800">{team.completedCount} completed</Text>
                </View>
                {expanded ? <ChevronUp size={18} color={coreColor('#475569', 'text')} /> : <ChevronDown size={18} color={coreColor('#475569', 'text')} />}
              </Pressable>
              {expanded ? <View className="border-t border-ui-border px-3 pb-3">
                {team.programs.length === 0 ? <Text className="py-4 font-poppins text-xs text-ui-text-muted">No individual program participants have been assigned yet.</Text> : team.programs.map(program =>
                  <View key={program.item_id} className="flex-row flex-wrap items-center gap-2 border-b border-ui-border py-3">
                    <View className="min-w-[150px] flex-1">
                      <Text className="font-poppins-bold text-xs text-ui-text">{program.item_name || program.item_code || 'Program'}</Text>
                      <Text className="font-poppins text-[11px] text-ui-text-muted">{program.item_code ? `${program.item_code} · ` : ''}{program.assigned_count} assigned</Text>
                    </View>
                    <View className={`rounded-full px-2 py-1 ${program.is_completed ? 'bg-core-success-soft-emerald-100' : 'bg-core-surface-muted-slate-100'}`}>
                      <Text className={`font-poppins-bold text-[11px] ${program.is_completed ? 'text-core-success-emerald-800' : 'text-ui-text-muted'}`}>{program.is_completed ? 'Completed' : 'Pending completion'}</Text>
                    </View>
                  </View>,
                )}
              </View> : null}
            </View>;
          })}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
