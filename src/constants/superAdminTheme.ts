import tokens from '@/constants/coreThemeTokens.json';
import type { CoreColor } from '@/constants/coreTheme';
import { coreColor } from '@/constants/coreTheme';
import { legacyButtonColors } from './buttonTheme';

// Superadmin uses a stable palette without changing the user's Core settings.
export function superAdminColor(_fallback: string, role: CoreColor): string {
  if (role in legacyButtonColors) return coreColor(legacyButtonColors[role as keyof typeof legacyButtonColors], role);
  return tokens.legacy[role as keyof typeof tokens.legacy];
}
