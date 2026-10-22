export type CompetitionPublication = {
  scheduleId: string;
  expectedVersion: number;
  mode: 'judges' | 'manual';
  requestId: string;
  bracket: string | null;
  groupSize: number | null;
  entries: { registration_id: string; raw_marks?: { total: number; maximum: number }[] }[];
};
export const competitionArguments = (input: CompetitionPublication) => ({
  p_schedule_id: input.scheduleId, p_expected_version: input.expectedVersion,
  p_entries: input.entries, p_mode: input.mode, p_bracket: input.bracket, p_group_size: input.groupSize,
});
