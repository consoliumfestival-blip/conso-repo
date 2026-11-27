import type React from 'react';
import { ui } from '../../../constants/designSystem';

/** UI-only tokens for Poster Studio. Artwork colors remain stored on its layers. */
export const posterStudioThemeStyle = {
  '--ps-app-bg': ui.colors.background,
  '--ps-surface': ui.colors.surface,
  '--ps-surface-muted': ui.colors.surfaceMuted,
  '--ps-canvas-surround': ui.colors.surfaceStrong,
  '--ps-border': ui.colors.border,
  '--ps-border-strong': ui.colors.borderStrong,
  '--ps-text': ui.colors.text,
  '--ps-muted': ui.colors.textMuted,
  '--ps-subtle': ui.colors.textSubtle,
  '--ps-accent': ui.colors.primary,
  '--ps-accent-hover': ui.colors.primaryHover,
  '--ps-accent-soft': ui.colors.primarySoft,
  '--ps-success': ui.colors.success,
  '--ps-success-soft': ui.colors.successSoft,
  '--ps-warning': ui.colors.warning,
  '--ps-warning-soft': ui.colors.warningSoft,
  '--ps-focus': '#0284C7',
  '--ps-danger': ui.colors.danger,
  '--ps-danger-soft': ui.colors.dangerSoft,
  '--ps-shadow': '0 12px 36px rgba(15, 23, 42, 0.14)',
} as unknown as React.CSSProperties;
