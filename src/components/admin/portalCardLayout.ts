export const PORTAL_CARD_GAP = 8;
export const PORTAL_CARD_MIN_WIDTH = 252;
export const PORTAL_CARD_MAX_COLUMNS = 5;

export const STAGE_CARD_ACCENTS = [
  { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', icon: '#10B981' },
  { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', icon: '#3B82F6' },
  { backgroundColor: '#FFF7ED', borderColor: '#FED7AA', icon: '#F97316' },
  { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE', icon: '#8B5CF6' },
] as const;

export function getPortalCardAccent(index: number) {
  return STAGE_CARD_ACCENTS[index % STAGE_CARD_ACCENTS.length];
}

export function getPortalCardColumns(availableWidth: number, gap = PORTAL_CARD_GAP) {
  return Math.max(1, Math.min(
    PORTAL_CARD_MAX_COLUMNS,
    Math.floor((availableWidth + gap) / (PORTAL_CARD_MIN_WIDTH + gap)),
  ));
}

export function getPortalCardWidth(availableWidth: number, columns: number, isWeb: boolean, gap = PORTAL_CARD_GAP) {
  if (isWeb) return `calc((100% - ${(columns - 1) * gap}px) / ${columns})` as any;
  return Math.floor((availableWidth - (columns - 1) * gap) / columns);
}
