import type { StageTopicDisplayState } from '../../services/scheduleTopicDrawService';
import type { ScheduleTopicAssignment, StageTopicDrawPreview } from '../../services/scheduleTopicDrawService';
import type { StageRegistrationRow, StageScheduleRow } from '../../services/stageManagementService';

export function selectedSavedDraw(
  schedule: StageScheduleRow | undefined,
  participant: StageRegistrationRow | undefined,
  assignment: ScheduleTopicAssignment | undefined,
  durationSeconds?: number,
): StageTopicDrawPreview | undefined {
  if (
    !schedule ||
    !participant ||
    !assignment?.is_current ||
    assignment.registration_id !== participant.id ||
    participant.status === 'rejected'
  ) {
    return undefined;
  }

  const displayCode =
    participant.code_letter?.trim() ||
    participant.participant_chest_number?.trim() ||
    '—';
  const safeDuration =
    typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0
      ? Math.round(durationSeconds)
      : 300;

  return {
    schedule_id: schedule.id,
    registration_id: participant.id,
    draw_id: assignment.id,
    item_name:
      schedule.item_name_en?.trim() ||
      schedule.item_name_ml?.trim() ||
      schedule.item_code?.trim() ||
      'Item',
    code_letter: displayCode,
    topic_text: assignment.topic_text,
    duration_seconds: safeDuration,
  };
}

export function selectedReadyTopic(
  ready: StageTopicDisplayState['ready'],
  scheduleId: string,
  registrationId: string,
  drawId: string | undefined,
  _codeLetter: string | null | undefined,
  topicText: string | undefined,
) {
  if (!scheduleId || !registrationId || !drawId) return undefined;
  return ready.find(
    (item) =>
      item.schedule_id === scheduleId &&
      item.registration_id === registrationId &&
      item.draw_id === drawId &&
      (topicText === undefined || item.topic_text === topicText),
  );
}
