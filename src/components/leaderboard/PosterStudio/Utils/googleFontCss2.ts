export function parseFontWeights(weights?: string): number[] {
  if (!weights || typeof weights !== 'string') return [400];
  const parsed = weights
    .split(/[,;\s]+/)
    .map((part) => Number(part.trim()))
    .filter((num) => Number.isFinite(num) && num >= 100 && num <= 1000);
  const unique = Array.from(new Set(parsed)).sort((a, b) => a - b);
  return unique.length > 0 ? unique : [400];
}

export function normalizeRequestedWeight(weight: number | string | undefined): number {
  if (typeof weight === 'number' && Number.isFinite(weight)) {
    return Math.min(1000, Math.max(100, Math.round(weight)));
  }
  if (typeof weight === 'string') {
    const lower = weight.trim().toLowerCase();
    if (lower === 'bold') return 700;
    if (lower === 'normal' || lower === 'regular') return 400;
    const num = Number(lower);
    if (Number.isFinite(num)) return Math.min(1000, Math.max(100, Math.round(num)));
  }
  return 400;
}

export function resolveClosestFontWeight(
  requestedWeight: number | string | undefined,
  supportedWeights?: string,
): number {
  const target = normalizeRequestedWeight(requestedWeight);
  const available = parseFontWeights(supportedWeights);
  let best = available[0];
  let bestDiff = Math.abs(best - target);
  for (let i = 1; i < available.length; i++) {
    const diff = Math.abs(available[i] - target);
    if (diff < bestDiff) {
      best = available[i];
      bestDiff = diff;
    }
  }
  return best;
}

export function buildGoogleFontsCss2Url(family: string, weights?: string): string {
  const cleanFamily = String(family || '').trim();
  const encodedFamily = encodeURIComponent(cleanFamily).replace(/%20/g, '+');
  const parsed = parseFontWeights(weights);
  if (parsed.length === 1 && parsed[0] === 400) {
    return `https://fonts.googleapis.com/css2?family=${encodedFamily}&display=swap`;
  }
  return `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${parsed.join(';')}&display=swap`;
}

export function getFontLoadSampleText(category?: string): string {
  if (String(category || '').toLowerCase().includes('malayalam')) {
    return 'അആഇ 123';
  }
  return 'BESbswy 123';
}
