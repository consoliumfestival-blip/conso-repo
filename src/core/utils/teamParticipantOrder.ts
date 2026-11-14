export function compareParticipantsByChestNumber(
  a: { chest_number: string | null; name: string | null; id: string },
  b: { chest_number: string | null; name: string | null; id: string },
): number {
  const left = a.chest_number?.trim() || '';
  const right = b.chest_number?.trim() || '';
  if (!left && right) return 1;
  if (left && !right) return -1;
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
    || (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    || a.id.localeCompare(b.id);
}
