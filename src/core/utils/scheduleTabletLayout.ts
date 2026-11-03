export function showTabletScheduleActions(isTablet: boolean, width: number, height: number): boolean {
  return isTablet && width >= 600 && width < 1400 && height >= 600;
}
