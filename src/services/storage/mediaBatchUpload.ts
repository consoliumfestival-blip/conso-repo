import { supabase } from '@/core/config/supabase';
import { uploadService } from './uploadService';

export interface BatchMediaProgress {
  batchIndex: number;
  totalBatches: number;
  completed: number;
  failed: number;
  skipped: number;
  total: number;
  currentFileName: string;
  errors: string[];
}

export interface UploadMediaBatchParams {
  files: File[];
  festivalId: string;
  tenantId: string;
  baseTitle?: string;
  existingFingerprints?: Set<string>;
  batchSize?: number;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (progress: BatchMediaProgress) => void;
}

export interface UploadMediaBatchResult {
  completed: number;
  failed: number;
  skipped: number;
  cancelled: boolean;
  errors: string[];
}

const IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp|avif|gif|bmp)$/i;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_CONCURRENCY = 3;
const HD_MAX_EDGE = 2048;
const THUMB_MAX_EDGE = 480;

export function buildMediaFingerprint(file: Pick<File, 'name' | 'size'>): string {
  return `${String(file.name || '').trim().toLowerCase()}::${Number(file.size || 0)}`;
}

export function cleanMediaFileTitle(fileName: string, baseTitle?: string): string {
  const stem = String(fileName || '')
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanName = stem || 'Media Photo';
  const prefix = String(baseTitle || '').trim();
  if (!prefix) return cleanName;
  return `${prefix} - ${cleanName}`;
}

function isSupportedImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  return IMAGE_EXTENSION_RE.test(file.name || '');
}

async function decodeImageSource(file: File): Promise<{
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  release: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
      release: () => {
        try { bitmap.close(); } catch {}
      },
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Unable to decode ${file.name}`));
      el.src = objectUrl;
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

function renderScaledWebp(
  source: { width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void },
  maxEdge: number,
  quality: number,
): Promise<Blob | null> {
  const maxDim = Math.max(source.width || 1, source.height || 1);
  const scale = maxDim > maxEdge ? maxEdge / maxDim : 1;
  const targetW = Math.max(1, Math.round((source.width || 1) * scale));
  const targetH = Math.max(1, Math.round((source.height || 1) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.width = 0;
    canvas.height = 0;
    return Promise.resolve(null);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  source.draw(ctx, targetW, targetH);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        resolve(blob && blob.type === 'image/webp' ? blob : null);
      },
      'image/webp',
      quality,
    );
  });
}

/**
 * Converts a local image File into both HD and Thumb WebP blobs strictly inside
 * the browser without sending uncompressed originals to Supabase.
 */
export async function convertImageToDualWebp(file: File): Promise<{
  hdBlob: Blob;
  hdExt: string;
  thumbBlob: Blob | null;
}> {
  if (typeof document === 'undefined') {
    const ext = (file.name.split('.').pop() || 'webp').toLowerCase();
    return { hdBlob: file, hdExt: ext, thumbBlob: null };
  }

  const source = await decodeImageSource(file);
  try {
    const hdWebp = await renderScaledWebp(source, HD_MAX_EDGE, 0.86);
    const thumbWebp = hdWebp ? await renderScaledWebp(source, THUMB_MAX_EDGE, 0.78) : null;
    if (hdWebp) {
      return { hdBlob: hdWebp, hdExt: 'webp', thumbBlob: thumbWebp };
    }
    const fallbackExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
    return { hdBlob: file, hdExt: fallbackExt, thumbBlob: null };
  } finally {
    source.release();
  }
}

async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
    try {
      return await fn();
    } catch (err) {
      if ((err as Error)?.name === 'AbortError' || signal?.aborted) throw err;
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(3, i)));
      }
    }
  }
  throw lastErr;
}

/**
 * Converts a folder or multi-selection of images to Dual WebP in the browser,
 * uploads in controlled concurrency to Cloudflare R2 in chunks of `batchSize`,
 * and saves each batch with a single bulk insert into `generated_assets`.
 */
export async function uploadMediaFilesInBatches({
  files,
  festivalId,
  tenantId,
  baseTitle,
  existingFingerprints,
  batchSize = DEFAULT_BATCH_SIZE,
  concurrency = DEFAULT_CONCURRENCY,
  signal,
  onProgress,
}: UploadMediaBatchParams): Promise<UploadMediaBatchResult> {
  const seen = new Set<string>(existingFingerprints ? Array.from(existingFingerprints) : []);
  const queue: File[] = [];
  let skipped = 0;

  for (const file of files) {
    if (!isSupportedImageFile(file)) {
      skipped++;
      continue;
    }
    const fp = buildMediaFingerprint(file);
    if (seen.has(fp)) {
      skipped++;
      continue;
    }
    seen.add(fp);
    queue.push(file);
  }

  const total = queue.length;
  const totalBatches = Math.max(1, Math.ceil(total / batchSize));
  let completed = 0;
  let failed = 0;
  let cancelled = false;
  const errors: string[] = [];

  const emit = (batchIndex: number, currentFileName: string) => {
    onProgress?.({
      batchIndex,
      totalBatches,
      completed,
      failed,
      skipped,
      total,
      currentFileName,
      errors: [...errors],
    });
  };

  if (total === 0) {
    emit(0, '');
    return { completed: 0, failed: 0, skipped, cancelled: false, errors: [] };
  }

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    if (signal?.aborted) {
      cancelled = true;
      break;
    }

    const start = batchIdx * batchSize;
    const chunk = queue.slice(start, start + batchSize);
    const batchRows: Array<Record<string, unknown>> = [];
    let cursor = 0;

    const workerCount = Math.min(concurrency, chunk.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < chunk.length) {
        if (signal?.aborted) return;
        const idx = cursor++;
        const file = chunk[idx];
        emit(batchIdx + 1, file.name);

        try {
          const { hdBlob, hdExt, thumbBlob } = await convertImageToDualWebp(file);
          const hdMeta = await withRetry(
            () => uploadService.uploadAsset(
              hdBlob,
              'generated_asset',
              festivalId,
              tenantId,
              'public',
              hdExt,
              undefined,
              undefined,
              signal,
            ),
            signal,
          );

          const renderHash = `manual_media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const title = cleanMediaFileTitle(file.name, baseTitle);

          batchRows.push({
            tenant_id: tenantId,
            festival_id: festivalId,
            asset_type: 'poster',
            render_hash: renderHash,
            resolution: 'hd',
            storage_path: hdMeta.object_key,
            public_url: hdMeta.file_url,
            event_name: title,
            visibility_status: 'published',
            is_current: true,
          });

          if (thumbBlob) {
            try {
              const thumbMeta = await withRetry(
                () => uploadService.uploadAsset(
                  thumbBlob,
                  'generated_asset',
                  festivalId,
                  tenantId,
                  'public',
                  'webp',
                  undefined,
                  undefined,
                  signal,
                ),
                signal,
              );
              batchRows.push({
                tenant_id: tenantId,
                festival_id: festivalId,
                asset_type: 'poster',
                render_hash: renderHash,
                resolution: 'thumb',
                storage_path: thumbMeta.object_key,
                public_url: thumbMeta.file_url,
                event_name: title,
                visibility_status: 'published',
                is_current: true,
              });
            } catch {
              // Keep HD upload even if optional thumbnail upload fails
            }
          }

          completed++;
          emit(batchIdx + 1, file.name);
        } catch (err) {
          if ((err as Error)?.name === 'AbortError' || signal?.aborted) {
            cancelled = true;
            return;
          }
          failed++;
          errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Upload failed'}`);
          emit(batchIdx + 1, file.name);
        }
      }
    });

    await Promise.all(workers);

    if (batchRows.length > 0) {
      const { error } = await supabase.from('generated_assets').insert(batchRows);
      if (error) {
        errors.push(`Batch ${batchIdx + 1} DB save failed: ${error.message}`);
      }
    }

    if (signal?.aborted) {
      cancelled = true;
      break;
    }
  }

  emit(totalBatches, '');
  return { completed, failed, skipped, cancelled, errors };
}
