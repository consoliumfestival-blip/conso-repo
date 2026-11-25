import { supabase } from '@/core/config/supabase';

export type ScheduleTopic = {
  id: string;
  topic_text: string;
  is_active: boolean;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ScheduleTopicAssignment = {
  id: string;
  registration_id: string;
  topic_id: string;
  topic_text: string;
  drawn_at: string;
  is_current: boolean;
};

export type ScheduleTopicDrawState = {
  enabled: boolean;
  display_token: string | null;
  displayed_assignment_id: string | null;
  judging_started: boolean;
  topics: ScheduleTopic[];
  assignments: ScheduleTopicAssignment[];
};

function throwOnError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const scheduleTopicDrawService = {
  async getState(scheduleId: string): Promise<ScheduleTopicDrawState> {
    const { data, error } = await supabase.rpc('admin_schedule_topic_draw_state', {
      p_schedule_id: scheduleId,
    });
    throwOnError(error);
    return data as ScheduleTopicDrawState;
  },

  async saveTopics(scheduleId: string, topics: (Pick<ScheduleTopic, 'id' | 'topic_text'> | { topic_text: string })[]) {
    const { data, error } = await supabase.rpc('admin_save_schedule_topics', {
      p_schedule_id: scheduleId,
      p_topics: topics,
    });
    throwOnError(error);
    return (data ?? []) as { id: string; topic_text: string }[];
  },

  async deleteTopic(scheduleId: string, topicId: string) {
    const { error } = await supabase.rpc('admin_delete_schedule_topic', {
      p_schedule_id: scheduleId,
      p_topic_id: topicId,
    });
    throwOnError(error);
  },

  async setActive(scheduleId: string, topicId: string, active: boolean) {
    const { error } = await supabase.rpc('stage_set_schedule_topic_active', {
      p_schedule_id: scheduleId,
      p_topic_id: topicId,
      p_active: active,
    });
    throwOnError(error);
  },

  async draw(scheduleId: string, registrationId: string, confirmRedraw: boolean, confirmJudgingStarted: boolean) {
    const { data, error } = await supabase.rpc('stage_draw_schedule_topic', {
      p_schedule_id: scheduleId,
      p_registration_id: registrationId,
      p_confirm_redraw: confirmRedraw,
      p_confirm_judging_started: confirmJudgingStarted,
    });
    throwOnError(error);
    return data as {
      assignment_id: string;
      registration_id: string;
      topic_id: string;
      topic_text: string;
      drawn_at: string;
      judging_started: boolean;
      replaced_assignment_id: string | null;
    };
  },

  async setDisplayedAssignment(scheduleId: string, assignmentId: string | null) {
    const { error } = await supabase.rpc('stage_set_schedule_topic_display', {
      p_schedule_id: scheduleId,
      p_assignment_id: assignmentId,
    });
    throwOnError(error);
  },

  async getJudgeAssignments(token: string): Promise<{ registration_id: string; topic_text: string }[]> {
    const { data, error } = await supabase.rpc('get_judge_topic_assignments', {
      p_token: token.toUpperCase().trim(),
    });
    throwOnError(error);
    return (data ?? []) as { registration_id: string; topic_text: string }[];
  },

  async getPublicDisplayTopic(displayToken: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('get_schedule_topic_display', {
      p_display_token: displayToken,
    });
    throwOnError(error);
    return typeof data === 'string' ? data : null;
  },
};
