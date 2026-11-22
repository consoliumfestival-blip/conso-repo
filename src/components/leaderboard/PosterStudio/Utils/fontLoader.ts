import { useCanvasStore } from '../Stores/canvasStore';

export interface FontDefinition {
  family: string;
  url: string;
  category?: string;
  weights?: string;
}

export const ML_FONTS: FontDefinition[] = [
  { family: 'Noto Sans Malayalam', url: 'https://fonts.gstatic.com/', category: 'Malayalam', weights: '300,400,500,600,700' },
  { family: 'Noto Serif Malayalam', url: 'https://fonts.gstatic.com/', category: 'Malayalam', weights: '300,400,500,600,700' },
  { family: 'Manjari', url: 'https://fonts.gstatic.com/', category: 'Malayalam', weights: '100,400,700' },
  { family: 'Baloo Chettan 2', url: 'https://fonts.gstatic.com/', category: 'Malayalam', weights: '400,500,600,700' },
  { family: 'Gayathri', url: 'https://fonts.gstatic.com/', category: 'Malayalam', weights: '100,400,700' },
  { family: 'Anek Malayalam', url: 'https://fonts.gstatic.com/', category: 'Malayalam', weights: '300,400,500,600,700' },
  { family: 'Rachana', url: 'https://fonts.gstatic.com/', category: 'Malayalam', weights: '400' },
  { family: 'Meera', url: 'https://fonts.gstatic.com/', category: 'Malayalam', weights: '400' },
  { family: 'Chilanka', url: 'https://fonts.gstatic.com/', category: 'Malayalam', weights: '400' },
  { family: 'AnjaliOldLipi', url: 'https://fonts.gstatic.com/', category: 'Malayalam', weights: '400' },
  { family: 'Dyuthi', url: 'https://fonts.gstatic.com/', category: 'Malayalam', weights: '400' },
  { family: 'Karumbi', url: 'https://fonts.gstatic.com/', category: 'Malayalam', weights: '400' },
];

export const EN_FONTS: FontDefinition[] = [
  // Recommended
  { family: 'Poppins', category: 'Recommended', weights: '300,400,500,600,700' },
  { family: 'Inter', category: 'Recommended', weights: '300,400,500,600,700' },
  { family: 'Montserrat', category: 'Recommended', weights: '300,400,500,600,700' },
  
  // Sans / Modern
  { family: 'Manrope', category: 'Sans / Modern', weights: '300,400,500,600,700' },
  { family: 'Plus Jakarta Sans', category: 'Sans / Modern', weights: '300,400,500,600,700' },
  { family: 'Outfit', category: 'Sans / Modern', weights: '300,400,500,600,700' },
  { family: 'Sora', category: 'Sans / Modern', weights: '300,400,500,600,700' },
  { family: 'Urbanist', category: 'Sans / Modern', weights: '300,400,500,600,700' },
  { family: 'Space Grotesk', category: 'Sans / Modern', weights: '300,400,500,600,700' },
  { family: 'Lexend', category: 'Sans / Modern', weights: '300,400,500,600,700' },
  { family: 'Rubik', category: 'Sans / Modern', weights: '300,400,500,600,700' },
  { family: 'Barlow', category: 'Sans / Modern', weights: '300,400,500,600,700' },
  { family: 'Archivo', category: 'Sans / Modern', weights: '300,400,500,600,700' },
  
  // Display / Poster
  { family: 'Bebas Neue', category: 'Display / Poster', weights: '400' },
  { family: 'Anton', category: 'Display / Poster', weights: '400' },
  { family: 'Archivo Black', category: 'Display / Poster', weights: '400' },
  { family: 'League Spartan', category: 'Display / Poster', weights: '300,400,500,600,700' },
  { family: 'Oswald', category: 'Display / Poster', weights: '300,400,500,600,700' },
  { family: 'Barlow Condensed', category: 'Display / Poster', weights: '300,400,500,600,700' },
  { family: 'Teko', category: 'Display / Poster', weights: '300,400,500,600,700' },
  { family: 'Exo 2', category: 'Display / Poster', weights: '300,400,500,600,700' },
  { family: 'Abril Fatface', category: 'Display / Poster', weights: '400' },
  
  // Serif / Elegant
  { family: 'Playfair Display', category: 'Serif / Elegant', weights: '400,500,600,700' },
  { family: 'DM Serif Display', category: 'Serif / Elegant', weights: '400' },
  { family: 'Libre Baskerville', category: 'Serif / Elegant', weights: '400,700' },
  { family: 'Libre Bodoni', category: 'Serif / Elegant', weights: '400,500,600,700' },
  { family: 'Cormorant Garamond', category: 'Serif / Elegant', weights: '300,400,500,600,700' },
  { family: 'Lora', category: 'Serif / Elegant', weights: '400,500,600,700' },
  { family: 'Merriweather', category: 'Serif / Elegant', weights: '300,400,700' },
  { family: 'Bodoni Moda', category: 'Serif / Elegant', weights: '400,500,600,700' },
  
  // Friendly / Editorial
  { family: 'Nunito', category: 'Friendly / Editorial', weights: '300,400,500,600,700' },
  { family: 'Quicksand', category: 'Friendly / Editorial', weights: '300,400,500,600,700' },
  { family: 'Josefin Sans', category: 'Friendly / Editorial', weights: '300,400,500,600,700' },
  { family: 'Raleway', category: 'Friendly / Editorial', weights: '300,400,500,600,700' },
  { family: 'Cabin', category: 'Friendly / Editorial', weights: '400,500,600,700' },
  { family: 'Karla', category: 'Friendly / Editorial', weights: '300,400,500,600,700' },
].map(f => ({ ...f, url: 'https://fonts.gstatic.com/' }));

EN_FONTS.unshift({ family: 'Authenia Textured', category: 'Display / Poster', url: '/fonts/Authenia-Textured.ttf' });

const loadedFonts = new Set<string>();
const fontLoadCache = new Map<string, Promise<'loaded' | 'failed'>>();

export async function loadFont(font: FontDefinition): Promise<'loaded' | 'failed'> {
  if (loadedFonts.has(font.family)) return 'loaded';

  // Deduplicate simultaneous load calls for same font
  if (fontLoadCache.has(font.family)) {
    return fontLoadCache.get(font.family)!;
  }

  const promise = new Promise<'loaded' | 'failed'>((resolve) => {
    const isGoogleFont = font.url && font.url.includes('fonts.gstatic');
    
    if (isGoogleFont) {
      try {
        const webFontLoader = typeof window !== 'undefined' ? require('webfontloader') : null;
        if (!webFontLoader) {
          resolve('failed');
          return;
        }
        const weightsStr = font.weights ? `:${font.weights}` : ':400,700';
        webFontLoader.load({
          google: {
            families: [`${font.family}${weightsStr}`]
          },
          active: () => {
            loadedFonts.add(font.family);
            resolve('loaded');
          },
          inactive: () => {
            console.warn(`[PosterStudio] WebFont failed to load: ${font.family}`);
            if (typeof window !== 'undefined') useCanvasStore.getState().addFailedFont(font.family);
            resolve('failed');
          }
        });
      } catch {
        resolve('failed');
      }
    } else {
      (async () => {
        try {
          const fontFace = new FontFace(font.family, `url(${font.url})`);
          await fontFace.load();
          (document.fonts as any).add(fontFace);
          loadedFonts.add(font.family);
          resolve('loaded');
        } catch {
          console.warn(`[PosterStudio] Font failed to load: ${font.family}`);
          if (typeof window !== 'undefined') useCanvasStore.getState().addFailedFont(font.family);
          resolve('failed');
        }
      })();
    }
  });

  fontLoadCache.set(font.family, promise);
  promise.finally(() => fontLoadCache.delete(font.family));
  return promise;
}

export async function loadFontBatch(fonts: FontDefinition[]): Promise<{ family: string; status: 'loaded' | 'failed' }[]> {
  const results = await Promise.allSettled(fonts.map((f) => loadFont(f)));
  return results.map((r, i) => ({
    family: fonts[i].family,
    status: r.status === 'fulfilled' ? r.value : 'failed',
  }));
}

export function isFontLoaded(family: string): boolean {
  return loadedFonts.has(family);
}

/** Smart Font Metrics Cache for malayalam/english text measurement */
const metricsCache = new Map<string, { width: number; height: number; lines: number }>();

function formatFontFamilySpec(fontFamily: string): string {
  const trimmed = (fontFamily || 'Inter').trim();
  if (/["',]/.test(trimmed)) return trimmed;
  return `"${trimmed}", "Noto Sans Malayalam", "Inter", sans-serif`;
}

export function measureText(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: number = 400,
  maxWidth?: number,
  lineHeight: number = 1.2
): { width: number; height: number; lines: number } {
  const cacheKey = `${text}|${fontFamily}|${fontSize}|${fontWeight}|${maxWidth ?? 'nomax'}|${lineHeight}`;
  if (metricsCache.has(cacheKey)) return metricsCache.get(cacheKey)!;

  if (typeof document === 'undefined') return { width: 0, height: 0, lines: 1 };

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: 0, height: 0, lines: 1 };

  ctx.font = `${fontWeight} ${fontSize}px ${formatFontFamilySpec(fontFamily)}`;

  const paragraphs = (text || '').split('\n');
  let lines = 0;
  let maxLineWidth = 0;

  paragraphs.forEach((paragraph) => {
    if (!maxWidth) {
      lines++;
      maxLineWidth = Math.max(maxLineWidth, ctx.measureText(paragraph).width);
      return;
    }

    const words = paragraph.split(' ');
    let currentLine = '';

    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        maxLineWidth = Math.max(maxLineWidth, ctx.measureText(currentLine).width);
        currentLine = word;
        lines++;
      } else {
        currentLine = testLine;
      }
    });

    lines++;
    maxLineWidth = Math.max(maxLineWidth, ctx.measureText(currentLine).width);
  });

  lines = Math.max(1, lines);
  const result = {
    width: Math.ceil(maxLineWidth),
    height: Math.ceil(fontSize * lineHeight * lines),
    lines,
  };
  metricsCache.set(cacheKey, result);
  return result;
}

export interface AutoShrinkOptions {
  text: string;
  fontFamily?: string;
  baseFontSize: number;
  fontWeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  maxLines?: number;
  lineHeight?: number;
  minFontSize?: number;
}

export function computeAutoShrinkFontSize({
  text,
  fontFamily = 'Poppins',
  baseFontSize,
  fontWeight = 400,
  maxWidth,
  maxHeight,
  maxLines,
  lineHeight = 1.2,
  minFontSize = 12,
}: AutoShrinkOptions): number {
  if (!text || !maxWidth || maxWidth <= 0 || typeof document === 'undefined') {
    return baseFontSize;
  }

  const effectiveMin = Math.min(minFontSize, baseFontSize);
  let low = effectiveMin;
  let high = Math.max(effectiveMin, Math.round(baseFontSize));
  let best = effectiveMin;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const metrics = measureText(text, fontFamily, mid, fontWeight, maxWidth, lineHeight);
    const fitsWidth = metrics.width <= maxWidth;
    const fitsHeight = !maxHeight || maxHeight <= 0 || metrics.height <= maxHeight;
    const fitsLines = !maxLines || maxLines <= 0 || metrics.lines <= maxLines;

    if (fitsWidth && fitsHeight && fitsLines) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

export function clearMetricsCache() {
  metricsCache.clear();
}

/**
 * Basic missing glyph detection for Malayalam.
 * Renders a specific Malayalam text and compares its width against a generic fallback.
 * If the font is missing the glyphs, it often renders as boxes (.notdef) or falls back to a different width.
 * This is a heuristic and may not be 100% accurate without pixel-level comparison, but works decently.
 */
export function checkMalayalamSupport(fontFamily: string): boolean {
  if (typeof document === 'undefined') return true;
  
  const testString = 'മലയാളം'; // "Malayalam" in ML script
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  // Measure in the target font, explicitly disabling fallbacks as much as possible
  ctx.font = `20px "${fontFamily}"`;
  const targetWidth = ctx.measureText(testString).width;
  
  // Measure in a known missing-glyph scenario or fallback
  ctx.font = `20px "Courier New"`;
  const fallbackWidth = ctx.measureText(testString).width;
  
  // If the widths are identically matching standard monospace fallbacks, it's highly likely missing
  // Or we can just log it for now. True pixel diffing is expensive.
  return targetWidth !== fallbackWidth;
}
