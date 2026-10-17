import { uploadService } from './uploadService';
import { FileMetadata } from './storageService';

export const posterStorage = {
  /**
   * Uploads a generated poster to R2 and returns its metadata (including public URL)
   */
  async savePoster(file: Blob, festivalId: string, tenantId: string): Promise<FileMetadata> {
    return await uploadService.uploadPoster(file, festivalId, tenantId);
  },

  /**
   * Generates a unique key for caching posters locally/in DB
   */
  getPosterCacheKey(registrationId: string): string {
    return `poster_${registrationId}`;
  }
};
