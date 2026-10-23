import { vars } from 'nativewind';
import tokens from './coreThemeTokens.json';
import { coreVariables } from './coreTheme';

/** Printed/captured documents retain the legacy output palette in every UI mode. */
export const fixedCoreOutputVariables = vars({ ...coreVariables(tokens.legacy), '--core-blur': 'none' });
export const legacyCoreOutputColors = tokens.legacy;
