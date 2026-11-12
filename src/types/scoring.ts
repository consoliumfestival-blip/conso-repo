export type CompetitionPublication = {
  scheduleId: string;
  expectedVersion: number;
  mode: 'judges' | 'manual';
  requestId: string;
  bracket: string | null;
  groupSize: number | null;
  confirmedMissingMarks?: { registration_id: string; judge_id: string; mark_id: string | null; updated_at: string | null; snapshot: Record<string, unknown> | null }[];
  zeroMaximum?: number;
  entries: { registration_id: string; raw_marks?: { judge_slot?: number; total: number; maximum: number }[] }[];
};
export const competitionArguments = (input: CompetitionPublication) => ({
  p_schedule_id: input.scheduleId, p_expected_version: input.expectedVersion,
  p_entries: input.entries, p_mode: input.mode, p_bracket: input.bracket, p_group_size: input.groupSize,
});
