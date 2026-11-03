export function showScheduleCardActions(width: number): boolean {
  return width >= 600 && width < 1400;
}

export type TabletScheduleOrientation = 'portrait' | 'landscape' | null;

export function getTabletScheduleActionRows<T>(actions: readonly T[]): [T[], T[]] {
  return [actions.slice(0, 2), actions.slice(2, 4)];
}

export function getTabletScheduleOrientation(
  isNativeTablet: boolean,
  width: number,
  height: number,
  screenWidth: number,
  screenHeight: number,
  maxTouchPoints: number,
): TabletScheduleOrientation {
  const shortScreenSide = Math.min(screenWidth, screenHeight);
  const longScreenSide = Math.max(screenWidth, screenHeight);
  const isTouchTabletScreen = maxTouchPoints > 0
    && shortScreenSide >= 600
    && longScreenSide <= 1600
    && longScreenSide / shortScreenSide <= 1.8;
  if ((!isNativeTablet && !isTouchTabletScreen) || width < 600 || width >= 1400 || height <= 0) return null;
  return width > height ? 'landscape' : 'portrait';
}
