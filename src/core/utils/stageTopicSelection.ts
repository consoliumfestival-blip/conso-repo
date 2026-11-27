import type { StageTopicDisplayState } from '../../services/scheduleTopicDrawService';
import type { ScheduleTopicAssignment, StageTopicDrawPreview } from '../../services/scheduleTopicDrawService';
import type { StageRegistrationRow, StageScheduleRow } from '../../services/stageManagementService';

export function selectedSavedDraw(
  schedule: StageScheduleRow | undefined,
  participant: StageRegistrationRow | undefined,
  assignment: ScheduleTopicAssignment | undefined,
  durationSeconds: number | undefined,
): StageTopicDrawPreview | undefined {
  if (!schedule || !participant || !assignment?.is_current
    || assignment.registration_id !== participant.id || participant.status === 'rejected'
    || !participant.code_letter?.trim() || typeof durationSeconds !== 'number'
    || !Number.isInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 86400) return undefined;
  return {
    schedule_id: schedule.id, registration_id: participant.id, draw_id: assignment.id,
    item_name: schedule.item_name_en?.trim() || schedule.item_name_ml?.trim() || schedule.item_code?.trim() || 'Item',
    code_letter: participant.code_letter.trim(), topic_text: assignment.topic_text,
    duration_seconds: durationSeconds,
  };
}

// A stage may contain pending draws for many events. Selection never falls
// back to another event, participant, or a newer draw of the same topic text.
export function selectedReadyTopic(
  ready: StageTopicDisplayState['ready'],
  scheduleId: string,
  registrationId: string,
  drawId: string | undefined,
  codeLetter: string | null | undefined,
  topicText: string | undefined,
) {
  if (!scheduleId || !registrationId || !drawId || !codeLetter?.trim()) return undefined;
  return ready.find(item => item.schedule_id === scheduleId
    && item.registration_id === registrationId && item.draw_id === drawId
    && item.code_letter === codeLetter.trim() && item.topic_text === topicText);
}
