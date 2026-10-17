import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { judgeService } from '../../services/judgeService';
import { useFestival } from './useFestival';
import { supabase } from '@/core/config/supabase';

export const useJudges = () => {
  const queryClient = useQueryClient();
  const { tenant_id } = useAuthStore();
  const { useActiveFestival } = useFestival();
  const { data: festival } = useActiveFestival();

  // ── List all judges for this tenant ──────────────────────────────────────────
  const judges = useQuery({
    queryKey: ['judges', tenant_id],
    queryFn: () => judgeService.listJudges<any>(tenant_id!),
    enabled: !!tenant_id,
  });

  // ── Create judge ──────────────────────────────────────────────────────────────
  const createJudge = useMutation({
    mutationFn: (payload: { name: string; phone?: string; specialization?: string[] }) =>
      judgeService.createJudge<any>(tenant_id!, festival?.id!, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['judges', tenant_id] }),
  });

  // ── Update judge ──────────────────────────────────────────────────────────────
  const updateJudge = useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      judgeService.updateJudge<any>(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['judges', tenant_id] }),
  });

  // ── Delete judge ──────────────────────────────────────────────────────────────
  const deleteJudge = useMutation({
    mutationFn: (id: string) => judgeService.deleteJudge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['judges', tenant_id] }),
  });

  const useJudgeActivityLogs = () => useQuery({
    queryKey: ['judgeActivityLogs', tenant_id],
    queryFn: () => judgeService.listJudgeActivityLogs<any>(tenant_id!),
    enabled: !!tenant_id,
  });

  // ── Assign judges to a schedule ───────────────────────────────────────────────
  const assignJudges = useMutation({
    mutationFn: ({ scheduleId, judgeIds }: { scheduleId: string; judgeIds: string[] }) =>
      judgeService.assignJudgesToSchedule(scheduleId, judgeIds),
    onSuccess: (_, { scheduleId }) => {
      queryClient.invalidateQueries({ queryKey: ['scheduleJudges', scheduleId] });
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });

  const removeJudgeFromSchedule = useMutation({
    mutationFn: ({
      scheduleId,
      judgeId,
      force = false,
    }: {
      scheduleId: string;
      judgeId: string;
      force?: boolean;
    }) => judgeService.removeJudgeFromSchedule(scheduleId, judgeId, force),
    onSuccess: (_, { scheduleId }) => {
      queryClient.invalidateQueries({ queryKey: ['scheduleJudges', scheduleId] });
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['markEntries', scheduleId] });
      queryClient.invalidateQueries({ queryKey: ['judgeManagementStatus'] });
    },
  });

  // ── Judges assigned to a specific schedule ────────────────────────────────────
  const useScheduleJudges = (scheduleId: string | undefined) => useQuery({
    queryKey: ['scheduleJudges', scheduleId],
    queryFn: () => judgeService.getScheduleJudges<any>(scheduleId!),
    enabled: !!scheduleId,
  });

  // ── Registrations for a schedule (for mark entry) ─────────────────────────────
  const useScheduleRegistrations = (scheduleId: string | undefined) => useQuery({
    queryKey: ['scheduleRegistrations', scheduleId],
    queryFn: () => judgeService.getRegistrationsBySchedule<any>(scheduleId!),
    enabled: !!scheduleId,
  });

  // ── Mark entries for a schedule ───────────────────────────────────────────────
  const useMarkEntries = (scheduleId: string | undefined) => useQuery({
    queryKey: ['markEntries', scheduleId],
    queryFn: () => judgeService.listMarkEntries<any>(scheduleId!),
    enabled: !!scheduleId,
  });

  // ── Save (draft) mark entry ───────────────────────────────────────────────────
  const saveMarkEntry = useMutation({
    mutationFn: (payload: {
      schedule_id: string;
      judge_id: string;
      registration_id: string;
      criteria_scores: Record<string, number>;
      total_mark: number;
      is_draft?: boolean;
    }) => judgeService.saveMarkEntry<any>({ ...payload, tenant_id: tenant_id! }),
    onSuccess: (_, { schedule_id }) =>
      queryClient.invalidateQueries({ queryKey: ['markEntries', schedule_id] }),
  });

  // ── Finalize mark entry ───────────────────────────────────────────────────────
  const finalizeMarkEntry = useMutation({
    mutationFn: (markEntryId: string) => judgeService.finalizeMarkEntry(markEntryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['markEntries'] }),
  });

  // ── Unlock judge marks ────────────────────────────────────────────────────────
  const unlockJudgeMarks = useMutation({
    mutationFn: ({ scheduleId, judgeId }: { scheduleId: string; judgeId: string }) => 
      judgeService.unlockJudgeMarks(scheduleId, judgeId),
    onSuccess: (_, { scheduleId }) => {
      queryClient.invalidateQueries({ queryKey: ['markEntries', scheduleId] });
      queryClient.invalidateQueries({ queryKey: ['judgeSubmissionSummary', scheduleId] });
      queryClient.invalidateQueries({ queryKey: ['results', scheduleId] });
    },
  });

  const unlockScheduleMarks = useMutation({
      onError: (err: any) => {
        window.alert("Error unlocking marks: " + err.message);
      },
    mutationFn: (scheduleId: string) => judgeService.unlockScheduleMarks(scheduleId),
    onSuccess: (_, scheduleId) => {
      queryClient.invalidateQueries({ queryKey: ['markEntries', scheduleId] });
      queryClient.invalidateQueries({ queryKey: ['judgeSubmissionSummary', scheduleId] });
      queryClient.invalidateQueries({ queryKey: ['results', scheduleId] });
    },
  });

  // ── Results ───────────────────────────────────────────────────────────────────
  const useResults = (scheduleId: string | undefined) => useQuery({
    queryKey: ['results', scheduleId],
    queryFn: () => judgeService.listResults<any>(scheduleId!),
    enabled: !!scheduleId,
  });

  const publishResults = useMutation({
    mutationFn: (payloads: Record<string, unknown>[]) => judgeService.publishResults(payloads),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['scheduleReadiness'] });
      queryClient.invalidateQueries({ queryKey: ['judgeSubmissionSummary'] });
      queryClient.invalidateQueries({ queryKey: ['festival-results'] });
      queryClient.invalidateQueries({ queryKey: ['public-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['public-published-results'] });
    },
  });

  // ── Judge submission summary (per-judge status for a schedule) ────────────────
  const useJudgeSubmissionSummary = (scheduleId: string | undefined) => useQuery({
    queryKey: ['judgeSubmissionSummary', scheduleId],
    queryFn: () => judgeService.getJudgeSubmissionSummary<any>(scheduleId!),
    enabled: !!scheduleId,
    refetchInterval: 30000, // auto-refresh every 30s
  });

  // ── Schedule readiness per-participant ────────────────────────────────────────
  const useScheduleReadiness = (scheduleId: string | undefined) => useQuery({
    queryKey: ['scheduleReadiness', scheduleId],
    queryFn: () => judgeService.getScheduleReadiness<any>(scheduleId!),
    enabled: !!scheduleId,
    refetchInterval: 30000,
  });

  
  // Admin manual mark override
      // Admin manual mark override
    const adminUpsertMark = useMutation({
      mutationFn: async ({ scheduleId, judgeId, registrationId, criteriaScores, totalMark, maxMark, criteriaSnapshot, status }: { scheduleId: string, judgeId: string, registrationId: string, criteriaScores: any, totalMark: number, maxMark: number, criteriaSnapshot: any, status: string }) => {
        const { data: schedule } = await supabase.from('schedules').select('tenant_id').eq('id', scheduleId).single();
        const { data, error } = await supabase.from('mark_entries').upsert({
          schedule_id: scheduleId,
          judge_id: judgeId,
          registration_id: registrationId,
          tenant_id: schedule?.tenant_id,
          criteria_scores: criteriaScores,
          total_mark: totalMark,
          max_mark_snapshot: maxMark,
          criteria_snapshot: criteriaSnapshot,
          entry_mode_snapshot: Object.keys(criteriaScores || {}).length > 0 ? 'criteria' : 'total_only',
          is_draft: status === 'draft',
          is_final: status === 'final',
          submitted_at: status === 'final' ? new Date().toISOString() : null,
        }, { onConflict: 'schedule_id,judge_id,registration_id' }).select().single();
        if (error) throw error;
        return data;
      },
      onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['results', variables.scheduleId] });
      queryClient.invalidateQueries({ queryKey: ['registrations', variables.scheduleId] });
      queryClient.invalidateQueries({ queryKey: ['judges', variables.scheduleId] });
        queryClient.invalidateQueries({ queryKey: ['markEntries', variables.scheduleId] });
        queryClient.invalidateQueries({ queryKey: ['judgeSubmissionSummary', variables.scheduleId] });
    }
  });
  return {
    adminUpsertMark: adminUpsertMark.mutateAsync,
    judges: judges.data ?? [],
    isLoadingJudges: judges.isLoading,
    createJudge,
    updateJudge,
    deleteJudge,
    useJudgeActivityLogs,
    assignJudges,
    removeJudgeFromSchedule,
    useScheduleJudges,
    useScheduleRegistrations,
    useMarkEntries,
    saveMarkEntry,
    finalizeMarkEntry,
    unlockJudgeMarks,
    unlockScheduleMarks,
    useResults,
    publishResults,
    useJudgeSubmissionSummary,
    useScheduleReadiness,
  };
};
