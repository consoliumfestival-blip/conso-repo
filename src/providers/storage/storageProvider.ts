export type AssetType = 'poster' | 'certificate' | 'template' | 'export' | 'logo' | 'profile' | 'result' | 'backup' | 'font' | 'generated_asset';
export type Visibility = 'public' | 'private' | 'signed';
export type StorageOperation = 'upload' | 'download' | 'delete' | 'verify';

export interface FileMetadata {
  id?: string;
  tenant_id: string;
  festival_id: string;
  asset_type: AssetType;
  file_url: string;
  bucket_name: string;
  object_key: string;
  content_type: string;
  file_size: number;
  visibility: Visibility;
  is_public: boolean;
  metadata?: Record<string, any>;
}

export interface StorageUploadInput {
  file: Blob | File;
  objectKey: string;
  contentType: string;
  visibility: Visibility;
  onProgress?: (progress: number) => void;
  /** Optional cancellation for storage providers that support abortable uploads. */
  signal?: AbortSignal;
}

export interface VerifiedStorageObject {
  objectKey: string;
  contentType: string;
  contentLength: number;
  eTag: string;
}

/** Narrow capability for resumable uploads that must keep one stable object key. */
export interface KeyedVerifiedStorageProvider {
  uploadAtKey(input: StorageUploadInput & { expectedSize: number }): Promise<VerifiedStorageObject>;
  verifyObjectMetadata(
    objectKey: string,
    expectedContentType: string,
    expectedSize: number,
  ): Promise<VerifiedStorageObject | null>;
}

export interface StorageProvider {
  readonly name: string;
  readonly bucketName: string;
  upload(input: StorageUploadInput): Promise<{ fileUrl: string; objectKey: string }>;
  delete(objectKey: string): Promise<void>;
  getUrl(objectKey: string, visibility: Visibility, contentType?: string): Promise<string>;
  saveMetadata(metadata: FileMetadata): Promise<FileMetadata>;
}
