import React, { useCallback, useEffect, useState } from 'react';
import { useExportQueueStore } from '@/services/exportQueueService';
import OffscreenRenderer from '@/components/leaderboard/PosterStudio/Canvas/OffscreenRenderer';
import { uploadService } from '@/services/storage/uploadService';
import { supabase } from '@/core/config/supabase';
import { useFestival } from '@/core/hooks/useFestival';

// Ratios relative to the default 1080x1080 canvas
const RESOLUTIONS = [
  { name: 'thumb', ratio: 0.5 },    // 540x540
  { name: 'share', ratio: 1.0 },    // 1080x1080 (Highly optimized for WhatsApp)
  { name: 'standard', ratio: 1.0 }, // 1080x1080
  { name: 'hd', ratio: 2.0 },       // 2160x2160
  // Note: print could be a PDF generation step, or a very high ratio PNG (like 3.0)
];

const dataURLtoBlob = (dataurl: string): Blob => {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

export default function BackgroundExportEngine() {
  const { currentJob, markJobCompleted, markJobFailed, fetchQueue } = useExportQueueStore();
  
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();

  const [isProcessingLocal, setIsProcessingLocal] = useState(false);

  // Resume orphaned/stale jobs on mount or when festival changes
  useEffect(() => {
    if (activeFestival?.id) {
      fetchQueue(activeFestival.id);
    }
  }, [activeFestival?.id, fetchQueue]);

  // We should only attempt to process if there is a currentJob and we're not already processing it
  useEffect(() => {
    if (currentJob && !isProcessingLocal) {
      setIsProcessingLocal(true);
    }
  }, [currentJob, isProcessingLocal]);

  // Heartbeat tracking to prevent permanently stuck processing jobs
  useEffect(() => {
    if (!currentJob || !isProcessingLocal) return;

    const intervalId = setInterval(() => {
      supabase
        .from('export_jobs')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentJob.id)
        .then(({ error }) => {
          if (error) console.error('[BGExport] Heartbeat failed:', error);
        });
    }, 30000); // 30s heartbeat

    return () => clearInterval(intervalId);
  }, [currentJob?.id, isProcessingLocal]);

  const handleRendererReady = useCallback(async (captureFunc: (ratio: number) => string) => {
    if (!currentJob) {
      console.warn('[BGExport] handleRendererReady called but no currentJob');
      return;
    }
    
    console.info('[BGExport] Starting render for job', currentJob.id, 'payload:', currentJob.payload);
    
    try {
      const generatedAssets = [];
      const payload = currentJob.payload;

      for (const res of RESOLUTIONS) {
        const dataUrl = captureFunc(res.ratio);
        const blob = dataURLtoBlob(dataUrl);
        console.info(`[BGExport] Uploading ${res.name} blob:`, blob.size, 'bytes');

        // Compress / Optimize 'share' explicitly if needed (we rely on WEBP/PNG size here)
        const ext = 'png';
        const uploaded = await uploadService.uploadGeneratedAsset(
          blob, 
          payload.festivalId, 
          payload.tenantId
        );

        console.info('[BGExport] Uploaded', res.name, '→', uploaded.file_url);
        generatedAssets.push({
          tenant_id: payload.tenantId,
          festival_id: payload.festivalId,
          event_id: payload.eventId || null,
          result_id: payload.resultId || null,
          asset_type: 'poster',
          template_id: payload.templateId,
          render_hash: payload.renderHash,
          resolution: res.name,
          storage_path: uploaded.object_key,
          public_url: uploaded.file_url,
          created_by: currentJob.created_by, // Or current user
        });
      }

      await markJobCompleted(currentJob.id, generatedAssets);
      console.info('[BGExport] Job completed', currentJob.id, '— assets saved:', generatedAssets.length);
    } catch (error) {
      console.error('[BGExport] RENDER/UPLOAD FAILED for job', currentJob.id, error);
      await markJobFailed(currentJob.id, error instanceof Error ? error.message : String(error));
    } finally {
      setIsProcessingLocal(false);
    }
  }, [currentJob, markJobCompleted, markJobFailed]);

  if (!currentJob || !isProcessingLocal) {
    console.info('[BGExport] Idle. currentJob:', !!currentJob, 'isProcessingLocal:', isProcessingLocal);
    return null;
  }

  return (
    <OffscreenRenderer 
      layers={currentJob.payload.layers}
      variables={currentJob.payload.variables}
      onReady={handleRendererReady}
      width={1080}
      height={1080}
      backgroundUrl={currentJob.payload.backgroundUrl}
      backgroundTransform={currentJob.payload.backgroundTransform}
    />
  );
}
