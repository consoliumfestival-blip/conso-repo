export function hasGrade(result: { grade: string | null }): boolean {
  return typeof result.grade === 'string' && result.grade.trim() !== '' && result.grade.trim() !== '-';
}

export function itemResultIds<T extends { result_id: string; item_id: string | null; festival_id: string | null }>(
  results: T[], groupId: string, festivalId: string | null | undefined,
): string[] {
  if (!festivalId) return [];
  return results
    .filter(result => result.festival_id === festivalId &&
      (result.item_id === groupId || (result.item_id == null && `result:${result.result_id}` === groupId)))
    .map(result => result.result_id);
}
