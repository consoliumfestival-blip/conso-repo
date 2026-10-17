import { Platform } from 'react-native';

export const ui = {
  colors: {
    background: '#F6F7F9',
    surface: '#FFFFFF',
    surfaceMuted: '#F1F4F7',
    surfaceStrong: '#E8EDF2',
    text: '#111827',
    textMuted: '#64748B',
    textSubtle: '#94A3B8',
    border: '#E2E8F0',
    borderStrong: '#CBD5E1',
    primary: '#0F766E',
    primaryHover: '#0B5D56',
    primarySoft: '#E7F6F3',
    sidebar: '#102A2E',
    sidebarSoft: '#17383D',
    sidebarText: '#D7E8E8',
    success: '#15803D',
    successSoft: '#DCFCE7',
    warning: '#B45309',
    warningSoft: '#FEF3C7',
    danger: '#DC2626',
    dangerSoft: '#FEE2E2',
    info: '#2563EB',
    infoSoft: '#DBEAFE',
  },
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
