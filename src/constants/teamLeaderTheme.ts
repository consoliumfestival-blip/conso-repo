import { Platform } from 'react-native';
import { ui as shared } from './designSystem';

/** Use each device's native UI font, including SF Pro on Apple devices. */
export const TEAM_FONT_FAMILY = Platform.OS === 'web'
  ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  : Platform.OS === 'ios' ? 'System' : undefined;

/** Fixed Team Leader palettes. The Admin design system is never mutated. */
const lightColors = {
  background: '#F4F5F6', surface: '#FFFFFF', surfaceGlass: 'rgba(255,255,255,0.96)',
  surfaceMuted: '#F3F4F5', surfaceStrong: '#E7E9EB',
  text: '#27221E', textMuted: '#706861', textSubtle: '#938A82',
  border: 'rgba(33, 31, 29, 0.10)', borderStrong: 'rgba(33, 31, 29, 0.18)',
  primary: '#EC5E27', primaryHover: '#B84015', primaryStrong: '#B84015', primarySoft: '#FFF0E9', onPrimary: '#FFFFFF', navSelectedText: '#FFFFFF',
  navActive: '#1D1B19', navActiveText: '#FF7847',
  sidebar: 'rgba(255,255,255,0.94)', sidebarSoft: '#1D1B19', sidebarText: '#27221E',
  success: '#34704B', successSoft: '#E5F2E8', warning: '#895015', warningSoft: '#FBE8C8',
  danger: '#B84015', dangerSoft: '#FBE2D7', info: '#2F6FD5', infoSoft: '#E8F0FE',
  overlay: 'rgba(30, 25, 21, 0.46)',
};

const darkColors = {
  background: '#171717', surface: '#232323', surfaceGlass: 'rgba(35,35,35,0.96)',
  surfaceMuted: '#2C2C2C', surfaceStrong: '#383838',
  text: '#F7F3EE', textMuted: '#C3B8AD', textSubtle: '#9C9085',
  border: 'rgba(245, 245, 245, 0.13)', borderStrong: 'rgba(245,245,245,0.22)',
  primary: '#F1743E', primaryHover: '#FF9868', primaryStrong: '#B84015', primarySoft: 'rgba(236,94,39,0.18)', onPrimary: '#FFFFFF', navSelectedText: '#FFFFFF',
  navActive: '#090909', navActiveText: '#FF8B5F',
  sidebar: 'rgba(31,31,31,0.96)', sidebarSoft: '#090909', sidebarText: '#F7F3EE',
  success: '#8FC69D', successSoft: 'rgba(55,126,76,0.22)', warning: '#E9B477', warningSoft: 'rgba(190,116,32,0.2)',
  danger: '#F18C7A', dangerSoft: 'rgba(184,64,21,0.2)', info: '#92B9F5', infoSoft: 'rgba(37,99,235,0.2)',
  overlay: 'rgba(0, 0, 0, 0.68)',
};

export type TeamThemeMode = 'light' | 'dark';

export function createTeamUi(mode: TeamThemeMode) {
  const colors = mode === 'dark' ? darkColors : lightColors;
  return {
    ...shared,
    fontFamily: TEAM_FONT_FAMILY,
    colors,
    radius: { ...shared.radius, card: 17 },
    shadow: Platform.select({
      web: { boxShadow: mode === 'dark' ? '0 12px 30px rgba(0,0,0,0.22)' : '0 8px 26px rgba(39,34,30,0.065)' },
      default: {
        shadowColor: mode === 'dark' ? '#000000' : '#27221E',
        shadowOpacity: mode === 'dark' ? 0.22 : 0.055,
        shadowRadius: mode === 'dark' ? 18 : 14,
        shadowOffset: { width: 0, height: 7 },
        elevation: mode === 'dark' ? 4 : 2,
      },
    }) as any,
  };
}

/** Static light tokens remain available to non-react consumers. Team UI uses useTeamUi(). */
export const teamUi = createTeamUi('light');

/** Phones and small tablets use the mobile composition. */
export const TEAM_DESKTOP_MIN_WIDTH = 768;
