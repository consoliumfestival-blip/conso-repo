export function stageTopicSecondsRemaining(
  publishedAt: string,
  durationSeconds: number,
  serverOffsetMs: number,
  nowMs: number,
): number {
  const deadline = Date.parse(publishedAt) + durationSeconds * 1000;
  if (!Number.isFinite(deadline) || !Number.isFinite(serverOffsetMs)) return 0;
  return Math.max(0, Math.ceil((deadline - nowMs - serverOffsetMs) / 1000));
}
