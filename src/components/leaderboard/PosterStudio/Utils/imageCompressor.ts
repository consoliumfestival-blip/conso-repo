const MIN_IMAGE_SAVING_RATIO = 0.1;
const JPEG_AND_WEBP_QUALITY = 0.96;
const SKIP_REENCODE_BELOW_BYTES = 4 * 1024 * 1024;

type SizedImage = { size: number; type: string };

export function choosePreparedImage<T extends SizedImage>(
  original: T,
  prepared: T,
  minimumSavingRatio = MIN_IMAGE_SAVING_RATIO,
): T {
  if (original.type !== prepared.type || original.size <= 0 || prepared.size <= 0) return original;
  return prepared.size <= original.size * (1 - minimumSavingRatio) ? prepared : original;
}

async function decodeImage(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; dispose: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    if (typeof image.decode === 'function') {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('The selected image could not be decoded.'));
      });
    }
    if (image.naturalWidth < 1 || image.naturalHeight < 1) {
      throw new Error('The selected image has no decoded pixels.');
    }
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, mimeType: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: mimeType, quality });
  }

  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The browser could not prepare an optimized image.'));
    }, mimeType, quality);
  });
}

function getFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1) : '';
}

/**
 * Prepare a background upload without degrading already suitable images.
 * Lossy JPEG/WebP output is kept at high quality and only used when it reduces
 * the transfer by at least 10%. PNG remains PNG so its alpha channel survives.
 */
export async function compressImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality = JPEG_AND_WEBP_QUALITY,
): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
  if (!Number.isFinite(maxWidth) || maxWidth < 1 || !Number.isFinite(maxHeight) || maxHeight < 1) return file;

  const image = await decodeImage(file);
  try {
    const needsResize = image.width > maxWidth || image.height > maxHeight;
    if (!needsResize && (file.type === 'image/png' || file.size < SKIP_REENCODE_BELOW_BYTES)) return file;

    const ratio = needsResize ? Math.min(maxWidth / image.width, maxHeight / image.height) : 1;
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));
    const canvas: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });
    const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) return file;
    context.drawImage(image.image, 0, 0, width, height);

    let encoded: Blob;
    try {
      encoded = await canvasToBlob(canvas, file.type, file.type === 'image/png' ? 1 : quality);
    } catch {
      return file;
    }
    if (encoded.type !== file.type) return file;

    const prepared = new File(
      [encoded],
      file.name || `background.${getFileExtension(file.name) || 'img'}`,
      { type: file.type, lastModified: file.lastModified },
    );
    return choosePreparedImage(file, prepared);
  } finally {
    image.dispose();
  }
}
