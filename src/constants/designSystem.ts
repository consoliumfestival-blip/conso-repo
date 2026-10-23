import { Platform } from 'react-native';
import tokens from './coreThemeTokens.json';
import { coreColor, CoreColor } from './coreTheme';

// Static StyleSheets can retain these CSS references: changing the scoped
// variables updates them without rebuilding styles or remounting screens.
const themedColors = Object.fromEntries(Object.entries(tokens.legacy).map(([role, fallback]) => [role, coreColor(fallback, role as CoreColor)])) as Record<CoreColor, string>;

export const ui = {
  colors: { ...themedColors, destructive: themedColors.danger, destructiveSoft: themedColors.dangerSoft },
  radius: {
    sm: 8,
    md: 10,
    lg: 12,
    xl: 16,
  },
  shadow: Platform.select({
    web: {
      boxShadow: '0 8px 28px rgba(15, 23, 42, 0.07)',
    },
    default: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
  }) as any,
};
