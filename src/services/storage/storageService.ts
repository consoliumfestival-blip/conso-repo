import { storageProvider, FileMetadata, StorageOperation, Visibility } from '../../providers/storage';

export type { AssetType, FileMetadata, Visibility } from '../../providers/storage';

export const storageService = {
  providerName: storageProvider.name,
  bucketName: storageProvider.bucketName,

  async upload(
    file: Blob | File,
    objectKey: string,
    contentType: string,
    visibility: Visibility,
    onProgress?: (progress: number) => void,
  ) {
    return storageProvider.upload({ file, objectKey, contentType, visibility, onProgress });
  },

  async delete(objectKey: string): Promise<void> {
    await storageProvider.delete(objectKey);
  },

  async saveMetadata(metadata: FileMetadata): Promise<FileMetadata> {
    return storageProvider.saveMetadata(metadata);
  },

  async getUrl(objectKey: string, visibility: Visibility, contentType?: string): Promise<string> {
    return storageProvider.getUrl(objectKey, visibility, contentType);
  },

  async getPresignedUrl(objectKey: string, contentType: string, operation: StorageOperation = 'upload'): Promise<string> {
    if (operation === 'upload') {
      throw new Error('Use storageService.upload() for uploads.');
    }

    const url = await storageProvider.getUrl(
      objectKey,
      operation === 'download' ? 'signed' : 'private',
      contentType,
    );
    if (!url) throw new Error('Storage URL was not returned');
    return url;
  }
};
