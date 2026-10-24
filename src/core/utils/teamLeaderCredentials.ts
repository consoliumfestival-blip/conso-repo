export type TeamLeaderCredentialKind = 'username' | 'password';

export const isSixDigitPassword = (value: string): boolean => /^[0-9]{6}$/.test(value);

// Trim copy/paste padding, but never turn mixed text into a different password.
export function readNumericPasswordInput(value: string): string | null {
  const trimmed = value.trim();
  return /^[0-9]{0,6}$/.test(trimmed) ? trimmed : null;
}

export function teamLeaderClipboardValue(value: string, kind: TeamLeaderCredentialKind): string {
  const trimmed = value.trim();
  if (!trimmed || (kind === 'password' && !isSixDigitPassword(trimmed))) {
    throw new Error(kind === 'password' ? 'A valid six-digit password is not available. Reissue the password.' : 'A valid username is not available.');
  }
  return trimmed;
}
