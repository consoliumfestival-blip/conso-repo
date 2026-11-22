import { supabase } from '../../../../core/config/supabase';
import { uploadService } from '../../../../services/storage/uploadService';

export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

export interface SaveGeneratedPosterInput {
  blob: Blob;
  tenantId: string;
  festivalId: string;
  templateId?: string;
  eventId?: string | null;
  resultId?: string | null;
  eventName: string;
  publicVisible: boolean;
}

export async function saveGeneratedPosterAsset({
  blob,
  tenantId,
  festivalId,
  templateId,
  eventId,
  resultId,
  eventName,
  publicVisible,
}: SaveGeneratedPosterInput): Promise<{ visibilityStatus: 'published' | 'draft'; renderHash: string }> {
  const uploaded = await uploadService.uploadGeneratedAsset(blob, festivalId, tenantId);
  const visibilityStatus: 'published' | 'draft' = publicVisible ? 'published' : 'draft';
  const renderHash = `${templateId || 'template'}_${eventId || resultId || 'base'}_${Date.now()}`;

  // Supersede previous active assets for the same item/result when schema supports is_current
  if (eventId) {
    await supabase
      .from('generated_assets')
      .update({ is_current: false })
      .eq('festival_id', festivalId)
      .eq('event_id', eventId)
      .eq('is_current', true)
      .then(() => {}, () => {});
  } else if (resultId) {
    await supabase
      .from('generated_assets')
      .update({ is_current: false })
      .eq('festival_id', festivalId)
      .eq('result_id', resultId)
      .eq('is_current', true)
      .then(() => {}, () => {});
  }

  const baseRow = {
    tenant_id: tenantId,
    festival_id: festivalId,
    template_id: templateId || null,
    event_id: eventId || null,
    result_id: resultId || null,
    event_name: eventName || 'Festival Event',
    public_url: uploaded.file_url,
    storage_path: uploaded.object_key,
    asset_type: 'poster',
    render_hash: renderHash,
  };

  const fullRows = [
    { ...baseRow, resolution: 'hd', visibility_status: visibilityStatus, is_current: true },
    { ...baseRow, resolution: 'standard', visibility_status: visibilityStatus, is_current: true },
  ];

  let { error: dbError } = await supabase.from('generated_assets').insert(fullRows);

  // Fallback for environments where the additive columns have not been migrated yet
  if (dbError && (dbError.code === '42703' || dbError.message?.includes('column'))) {
    const legacyRows = [
      { ...baseRow, resolution: 'hd' },
      { ...baseRow, resolution: 'standard' },
    ];
    ({ error: dbError } = await supabase.from('generated_assets').insert(legacyRows));
  }

  if (dbError) {
    throw new Error(dbError.message);
  }

  return { visibilityStatus, renderHash };
}
