export interface UploadResponse {
  status: number;
  eTag: string | null;
}

export class R2UploadError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'R2UploadError';
  }
}

export async function recoverR2ObjectAfterCreateOnlyConflict<T>(
  error: unknown,
  verifyExisting: () => Promise<T | null>,
): Promise<T> {
  if (!(error instanceof R2UploadError) || error.status !== 412) throw error;
  const existing = await verifyExisting();
  if (existing) return existing;
  throw error;
}

export function uploadWithProgress(
  presignedUrl: string,
  file: Blob | File,
  contentType: string,
  onProgress?: (progress: number) => void,
  ifNoneMatch?: string,
  signal?: AbortSignal,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cleanup = () => signal?.removeEventListener('abort', abortUpload);
    const abortUpload = () => xhr.abort();
    const rejectAborted = () => {
      const error = new Error('R2 upload was cancelled. Choose the image again to retry.');
      error.name = 'AbortError';
      cleanup();
      reject(error);
    };

    if (signal?.aborted) {
      rejectAborted();
      return;
    }

    xhr.open('PUT', presignedUrl, true);
    xhr.setRequestHeader('Content-Type', contentType);
    if (ifNoneMatch) xhr.setRequestHeader('If-None-Match', ifNoneMatch);

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          status: xhr.status,
          eTag: xhr.getResponseHeader('etag'),
        });
        return;
      }
      reject(new R2UploadError(
        xhr.status,
        `R2 upload failed with status ${xhr.status}: ${xhr.responseText || 'No response body'}`,
      ));
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error(
        'R2 upload failed due to a network error. Check the R2 bucket CORS policy, presigned PUT permissions, and browser preflight response.',
      ));
    };
    xhr.onabort = rejectAborted;
    signal?.addEventListener('abort', abortUpload, { once: true });
    xhr.send(file);
  });
}
