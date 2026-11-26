export const DEFAULT_TOPIC_DURATION_MINUTES = 5;
export const MIN_TOPIC_DURATION_MINUTES = 1;
export const MAX_TOPIC_DURATION_MINUTES = 24 * 60;

export function topicDurationMinutesToSeconds(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const minutes = Number(normalized);
  if (!Number.isSafeInteger(minutes)
    || minutes < MIN_TOPIC_DURATION_MINUTES
    || minutes > MAX_TOPIC_DURATION_MINUTES) return null;

  return minutes * 60;
}

export function topicPoolsMatch(
  savedTopics: { topic_text: string }[],
  draftTopics: { topic_text: string }[],
): boolean {
  const normalize = (topics: { topic_text: string }[]) => topics
    .map(({ topic_text }) => topic_text.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  const saved = normalize(savedTopics);
  const drafts = normalize(draftTopics);
  return saved.length === drafts.length && saved.every((topic, index) => topic === drafts[index]);
}
