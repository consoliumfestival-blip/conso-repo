import { Platform } from 'react-native';
import tokens from './coreThemeTokens.json';

export type CoreMode = 'light' | 'dark' | 'system';
export type CorePalette = keyof typeof tokens.palettes;
export type CoreColor = keyof typeof tokens.legacy;
export type CoreAppearance = { mode: CoreMode; palette: CorePalette };
export const CORE_APPEARANCE_KEY = 'core-appearance-v1';
export const DEFAULT_CORE_APPEARANCE: CoreAppearance = { mode: 'light', palette: 'teal' };
export const CORE_PALETTES = tokens.palettes;

export function parseCoreAppearance(raw: string | null): CoreAppearance {
  try {
    const value = JSON.parse(raw || 'null');
    if (value && ['light', 'dark', 'system'].includes(value.mode) && Object.prototype.hasOwnProperty.call(tokens.palettes, value.palette)) return { mode: value.mode, palette: value.palette };
  } catch { /* Invalid or older preferences fall back safely. */ }
  return DEFAULT_CORE_APPEARANCE;
}

export function readCoreAppearance(): CoreAppearance {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try { return parseCoreAppearance(localStorage.getItem(CORE_APPEARANCE_KEY)); } catch { /* Storage may be disabled. */ }
  }
  return DEFAULT_CORE_APPEARANCE;
}

export function resolveCoreColors(appearance: CoreAppearance, systemDark: boolean) {
  const dark = appearance.mode === 'dark' || (appearance.mode === 'system' && systemDark);
  return dark ? { ...tokens.dark } : { ...tokens.legacy, ...tokens.light, ...tokens.palettes[appearance.palette], primaryText: tokens.palettes[appearance.palette].primary, onPrimary: '#FFFFFF' };
}

export function coreVariableName(role: string) { return `--core-${role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`; }
export function coreColor(fallback: string, role: CoreColor): string {
  return Platform.OS === 'web' ? `var(${coreVariableName(role)}, ${fallback})` : fallback;
}
export function coreAlpha(color: string, opacity: number): string {
  const variable = color.match(/^var\((--core-[\w-]+),\s*(#[\da-f]{3,6}|white|black)\)$/i);
  if (variable) {
    let hex = variable[2].toLowerCase().replace('white', '#ffffff').replace('black', '#000000').slice(1);
    if (hex.length === 3) hex = hex.split('').map(part => part + part).join('');
    return `rgb(var(${variable[1]}-rgb, ${hex.match(/../g)!.map(part => parseInt(part, 16)).join(' ')}) / ${opacity})`;
  }
  if (color.startsWith('var(')) return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
  if (/^#[\da-f]{6}$/i.test(color)) return `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
  return color;
}
export function coreVariables(colors: ReturnType<typeof resolveCoreColors>) {
  const result: Record<string, string> = {};
  for (const role of Object.keys(tokens.legacy) as CoreColor[]) {
    const hex = colors[role];
    result[coreVariableName(role)] = hex;
    result[`${coreVariableName(role)}-rgb`] = hex.match(/[\da-f]{2}/gi)!.map((part) => parseInt(part, 16)).join(' ');
  }
  return result;
}
