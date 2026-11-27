import { supabase } from '../../core/config/supabase';
import { FileMetadata, KeyedVerifiedStorageProvider, StorageOperation, StorageProvider, StorageUploadInput, VerifiedStorageObject, Visibility } from './storageProvider';
import { recoverR2ObjectAfterCreateOnlyConflict, uploadWithProgress } from './r2UploadRequest';

const R2_BUCKET_NAME = process.env.EXPO_PUBLIC_R2_BUCKET || 'sahi-assets';
const R2_PUBLIC_DOMAIN = process.env.EXPO_PUBLIC_R2_PUB_DOMAIN || '';

type R2PresignResponse = {
  url?: string;
  publicUrl?: string | null;
  objectKey?: string;
  bucket?: string;
  exists?: boolean;
  contentType?: string | null;
  contentLength?: number | null;
  eTag?: string | null;
  error?: string;
};

export class R2StorageProvider implements StorageProvider, KeyedVerifiedStorageProvider {
  readonly name = 'r2';
  readonly bucketName = R2_BUCKET_NAME;

  private async invokePresign(
    objectKey: string,
    contentType: string,
    operation: StorageOperation,
  ): Promise<R2PresignResponse> {
    const { data, error } = await supabase.functions.invoke('r2-presign', {
      body: { objectKey, contentType, operation },
    });

    if (error) {
      throw new Error(`R2 ${operation} request failed: ${error.message}`);
    }

    return data ?? {};
  }

  private async verifyObject(objectKey: string, contentType: string): Promise<R2PresignResponse> {
    const verification = await this.invokePresign(objectKey, contentType, 'verify');
    if (!verification.exists) {
      throw new Error(`R2 upload verification failed: object was not found at ${objectKey}`);
    }
    return verification;
  }

  async verifyObjectMetadata(
    objectKey: string,
    expectedContentType: string,
    expectedSize: number,
  ): Promise<VerifiedStorageObject | null> {
    const verification = await this.invokePresign(objectKey, expectedContentType, 'verify');
    if (verification.error) {
      throw new Error('R2 object verification is unavailable. Retry when storage is reachable.');
    }
    if (!verification.exists) return null;
    if (
      verification.contentType !== expectedContentType
      || verification.contentLength !== expectedSize
      || !verification.eTag
    ) {
      throw new Error('An object already exists at this poster key with different metadata; it was left untouched.');
    }
    return {
      objectKey,
      contentType: verification.contentType,
      contentLength: verification.contentLength,
      eTag: verification.eTag,
    };
  }

  async uploadAtKey(
    input: StorageUploadInput & { expectedSize: number },
  ): Promise<VerifiedStorageObject> {
    if (!input.objectKey.trim() || !input.file.size || input.file.size !== input.expectedSize) {
      throw new TypeError('Poster upload key or expected file size is invalid.');
    }
    if (input.file.type && input.file.type !== input.contentType) {
      throw new TypeError('Poster file type does not match the upload content type.');
    }

    const { url } = await this.invokePresign(input.objectKey, input.contentType, 'upload');
    if (!url) throw new Error('R2 upload URL was not returned.');
    try {
      await uploadWithProgress(url, input.file, input.contentType, input.onProgress, '*');
    } catch (error) {
      return recoverR2ObjectAfterCreateOnlyConflict(error, () => this.verifyObjectMetadata(
        input.objectKey,
        input.contentType,
        input.expectedSize,
      ));
    }

    const verified = await this.verifyObjectMetadata(input.objectKey, input.contentType, input.expectedSize);
    if (!verified) throw new Error('R2 upload finished, but the saved object could not be verified.');
    return verified;
  }

  async upload(input: StorageUploadInput): Promise<{ fileUrl: string; objectKey: string }> {
    const { url, publicUrl } = await this.invokePresign(input.objectKey, input.contentType, 'upload');
    if (!url) throw new Error('R2 upload URL was not returned');

    const uploadUrl = new URL(url);
    console.info('R2 upload starting', {
      bucket: this.bucketName,
      objectKey: input.objectKey,
      uploadHost: uploadUrl.host,
      uploadPath: uploadUrl.pathname,
      publicUrl: publicUrl || null,
      contentType: input.contentType,
      fileSize: input.file.size,
    });

    const uploadResponse = await uploadWithProgress(url, input.file, input.contentType, input.onProgress, undefined, input.signal);
    const verification = await this.verifyObject(input.objectKey, input.contentType);
    console.info('R2 upload verified', {
      bucket: verification.bucket || this.bucketName,
      objectKey: input.objectKey,
      uploadStatus: uploadResponse.status,
      uploadETag: uploadResponse.eTag,
      verifiedETag: verification.eTag,
      contentLength: verification.contentLength,
      publicUrl: verification.publicUrl || publicUrl || null,
    });

    let fileUrl = verification.publicUrl || publicUrl;
    if (!fileUrl) {
      fileUrl = (input.visibility === 'public' && R2_PUBLIC_DOMAIN) ? `https://${R2_PUBLIC_DOMAIN}/${input.objectKey}` : `r2://${input.objectKey}`;
    }
    return { fileUrl, objectKey: input.objectKey };
  }

  async delete(objectKey: string): Promise<void> {
    if (!objectKey) return;
    await this.invokePresign(objectKey, 'application/octet-stream', 'delete');
  }

  async getUrl(objectKey: string, visibility: Visibility, contentType = 'application/octet-stream'): Promise<string> {
    if (visibility === 'public' && R2_PUBLIC_DOMAIN) {
      return `https://${R2_PUBLIC_DOMAIN}/${objectKey}`;
    }

    if (visibility === 'signed') {
      const { url } = await this.invokePresign(objectKey, contentType, 'download');
      if (url) return url;
    }

    return `r2://${objectKey}`;
  }

  async saveMetadata(metadata: FileMetadata): Promise<FileMetadata> {
    const { data, error } = await supabase
      .from('file_metadata')
      .insert([metadata])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save file metadata: ${error.message}`);
    }

    return data;
  }
}
