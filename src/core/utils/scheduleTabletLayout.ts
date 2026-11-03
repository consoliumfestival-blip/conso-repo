export function showTabletScheduleActions(isTablet: boolean, width: number, height: number): boolean {
  return isTablet && width >= 600 && width < 1400 && height >= 600;
}

export function isIpadDesktopMode(platform: string | null | undefined, maxTouchPoints: number | null | undefined): boolean {
  return platform === 'MacIntel' && (maxTouchPoints ?? 0) > 0;
}
