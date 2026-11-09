export function showScheduleCardActions(width: number): boolean {
  return width >= 600 && width < 1400;
}

export type CompactScheduleActionOrientation = 'portrait' | 'landscape' | null;

export function shouldUseTabletScheduleTable(isTabletScreen: boolean, width: number): boolean {
  // Keep the row table for tablets only when the page has enough room for its
  // event, date, status, and action columns. Smaller tablets use schedule cards.
  return isTabletScreen && width >= 1200;
}

export function getScheduleActionRows<T>(actions: readonly T[]): [T[], T[]] {
  return [actions.slice(0, 2), actions.slice(2, 4)];
}

export function getCompactScheduleActionOrientation(
  isNativeTablet: boolean,
  width: number,
  height: number,
  screenWidth: number,
  screenHeight: number,
  maxTouchPoints: number,
): CompactScheduleActionOrientation {
  const shortScreenSide = Math.min(screenWidth, screenHeight);
  const longScreenSide = Math.max(screenWidth, screenHeight);
  const isTouchTabletScreen = maxTouchPoints > 0
    && shortScreenSide >= 600
    && longScreenSide / shortScreenSide <= 1.9;
  // On web, compact schedule cards are also used in small laptop and
  // constrained desktop windows. Device classification can report UNKNOWN
  // there, so use the card viewport breakpoint to expose the same actions.
  const isCompactPointerViewport = maxTouchPoints === 0 && width >= 600 && width < 1400;
  if ((!isNativeTablet && !isTouchTabletScreen && !isCompactPointerViewport)
    || width < 600 || width >= 1400 || height <= 0) return null;
  return width > height ? 'landscape' : 'portrait';
}
