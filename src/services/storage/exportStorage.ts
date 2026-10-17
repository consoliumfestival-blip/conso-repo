import { uploadService } from './uploadService';
import { storageService, FileMetadata } from './storageService';

export const exportStorage = {
  /**
   * Uploads an admin export (PDF/Excel) to R2
   */
  async saveExport(file: Blob, festivalId: string, tenantId: string, extension: 'pdf' | 'xlsx' | 'csv'): Promise<FileMetadata> {
    return await uploadService.uploadExport(file, festivalId, tenantId, extension);
  },

  /**
   * Generates a temporary signed URL to download an export
   */
  async getExportUrl(objectKey: string): Promise<string> {
    return await storageService.getPresignedUrl(objectKey, 'application/octet-stream', 'download');
  }
};
