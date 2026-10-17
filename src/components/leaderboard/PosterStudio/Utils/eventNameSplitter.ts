/**
 * eventNameSplitter.ts
 * Splits a multi-word event name into Primary + Secondary typography parts.
 *
 * Split Rule:
 *   - 1 word  → primary = full name,  secondary = ""
 *   - 2 words → primary = word[0],    secondary = word[1]
 *   - 3+ words→ primary = word[0],    secondary = rest joined
 *
 * Mode A (default): primary = BIG,   secondary = small
 * Mode B (swapped): primary = small, secondary = BIG
 * (The mode only affects which layer gets larger styling in the template —
 *  the variable VALUES are swapped so templates don't need to change.)
 */

export type TypographyMode = 'A' | 'B';

export interface SplitResult {
  primary: string;
  secondary: string;
}

export function splitEventName(name: string, mode: TypographyMode): SplitResult {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return { primary: '', secondary: '' };
  if (words.length === 1) return { primary: words[0], secondary: '' };

  // First word = primary, rest = secondary
  const first = words[0];
  const rest = words.slice(1).join(' ');

  return mode === 'A'
    ? { primary: first,  secondary: rest  }   // Mode A: BIG first word
    : { primary: rest,   secondary: first };  // Mode B: BIG remaining words
}

/**
 * Returns a human-readable preview for the toggle button label.
 * e.g. "READING / Malayalam"
 */
export function getTypographyPreview(name: string, mode: TypographyMode): string {
  const { primary, secondary } = splitEventName(name, mode);
  if (!secondary) return primary.toUpperCase();
  return `${primary.toUpperCase()} / ${secondary}`;
}
