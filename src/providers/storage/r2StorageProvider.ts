import { supabase } from '../../core/config/supabase';
import { FileMetadata, StorageOperation, StorageProvider, StorageUploadInput, Visibility } from './storageProvider';

const R2_BUCKET_NAME = process.env.EXPO_PUBLIC_R2_BUCKET || 'sahi-assets';
const R2_PUBLIC_DOMAIN = process.env.EXPO_PUBLIC_R2_PUB_DOMAIN || '';

type UploadResponse = {
  status: number;
  eTag: string | null;
};

type R2PresignResponse = {
  url?: string;
  publicUrl?: string | null;
  objectKey?: string;
  bucket?: string;
  exists?: boolean;
  contentType?: string | null;
  contentLength?: number | null;
  eTag?: string | null;
};

const uploadWithProgress = (
  presignedUrl: string,
  file: Blob | File,
  contentType: string,
  onProgress?: (progress: number) => void,
): Promise<UploadResponse> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl, true);
    xhr.setRequestHeader('Content-Type', contentType);

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          status: xhr.status,
          eTag: xhr.getResponseHeader('etag'),
        });
        return;
      }
      reject(new Error(`R2 upload failed with status ${xhr.status}: ${xhr.responseText || 'No response body'}`));
    };

    xhr.onerror = () => reject(new Error(
      'R2 upload failed due to a network error. Check the R2 bucket CORS policy, presigned PUT permissions, and browser preflight response.',
    ));
    xhr.send(file);
  });

export class R2StorageProvider implements StorageProvider {
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

    const uploadResponse = await uploadWithProgress(url, input.file, input.contentType, input.onProgress);
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
