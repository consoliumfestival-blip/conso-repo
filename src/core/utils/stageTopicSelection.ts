import type { StageTopicDisplayState } from '../../services/scheduleTopicDrawService';

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
