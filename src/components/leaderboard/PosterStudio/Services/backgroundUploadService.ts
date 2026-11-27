import { FILE_LIMITS, uploadService } from '../../../../services/storage/uploadService';
import { compressImage } from '../Utils/imageCompressor';

const MAX_BACKGROUND_DIMENSION = 4096;
const EXPORT_SCALE = 2;

export function formatBackgroundSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function throwIfUploadAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Background upload was cancelled. Choose the image again to retry.');
  error.name = 'AbortError';
  throw error;
}

export function getBackgroundExtension(contentType: string): string {
  switch (contentType.toLowerCase()) {
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/jpeg': return 'jpg';
    default: throw new Error('Choose a JPG, PNG, or WebP image.');
  }
}

export async function uploadPosterBackground(
  file: File,
  options: {
    festivalId: string;
    tenantId: string;
    templateWidth: number;
    templateHeight: number;
    backgroundScale?: number;
    signal?: AbortSignal;
    onPhase?: (phase: 'preparing' | 'uploading') => void;
    onPrepared?: (uploadedFile: File) => void;
    onProgress?: (progress: number) => void;
  },
) {
  options.onPhase?.('preparing');
  throwIfUploadAborted(options.signal);
  const extension = getBackgroundExtension(file.type);
  if (file.size > FILE_LIMITS.template) {
    throw new Error(`File size exceeds limit for template. Max allowed is ${FILE_LIMITS.template / 1024 / 1024}MB.`);
  }
  const scale = Math.max(1, options.backgroundScale || 1);
  const width = Math.min(MAX_BACKGROUND_DIMENSION, Math.max(1, Math.ceil(options.templateWidth * EXPORT_SCALE * scale)));
  const height = Math.min(MAX_BACKGROUND_DIMENSION, Math.max(1, Math.ceil(options.templateHeight * EXPORT_SCALE * scale)));
  const preparedFile = await compressImage(file, width, height);
  throwIfUploadAborted(options.signal);
  options.onPrepared?.(preparedFile);
  options.onPhase?.('uploading');
  const metadata = await uploadService.uploadTemplate(
    preparedFile,
    options.festivalId,
    options.tenantId,
    'background',
    extension,
    options.onProgress,
    options.signal,
  );

  return { metadata, originalFile: file, uploadedFile: preparedFile };
}
