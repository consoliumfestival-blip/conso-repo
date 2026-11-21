import { Platform } from 'react-native';
import * as Device from 'expo-device';

/** Keep touch tablets on the same bottom navigation as phones. */
export function showAdminIconRail(width: number): boolean {
  if (width < 900 || Device.deviceType === Device.DeviceType.TABLET) return false;
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof navigator === 'undefined') return true;
  const tabletSizedTouchscreen = navigator.maxTouchPoints > 0
    && Math.min(window.screen.width, window.screen.height) <= 1024
    && width <= 1400;
  return !tabletSizedTouchscreen;
}
