/** Fill only absent judge slots after the operator has confirmed the warning. */
export function completeDirectMarks(
  marks: Record<number, number>,
  judgeCount: number,
): Record<number, number> {
  if (!Number.isSafeInteger(judgeCount) || judgeCount < 1) {
    throw new Error('A valid required judge count is required.');
  }

  const result = { ...marks };
  for (let slot = 1; slot <= judgeCount; slot += 1) {
    if (result[slot] === undefined) result[slot] = 0;
  }
  return result;
}
