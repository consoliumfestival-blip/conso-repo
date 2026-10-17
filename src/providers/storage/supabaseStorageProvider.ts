import { supabase } from '../../core/config/supabase';
import { FileMetadata, StorageProvider, StorageUploadInput, Visibility } from './storageProvider';

const SUPABASE_BUCKET_NAME = process.env.EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET || 'sahi-assets';

export class SupabaseStorageProvider implements StorageProvider {
  readonly name = 'supabase';
  readonly bucketName = SUPABASE_BUCKET_NAME;

  async upload(input: StorageUploadInput): Promise<{ fileUrl: string; objectKey: string }> {
    const { data, error } = await supabase.storage
      .from(this.bucketName)
      .upload(input.objectKey, input.file, {
        contentType: input.contentType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }

    const fileUrl = await this.getUrl(data.path, input.visibility, input.contentType);
    input.onProgress?.(100);
    return { fileUrl, objectKey: data.path };
  }

  async delete(objectKey: string): Promise<void> {
    if (!objectKey) return;
    const { error } = await supabase.storage.from(this.bucketName).remove([objectKey]);
    if (error) {
      throw new Error(`Supabase Storage delete failed: ${error.message}`);
    }
  }

  async getUrl(objectKey: string, visibility: Visibility, _contentType?: string): Promise<string> {
    if (visibility === 'public') {
      const { data } = supabase.storage.from(this.bucketName).getPublicUrl(objectKey);
      return data.publicUrl;
    }

    const { data, error } = await supabase.storage
      .from(this.bucketName)
      .createSignedUrl(objectKey, 60 * 60);

    if (error) {
      throw new Error(`Supabase Storage signed URL failed: ${error.message}`);
    }

    return data.signedUrl;
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
