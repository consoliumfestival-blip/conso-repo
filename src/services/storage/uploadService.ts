import { AssetType, FileMetadata, Visibility } from '../../providers/storage';
import { storageService } from './storageService';

// Constants for limits
export const FILE_LIMITS = {
  poster: 10 * 1024 * 1024, // 10MB
  certificate: 20 * 1024 * 1024, // 20MB
  logo: 5 * 1024 * 1024, // 5MB
  profile: 5 * 1024 * 1024, // 5MB
  template: 25 * 1024 * 1024, // 25MB
  export: 50 * 1024 * 1024, // 50MB
  generated_asset: 50 * 1024 * 1024, // 50MB
  result: 10 * 1024 * 1024, // 10MB
  backup: 100 * 1024 * 1024, // 100MB
  font: 15 * 1024 * 1024, // 15MB
};

const BUCKET_NAME = process.env.EXPO_PUBLIC_R2_BUCKET || 'sahi-assets';
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const uploadService = {
  /**
   * Generates a safe file name using UUID to avoid path traversal or special chars
   */
  generateSafeFileName(extension: string | any): string {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    let extStr = extension;
    if (Array.isArray(extension)) {
      extStr = extension.pop();
    }
    if (typeof extStr !== 'string') {
      extStr = 'jpg';
    }
    
    extStr = extStr.toLowerCase().replace(/[^a-z0-9]/gi, '');
    if (!extStr) extStr = 'jpg';
    
    // e.g. 1682348123-abc123.jpg
    return `${timestamp}-${randomStr}.${extStr}`;
  },

  /**
   * Internal generic upload
   */
  async uploadAsset(
    file: Blob | File,
    assetType: AssetType,
    festivalId: string,
    tenantId: string,
    visibility: Visibility,
    extension: string,
    subFolder?: string,
    onProgress?: (progress: number) => void
  ): Promise<FileMetadata> {
    const size = file.size;
    const limit = FILE_LIMITS[assetType] || 10 * 1024 * 1024;
    const contentType = file.type || 'application/octet-stream';
    
    if (size > limit) {
      throw new Error(`File size exceeds limit for ${assetType}. Max allowed is ${limit / 1024 / 1024}MB.`);
    }

    if ((assetType === 'profile' || assetType === 'logo' || assetType === 'poster') && !ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw new Error('Only JPG, PNG, and WEBP image uploads are allowed.');
    }
    // Note: Fonts can have varying content types (font/woff2, application/x-font-ttf, etc.), so we skip explicit content-type validation for 'font'.

    const safeFileName = this.generateSafeFileName(extension);
    let objectKey = '';
    
    if (assetType === 'template') {
      objectKey = `templates/${subFolder || 'general'}/${safeFileName}`;
    } else if (assetType === 'profile') {
      if (!subFolder) throw new Error('participantId (subFolder) is required for profile photos');
      objectKey = `festivals/${festivalId}/profiles/${subFolder}/${safeFileName}`;
    } else if (assetType === 'font') {
      if (subFolder === 'tenant') {
        objectKey = `tenants/${tenantId}/fonts/${safeFileName}`;
      } else {
        objectKey = `festivals/${festivalId}/fonts/${safeFileName}`;
      }
    } else if (assetType === 'generated_asset') {
      objectKey = `festivals/${festivalId}/posters/generated_${safeFileName}`;
    } else {
      objectKey = `festivals/${festivalId}/${assetType}s/${safeFileName}`;
    }

    const uploadResult = await storageService.upload(file, objectKey, contentType, visibility, onProgress);
    const isPublic = visibility === 'public';

    const metadata: FileMetadata = {
      tenant_id: tenantId,
      festival_id: festivalId,
      asset_type: assetType,
      file_url: uploadResult.fileUrl,
      bucket_name: storageService.bucketName || BUCKET_NAME,
      object_key: uploadResult.objectKey,
      content_type: contentType,
      file_size: size,
      visibility,
      is_public: isPublic,
    };

    if (assetType === 'generated_asset') {
      return metadata;
    }

    return await storageService.saveMetadata(metadata);
  },

  async uploadPoster(file: Blob, festivalId: string, tenantId: string, onProgress?: (progress: number) => void) {
    return this.uploadAsset(file, 'poster', festivalId, tenantId, 'public', 'png', undefined, onProgress);
  },

  async uploadCertificate(file: Blob, festivalId: string, tenantId: string, onProgress?: (progress: number) => void) {
    return this.uploadAsset(file, 'certificate', festivalId, tenantId, 'signed', 'pdf', undefined, onProgress);
  },

  async uploadLogo(file: Blob, festivalId: string, tenantId: string, onProgress?: (progress: number) => void) {
    return this.uploadAsset(file, 'logo', festivalId, tenantId, 'public', 'png', undefined, onProgress);
  },

  async uploadProfilePhoto(file: Blob | File, festivalId: string, tenantId: string, participantId: string, extension: string, onProgress?: (progress: number) => void) {
    return this.uploadAsset(file, 'profile', festivalId, tenantId, 'public', extension, participantId, onProgress);
  },

  async deleteObject(objectKey: string) {
    await storageService.delete(objectKey);
  },

  async uploadTemplate(file: Blob, festivalId: string, tenantId: string, templateType: string, extension: string, onProgress?: (progress: number) => void) {
    return this.uploadAsset(file, 'template', festivalId, tenantId, 'signed', extension, templateType, onProgress);
  },

  async uploadExport(file: Blob, festivalId: string, tenantId: string, extension: string, onProgress?: (progress: number) => void) {
    return this.uploadAsset(file, 'export', festivalId, tenantId, 'private', extension, undefined, onProgress);
  },

  async uploadResult(file: Blob, festivalId: string, tenantId: string, extension: string, onProgress?: (progress: number) => void) {
    return this.uploadAsset(file, 'result', festivalId, tenantId, 'signed', extension, undefined, onProgress);
  },

  async uploadBackup(file: Blob, festivalId: string, tenantId: string, extension: string, onProgress?: (progress: number) => void) {
    return this.uploadAsset(file, 'backup', festivalId, tenantId, 'private', extension, undefined, onProgress);
  },

  async uploadFont(file: Blob, scope: 'tenant' | 'festival', festivalId: string, tenantId: string, extension: string, onProgress?: (progress: number) => void) {
    // We make fonts public so the editor can fetch them easily via CSS @font-face
    return this.uploadAsset(file, 'font', festivalId, tenantId, 'public', extension, scope, onProgress);
  },

  async uploadGeneratedAsset(file: Blob, festivalId: string, tenantId: string, onProgress?: (progress: number) => void) {
    return this.uploadAsset(file, 'generated_asset' as any, festivalId, tenantId, 'public', 'jpg', undefined, onProgress);
  }
};
