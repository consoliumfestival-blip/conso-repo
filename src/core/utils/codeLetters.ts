export type LetterEntry = {
  id: string;
  code_letter: string | null;
  code_letter_fixed?: boolean;
  status?: string | null;
  is_verified?: boolean | null;
};

export function codeLetterAt(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('Code letter index must be a non-negative safe integer.');
  let value = BigInt(index) + 1n;
  let result = '';
  while (value > 0n) {
    const remainder = Number((value - 1n) % 26n);
    result = String.fromCharCode(65 + remainder) + result;
    value = (value - 1n) / 26n;
  }
  return result;
}

export function codeLetterOrder(letter: string): bigint {
  const normalized = letter.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) throw new Error('Code must contain one or more English letters.');
  let value = 0n;
  for (const character of normalized) value = value * 26n + BigInt(character.charCodeAt(0) - 64);
  return value - 1n;
}

export function compareCodeLetters(left: string, right: string): number {
  try {
    const leftOrder = codeLetterOrder(left);
    const rightOrder = codeLetterOrder(right);
    return leftOrder < rightOrder ? -1 : leftOrder > rightOrder ? 1 : 0;
  } catch {
    return left.localeCompare(right);
  }
}

export function codeLetterTarget<T extends LetterEntry>(entries: T[], sourceId: string, letter: string): T | undefined {
  return entries.find((entry) => entry.id !== sourceId && entry.status !== 'rejected'
    && entry.is_verified === true && entry.code_letter === letter.trim().toUpperCase());
}

export function codeLetterPreview(source: string | null, letter: string, targetName?: string) {
  const next = letter.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(next)) return 'Use letters A–Z. Longer codes continue as AA, AB, and onward.';
  if (targetName) return source
    ? `${source} → ${next}; ${targetName}: ${next} → ${source}. Both letters will stay fixed during draws.`
    : `${next} is assigned to ${targetName}. Choose an unused letter for this entry.`;
  return `${source || 'Unassigned'} → ${next}. This letter will stay fixed during draws and redraws.`;
}
