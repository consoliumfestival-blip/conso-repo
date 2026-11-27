import { storageProvider, FileMetadata, KeyedVerifiedStorageProvider, StorageOperation, StorageUploadInput, VerifiedStorageObject, Visibility } from '../../providers/storage';

export type { AssetType, FileMetadata, Visibility } from '../../providers/storage';

function getKeyedVerifiedProvider(): KeyedVerifiedStorageProvider {
  const provider = storageProvider as typeof storageProvider & Partial<KeyedVerifiedStorageProvider>;
  if (
    provider.name !== 'r2'
    || typeof provider.uploadAtKey !== 'function'
    || typeof provider.verifyObjectMetadata !== 'function'
  ) {
    throw new Error('Resumable Poster Studio delivery requires the configured R2 storage provider.');
  }
  return provider as typeof storageProvider & KeyedVerifiedStorageProvider;
}

export const storageService = {
  providerName: storageProvider.name,
  bucketName: storageProvider.bucketName,

  async verifyPosterObject(
    objectKey: string,
    expectedContentType: string,
    expectedSize: number,
  ): Promise<VerifiedStorageObject | null> {
    return getKeyedVerifiedProvider().verifyObjectMetadata(objectKey, expectedContentType, expectedSize);
  },

  async uploadPosterObjectAtKey(
    input: StorageUploadInput & { expectedSize: number },
  ): Promise<VerifiedStorageObject> {
    return getKeyedVerifiedProvider().uploadAtKey(input);
  },

  async upload(
    file: Blob | File,
    objectKey: string,
    contentType: string,
    visibility: Visibility,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal,
  ) {
    return storageProvider.upload({
      file,
      objectKey,
      contentType,
      visibility,
      onProgress,
      signal: storageProvider.name === 'r2' ? signal : undefined,
    });
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
