export function getRequiredJudgeCount(value: unknown): number {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 5 ? count : 3;
}

export function toggleAssignedJudge(
  currentIds: string[],
  judgeId: string,
  requiredCount: number,
): { judgeIds: string[]; changed: boolean } {
  if (currentIds.includes(judgeId)) {
    return { judgeIds: currentIds.filter((id) => id !== judgeId), changed: true };
  }
  if (currentIds.length >= requiredCount) {
    return { judgeIds: currentIds, changed: false };
  }
  return { judgeIds: [...currentIds, judgeId], changed: true };
}
