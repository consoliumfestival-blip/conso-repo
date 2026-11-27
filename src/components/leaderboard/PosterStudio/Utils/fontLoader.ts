import { useCanvasStore } from '../Stores/canvasStore';
import {
  buildGoogleFontsCss2Url,
  getFontLoadSampleText,
  parseFontWeights,
} from './googleFontCss2';

export interface FontDefinition {
  family: string;
  url?: string;
  resolveUrl?: () => Promise<string>;
  cacheKey?: string;
  weightRange?: string;
  category?: string;
  weights?: string;
}

export const ML_FONTS: FontDefinition[] = [
  { family: 'Noto Sans Malayalam', url: '/assets/noto-sans-malayalam-malayalam-wght-normal-C3telsSh.woff2', weightRange: '100 900', category: 'Malayalam', weights: '300,400,500,600,700' },
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
  { family: 'Outfit', url: '/fonts/Outfit_400Regular.ttf', category: 'Sans / Modern', weights: '400,500,600,700' },
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
].map(f => ({ ...f, url: f.url || 'https://fonts.gstatic.com/' }));

EN_FONTS.unshift({ family: 'Authenia Textured', category: 'Display / Poster', url: '/fonts/Authenia-Textured.ttf' });

const loadedFonts = new Set<string>();
const loadedFontKeys = new Set<string>();
const fontLoadCache = new Map<string, Promise<'loaded' | 'failed'>>();

function fontIdentity(font: FontDefinition): string {
  return `${font.family}|${font.cacheKey || font.url || font.family}|${font.weights || ''}`;
}

const GOOGLE_FONT_TIMEOUT_MS = 8000;
let googlePreconnectInjected = false;

function ensureGoogleFontPreconnect() {
  if (googlePreconnectInjected || typeof document === 'undefined' || !document.head) return;
  googlePreconnectInjected = true;
  const hosts = [
    { href: 'https://fonts.googleapis.com', crossOrigin: false },
    { href: 'https://fonts.gstatic.com', crossOrigin: true },
  ];
  for (const host of hosts) {
    if (document.head.querySelector(`link[rel="preconnect"][href="${host.href}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = host.href;
    if (host.crossOrigin) link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function loadGoogleFontStylesheet(url: string, linkId: string, timeoutMs = GOOGLE_FONT_TIMEOUT_MS): Promise<void> {
  if (typeof document === 'undefined' || !document.head) {
    return Promise.reject(new Error('Document head is unavailable'));
  }
  const existing = document.head.querySelector(`link[data-poster-font-id="${linkId}"]`) as HTMLLinkElement | null;
  if (existing && existing.dataset.loaded === '1') {
    return Promise.resolve();
  }
  if (existing && existing.dataset.loaded === '0') {
    existing.remove();
  }

  return new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.crossOrigin = 'anonymous';
    link.dataset.posterFontId = linkId;
    link.dataset.loaded = '0';

    const cleanup = () => {
      clearTimeout(timer);
      link.onload = null;
      link.onerror = null;
    };

    const timer = setTimeout(() => {
      cleanup();
      link.remove();
      reject(new Error(`Google Font stylesheet timed out: ${url}`));
    }, timeoutMs);

    link.onload = () => {
      cleanup();
      link.dataset.loaded = '1';
      resolve();
    };
    link.onerror = () => {
      cleanup();
      link.remove();
      reject(new Error(`Google Font stylesheet failed: ${url}`));
    };

    document.head.appendChild(link);
  });
}

async function loadGoogleFontViaCss2(font: FontDefinition): Promise<'loaded' | 'failed'> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 'failed';
  ensureGoogleFontPreconnect();

  const weights = parseFontWeights(font.weights);
  const primaryWeight = weights.includes(400) ? 400 : weights[0];
  const sampleText = getFontLoadSampleText(font.category);

  // Fast path: already available in document.fonts (e.g. bundled Poppins/Inter/Montserrat or cached)
  if (document.fonts && typeof document.fonts.check === 'function') {
    try {
      if (document.fonts.check(`${primaryWeight} 24px "${font.family}"`, sampleText)) {
        loadedFonts.add(font.family);
        return 'loaded';
      }
    } catch {
      // Proceed to stylesheet load
    }
  }

  const cssUrl = buildGoogleFontsCss2Url(font.family, font.weights);
  const linkId = font.family.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + weights.join('_');

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await loadGoogleFontStylesheet(cssUrl, linkId, GOOGLE_FONT_TIMEOUT_MS);
      if (document.fonts && typeof document.fonts.load === 'function') {
        const weightsToPrime = weights.length <= 2 ? weights : [primaryWeight, weights[weights.length - 1]];
        await withTimeout(
          Promise.all(weightsToPrime.map((w) => document.fonts.load(`${w} 24px "${font.family}"`, sampleText))),
          GOOGLE_FONT_TIMEOUT_MS,
          `Font face load (${font.family})`,
        );
      }
      loadedFonts.add(font.family);
      return 'loaded';
    } catch (err) {
      if (attempt === 1) {
        console.warn(`[PosterStudio] Google Font failed to load: ${font.family}`, err);
        useCanvasStore.getState().addFailedFont(font.family);
        return 'failed';
      }
    }
  }
  return 'failed';
}

export async function loadFont(font: FontDefinition): Promise<'loaded' | 'failed'> {
  const identity = fontIdentity(font);
  if (loadedFontKeys.has(identity)) return 'loaded';

  // Deduplicate simultaneous load calls for same font
  if (fontLoadCache.has(identity)) {
    return fontLoadCache.get(identity)!;
  }

  const isGoogleFont = Boolean(font.url?.includes('fonts.gstatic') || font.url?.includes('fonts.googleapis'));
  const promise = isGoogleFont
    ? loadGoogleFontViaCss2(font)
    : (async (): Promise<'loaded' | 'failed'> => {
        try {
          const url = font.resolveUrl ? await font.resolveUrl() : font.url;
          if (!url) throw new Error('Font source URL is missing.');
          const fontFace = new FontFace(font.family, `url(${url})`, { weight: font.weightRange || 'normal' });
          await withTimeout(fontFace.load(), GOOGLE_FONT_TIMEOUT_MS, `Custom font load (${font.family})`);
          (document.fonts as any).add(fontFace);
          loadedFonts.add(font.family);
          return 'loaded';
        } catch (err) {
          console.warn(`[PosterStudio] Font failed to load: ${font.family}`, err);
          if (typeof window !== 'undefined') useCanvasStore.getState().addFailedFont(font.family);
          return 'failed';
        }
      })();

  fontLoadCache.set(identity, promise);
  promise.then((status) => {
    if (status === 'loaded') loadedFontKeys.add(identity);
    fontLoadCache.delete(identity);
  });
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
