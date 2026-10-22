export type LetterEntry = {
  id: string;
  code_letter: string | null;
  code_letter_fixed?: boolean;
  status?: string | null;
  is_verified?: boolean | null;
};

export function codeLetterTarget<T extends LetterEntry>(entries: T[], sourceId: string, letter: string): T | undefined {
  return entries.find((entry) => entry.id !== sourceId && entry.status !== 'rejected'
    && entry.is_verified === true && entry.code_letter === letter.trim().toUpperCase());
}

export function codeLetterPreview(source: string | null, letter: string, targetName?: string) {
  const next = letter.trim().toUpperCase();
  if (!/^[A-Z]$/.test(next)) return 'Manual assignments stay fixed during draws and redraws.';
  if (targetName) return source
    ? `${source} → ${next}; ${targetName}: ${next} → ${source}. Both letters will stay fixed during draws.`
    : `${next} is assigned to ${targetName}. Choose an unused letter for this entry.`;
  return `${source || 'Unassigned'} → ${next}. This letter will stay fixed during draws and redraws.`;
}
