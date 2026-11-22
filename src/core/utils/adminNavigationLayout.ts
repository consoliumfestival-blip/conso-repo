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
