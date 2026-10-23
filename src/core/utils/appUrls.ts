export function getCurrentOriginAppUrl(path: string): string | null {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : process.env.EXPO_PUBLIC_APP_ORIGIN;
  if (!origin) return null;
  try {
    const base = new URL(origin);
    if (base.protocol !== 'https:' && base.hostname !== 'localhost') return null;
    return new URL(path, base.origin).toString();
  } catch {
    return null;
  }
}
