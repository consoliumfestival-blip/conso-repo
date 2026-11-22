import { Platform } from 'react-native';
import * as Device from 'expo-device';

/** Phone uses bottom navigation; desktop uses the floating icon rail. */
export function adminNavigationMode(width: number): 'phone' | 'tablet' | 'desktop' {
  if (Device.deviceType === Device.DeviceType.TABLET) return 'tablet';
  if (width < 900) return 'phone';
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof navigator === 'undefined') return 'desktop';
  // iPadOS can report a desktop user agent and large landscape widths.
  const isIPad = /iPad/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIPad) return 'tablet';
  const tabletSizedTouchscreen = navigator.maxTouchPoints > 0
    && Math.min(window.screen.width, window.screen.height) <= 1100
    && width <= 1400;
  return tabletSizedTouchscreen ? 'tablet' : 'desktop';
}

export function showAdminIconRail(width: number): boolean {
  return adminNavigationMode(width) === 'desktop';
}

/** Tablet identity for the menu, including narrow portrait iPad browser viewports. */
export function isAdminTablet(width: number): boolean {
  if (Device.deviceType === Device.DeviceType.TABLET) return true;
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (/iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return true;
  return navigator.maxTouchPoints > 0 && Math.min(window.screen.width, window.screen.height) <= 1100 && width <= 1400 && Math.min(window.screen.width, window.screen.height) >= 600;
}

/** Split a sequence without reordering or breaking sections, minimizing the taller column. */
export function splitMenuSections<T extends { entries: unknown[]; title?: string }>(sections: T[], cardsPerRow: number): [T[], T[]] {
  if (sections.length < 2) return [sections, []];
  const cost = (section: T) => Math.ceil(section.entries.length / cardsPerRow) * 108 + (section.title ? 24 : 0) + 10;
  const total = sections.reduce((sum, section) => sum + cost(section), 0);
  let first = 0, split = 1, smallest = Infinity;
  for (let index = 1; index < sections.length; index++) {
    first += cost(sections[index - 1]);
    const taller = Math.max(first, total - first);
    if (taller < smallest) { smallest = taller; split = index; }
  }
  return [sections.slice(0, split), sections.slice(split)];
}
