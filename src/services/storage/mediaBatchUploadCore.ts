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

export interface UploadedObjectRef {
  object_key: string;
  file_url: string;
}

export interface MediaBatchUploadDeps {
  convertToDualWebp?: (file: File) => Promise<{
    hdBlob: Blob;
    hdExt: string;
    thumbBlob: Blob | null;
  }>;
  uploadObject: (args: {
    blob: Blob;
    festivalId: string;
    tenantId: string;
    extension: string;
    signal?: AbortSignal;
  }) => Promise<UploadedObjectRef>;
  insertAssets: (rows: Array<Record<string, unknown>>) => Promise<void>;
  deleteObject: (objectKey: string) => Promise<void>;
}

const IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp|avif|gif|bmp)$/i;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_CONCURRENCY = 3;
const HD_MAX_EDGE = 2048;
const THUMB_MAX_EDGE = 480;

export function generateUniqueRenderHash(prefix = 'manual_media'): string {
  const uuid = typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}_${Math.random().toString(36).slice(2, 6)}`;
  return `${prefix}_${uuid}`;
}

export function buildMediaFingerprint(file: Pick<File, 'name' | 'size'>): string {
  return `${String(file.name || '').trim().toLowerCase()}::${Number(file.size || 0)}`;
}

export function cleanMediaFileTitle(fileName: string, baseTitle?: string): string {
  const stem = String(fileName || '')
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
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

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Upload cancelled', 'AbortError');
  }
  const err = new Error('Upload cancelled');
  err.name = 'AbortError';
  return err;
}

function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (err as { name?: string } | null)?.name === 'AbortError';
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal, attempts = 3): Promise<T> {
  const safeAttempts = Math.max(1, Math.floor(Number.isFinite(attempts) ? attempts : 1));
  let lastErr: unknown;
  for (let i = 0; i < safeAttempts; i++) {
    if (signal?.aborted) throw createAbortError();
    try {
      return await fn();
    } catch (err) {
      if (isAbortError(err, signal)) throw err;
      lastErr = err;
      if (i < safeAttempts - 1) {
        await abortableSleep(500 * Math.pow(3, i), signal);
      }
    }
  }
  throw lastErr;
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
  if (!source.width || !source.height || source.width <= 0 || source.height <= 0) {
    throw new Error('Invalid image dimensions');
  }
  const maxDim = Math.max(source.width, source.height);
  const scale = maxDim > maxEdge ? maxEdge / maxDim : 1;
  const targetW = Math.max(1, Math.round(source.width * scale));
  const targetH = Math.max(1, Math.round(source.height * scale));

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

export async function runMediaBatchUpload(
  {
    files,
    festivalId,
    tenantId,
    baseTitle,
    existingFingerprints,
    batchSize = DEFAULT_BATCH_SIZE,
    concurrency = DEFAULT_CONCURRENCY,
    signal,
    onProgress,
  }: UploadMediaBatchParams,
  deps: MediaBatchUploadDeps,
): Promise<UploadMediaBatchResult> {
  const safeBatchSize = Math.max(1, Math.floor(Number.isFinite(batchSize) ? batchSize : DEFAULT_BATCH_SIZE));
  const safeConcurrency = Math.max(1, Math.floor(Number.isFinite(concurrency) ? concurrency : DEFAULT_CONCURRENCY));
  const convert = deps.convertToDualWebp || convertImageToDualWebp;

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
  const totalBatches = Math.max(1, Math.ceil(total / safeBatchSize));
  let completed = 0;
  let failed = 0;
  let cancelled = false;
  let lastBatchIndex = 0;
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

    lastBatchIndex = batchIdx + 1;
    const start = batchIdx * safeBatchSize;
    const chunk = queue.slice(start, start + safeBatchSize);
    const batchRows: Array<Record<string, unknown>> = [];
    const batchUploadedKeys: string[] = [];
    let batchUploadedCount = 0;
    let cursor = 0;

    const workerCount = Math.min(safeConcurrency, chunk.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < chunk.length) {
        if (signal?.aborted) {
          cancelled = true;
          return;
        }
        const idx = cursor++;
        const file = chunk[idx];
        emit(lastBatchIndex, file.name);

        try {
          const { hdBlob, hdExt, thumbBlob } = await convert(file);
          const hdMeta = await withRetry(
            () => deps.uploadObject({
              blob: hdBlob,
              festivalId,
              tenantId,
              extension: hdExt,
              signal,
            }),
            signal,
          );

          const renderHash = generateUniqueRenderHash('manual_media');
          const title = cleanMediaFileTitle(file.name, baseTitle);
          const itemRows: Array<Record<string, unknown>> = [
            {
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
            },
          ];
          const itemKeys: string[] = [hdMeta.object_key];

          if (thumbBlob) {
            try {
              const thumbMeta = await withRetry(
                () => deps.uploadObject({
                  blob: thumbBlob,
                  festivalId,
                  tenantId,
                  extension: 'webp',
                  signal,
                }),
                signal,
              );
              itemKeys.push(thumbMeta.object_key);
              itemRows.push({
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
            } catch (thumbErr) {
              if (isAbortError(thumbErr, signal)) {
                cancelled = true;
                throw thumbErr;
              }
              // Keep HD upload even if optional non-abort thumbnail upload fails
            }
          }

          batchRows.push(...itemRows);
          batchUploadedKeys.push(...itemKeys);
          batchUploadedCount++;
          emit(lastBatchIndex, file.name);
        } catch (err) {
          if (isAbortError(err, signal)) {
            cancelled = true;
            return;
          }
          failed++;
          errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Upload failed'}`);
          emit(lastBatchIndex, file.name);
        }
      }
    });

    await Promise.all(workers);

    if (batchRows.length > 0) {
      try {
        await withRetry(() => deps.insertAssets(batchRows), signal);
        completed += batchUploadedCount;
      } catch (dbErr) {
        if (isAbortError(dbErr, signal)) {
          cancelled = true;
        }
        failed += batchUploadedCount;
        errors.push(`Batch ${lastBatchIndex} DB save failed: ${dbErr instanceof Error ? dbErr.message : 'Insert failed'}`);
        if (batchUploadedKeys.length > 0) {
          await Promise.allSettled(batchUploadedKeys.map((objectKey) => deps.deleteObject(objectKey)));
        }
      }
      emit(lastBatchIndex, '');
    }

    if (cancelled || signal?.aborted) {
      cancelled = true;
      break;
    }
  }

  emit(lastBatchIndex, '');
  return { completed, failed, skipped, cancelled, errors };
}
