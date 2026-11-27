import { supabase } from '@/core/config/supabase';
import { uploadService } from './uploadService';
import {
  runMediaBatchUpload,
  type UploadMediaBatchParams,
  type UploadMediaBatchResult,
} from './mediaBatchUploadCore';

export {
  abortableSleep,
  buildMediaFingerprint,
  cleanMediaFileTitle,
  convertImageToDualWebp,
  generateUniqueRenderHash,
  runMediaBatchUpload,
  withRetry,
  type BatchMediaProgress,
  type MediaBatchUploadDeps,
  type UploadMediaBatchParams,
  type UploadMediaBatchResult,
} from './mediaBatchUploadCore';

/**
 * Converts a folder or multi-selection of images to Dual WebP in the browser,
 * uploads in controlled concurrency to Cloudflare R2 in chunks of `batchSize`,
 * and saves each batch with a single bulk insert into `generated_assets`.
 */
export async function uploadMediaFilesInBatches(
  params: UploadMediaBatchParams,
): Promise<UploadMediaBatchResult> {
  return runMediaBatchUpload(params, {
    uploadObject: ({ blob, festivalId, tenantId, extension, signal }) =>
      uploadService.uploadAsset(
        blob,
        'generated_asset',
        festivalId,
        tenantId,
        'public',
        extension,
        undefined,
        undefined,
        signal,
      ),
    insertAssets: async (rows) => {
      const { error } = await supabase.from('generated_assets').insert(rows);
      if (error) throw new Error(error.message || 'Database bulk insert failed');
    },
    deleteObject: (objectKey) => uploadService.deleteObject(objectKey),
  });
}
