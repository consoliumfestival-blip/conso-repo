import { Platform } from 'react-native';
import { ui as shared } from './designSystem';

/** Fixed Team Leader palette. Never mutate the shared Admin design system. */
export const teamUi = {
  ...shared,
  colors: {
    background: '#FDFDF1', surface: '#FFFEF8', surfaceMuted: '#FAF0E4', surfaceStrong: '#F6E4D3',
    text: '#2D1C14', textMuted: '#796252', textSubtle: '#927A68',
    border: '#EADBCB', borderStrong: '#DCC4AC',
    primary: '#EC5E27', primaryHover: '#B84015', primarySoft: '#FDE8DC', onPrimary: '#24140D',
    sidebar: '#FDFDF1', sidebarSoft: '#FDE8DC', sidebarText: '#2D1C14',
    success: '#81501F', successSoft: '#F8EBD6', warning: '#895015', warningSoft: '#FBE8C8',
    danger: '#B84015', dangerSoft: '#FBE2D7', info: '#A4401C', infoSoft: '#FDE8DC',
    overlay: 'rgba(45, 28, 20, 0.45)',
  },
  shadow: Platform.select({
    web: { boxShadow: '0 8px 24px rgba(45, 28, 20, 0.08)' },
    default: { shadowColor: '#2D1C14', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  }) as any,
};

/** Phones and small tablets use the mobile composition. */
export const TEAM_DESKTOP_MIN_WIDTH = 768;
