import tokens from '@/constants/coreThemeTokens.json';
import type { CoreColor } from '@/constants/coreTheme';

// Superadmin uses a stable palette without changing the user's Core settings.
export function superAdminColor(_fallback: string, role: CoreColor): string {
  return tokens.legacy[role];
}
