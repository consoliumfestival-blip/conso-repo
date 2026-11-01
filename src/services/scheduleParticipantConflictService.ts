import { supabase } from '../core/config/supabase';

export type ScheduleConflictCandidate = {
  key: string;
  item_id: string;
  start_time: string;
  end_time: string;
  exclude_schedule_id?: string | null;
};

export type ScheduleParticipantConflict = {
  candidate_key: string;
  candidate_item_id: string;
  candidate_item_name: string | null;
  participant_id: string;
  participant_name: string | null;
  chest_number: string | null;
  conflicting_schedule_id: string | null;
  conflicting_candidate_key: string | null;
  conflicting_item_id: string;
  conflicting_item_name: string | null;
  conflicting_venue_name: string | null;
  conflicting_start_time: string;
  conflicting_end_time: string;
  candidate_is_group_member: boolean;
  conflict_is_group_member: boolean;
};

export const scheduleParticipantConflictService = {
  async preview(festivalId: string, candidates: ScheduleConflictCandidate[]): Promise<ScheduleParticipantConflict[]> {
    if (!candidates.length) return [];
    const { data, error } = await supabase.rpc('preview_schedule_participant_conflicts', {
      p_festival_id: festivalId,
      p_candidates: candidates,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as ScheduleParticipantConflict[];
  },
};
