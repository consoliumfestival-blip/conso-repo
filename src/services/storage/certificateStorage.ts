import { uploadService } from './uploadService';
import { storageService, FileMetadata } from './storageService';

export const certificateStorage = {
  /**
   * Uploads a generated certificate PDF to R2
   */
  async saveCertificate(file: Blob, festivalId: string, tenantId: string): Promise<FileMetadata> {
    return await uploadService.uploadCertificate(file, festivalId, tenantId);
  },

  /**
   * Generates a temporary signed URL to view a certificate
   */
  async getCertificateUrl(objectKey: string): Promise<string> {
    return await storageService.getPresignedUrl(objectKey, 'application/pdf', 'download');
  }
};
