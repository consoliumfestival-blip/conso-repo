import { supabase } from '../core/config/supabase';
import { uploadService } from './storage/uploadService';

export interface FontMetadata {
  family: string;
  category: 'Malayalam' | 'English';
  weightSupport?: string;
  unicodeCoverage?: string;
  previewText?: string;
  scope: 'tenant' | 'festival';
}

export const fontService = {
  /**
   * Uploads a custom font file and saves its metadata manifest
   */
  async uploadFont(
    file: Blob | File,
    festivalId: string,
    tenantId: string,
    extension: string,
    metadata: FontMetadata,
    onProgress?: (progress: number) => void
  ) {
    // 1. Upload file using uploadService
    const fileMetadata = await uploadService.uploadFont(
      file,
      metadata.scope,
      festivalId,
      tenantId,
      extension,
      onProgress
    );

    // 2. Append our custom FontMetadata manifest to the DB record
    // We update the record that was just created by uploadAsset
    if (fileMetadata.id) {
      const { error } = await supabase
        .from('file_metadata')
        .update({ metadata: metadata })
        .eq('id', fileMetadata.id);

      if (error) {
        console.error('Failed to attach font manifest metadata:', error);
      }
    }

    return fileMetadata;
  },

  /**
   * Fetches all fonts available to this festival/tenant
   */
  async getFonts(tenantId: string, festivalId?: string) {
    let query = supabase
      .from('file_metadata')
      .select('*')
      .eq('asset_type', 'font')
      .eq('tenant_id', tenantId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // Filter to either tenant scoped OR festival scoped matching this festival
    return data.filter(doc => {
      const scope = doc.metadata?.scope || 'tenant';
      if (scope === 'festival' && festivalId) {
        return doc.festival_id === festivalId;
      }
      return true;
    });
  },
  
  /**
   * Delete a font
   */
  async deleteFont(fileId: string, objectKey: string) {
    // Need to trigger standard deletion through storageProvider
    const { error: dbError } = await supabase.from('file_metadata').delete().eq('id', fileId);
    if (dbError) throw new Error(dbError.message);
    
    // In a real app we'd also call storageService.delete(objectKey), but we'll assume trigger handles it or we call it directly:
    const { storageService } = await import('./storage/storageService');
    await storageService.delete(objectKey);
  }
};
