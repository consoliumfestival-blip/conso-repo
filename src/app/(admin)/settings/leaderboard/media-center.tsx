import { coreColor, coreAlpha } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import { ui } from '@/constants/designSystem';
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Linking, Platform, TextInput, Pressable } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, RefreshCw, Share2, Archive, Upload, Trash2, Plus, PenLine, Eye, EyeOff } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/core/config/supabase';
import { useFestival } from '@/core/hooks/useFestival';
import { useExportQueueStore } from '@/services/exportQueueService';
import { storageService } from '@/services/storage/storageService';
import { uploadService } from '@/services/storage/uploadService';
import { useAuthStore } from '@/core/store/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jsPDF } from 'jspdf';
import { listPosterDeliveries } from '@/components/leaderboard/PosterStudio/Database/posterDeliveryRepository';
import type { PosterDeliveryRecord, PosterDeliveryScope } from '@/components/leaderboard/PosterStudio/Database/posterDesignSnapshot';
import { createPosterOperationId, runPosterDelivery } from '@/components/leaderboard/PosterStudio/Services/posterDeliveryService';
import { useOfflineStore } from '@/components/leaderboard/PosterStudio/Stores/offlineStore';
import { shouldShowLocalPosterDelivery } from '@/components/leaderboard/PosterStudio/Services/posterMediaCenterRules';

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipBlob(entries: { name: string; data: Uint8Array }[]): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lView = new DataView(localHeader.buffer);
    lView.setUint32(0, 0x04034b50, true);
    lView.setUint16(4, 20, true);
    lView.setUint16(6, 0x0800, true);
    lView.setUint16(8, 0, true); // STORE
    lView.setUint16(10, 0, true);
    lView.setUint16(12, 0, true);
    lView.setUint32(14, crc, true);
    lView.setUint32(18, data.length, true);
    lView.setUint32(22, data.length, true);
    lView.setUint16(26, nameBytes.length, true);
    lView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cView = new DataView(centralHeader.buffer);
    cView.setUint32(0, 0x02014b50, true);
    cView.setUint16(4, 20, true);
    cView.setUint16(6, 20, true);
    cView.setUint16(8, 0x0800, true);
    cView.setUint16(10, 0, true);
    cView.setUint16(12, 0, true);
    cView.setUint16(14, 0, true);
    cView.setUint32(16, crc, true);
    cView.setUint32(20, data.length, true);
    cView.setUint32(24, data.length, true);
    cView.setUint16(28, nameBytes.length, true);
    cView.setUint16(30, 0, true);
    cView.setUint16(32, 0, true);
    cView.setUint16(34, 0, true);
    cView.setUint16(36, 0, true);
    cView.setUint32(38, 0, true);
    cView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  let centralSize = 0;
  for (const part of centralParts) centralSize += part.length;

  const eocd = new Uint8Array(22);
  const eView = new DataView(eocd.buffer);
  eView.setUint32(0, 0x06054b50, true);
  eView.setUint16(4, 0, true);
  eView.setUint16(6, 0, true);
  eView.setUint16(8, entries.length, true);
  eView.setUint16(10, entries.length, true);
  eView.setUint32(12, centralSize, true);
  eView.setUint32(16, offset, true);
  eView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, eocd] as BlobPart[], { type: 'application/zip' });
}

const colors = {
  navy: ui.colors.primaryHover,
  blue: ui.colors.primary,
  cyan: ui.colors.info,
  teal: coreColor('#0F766E', 'primary'),
  green: coreColor('#22C55E', 'success'),
  bg: ui.colors.background,
  card: ui.colors.surface,
  border: ui.colors.border,
  text: ui.colors.text,
  muted: ui.colors.textMuted,
  soft: ui.colors.infoSoft,
  whatsapp: '#25D366'
};

const signedUrlCache = new Map<string, { url: string, expires: number }>();
const EMPTY_MEDIA_ASSETS: any[] = [];
const EMPTY_STORAGE_PATHS: string[] = [];

function deliveryStatusLabel(delivery: PosterDeliveryRecord): string {
  if (delivery.status === 'pending_upload') return 'Saved · upload pending';
  if (delivery.status === 'uploading') return 'Uploading';
  if (delivery.status === 'pending_finalize') return 'Finishing upload';
  if (delivery.status === 'failed') return 'Upload failed · retry';
  return 'Uploaded';
}

export default function MediaCenterPage() {
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const { jobs, isProcessing } = useExportQueueStore();
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'published' | 'draft' | 'pending'>('all');
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { tenant_id, user } = useAuthStore();
  const isOnline = useOfflineStore((state) => state.isOnline);
  const [savedFestivalContext, setSavedFestivalContext] = useState<string | null>(null);
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<string | null>(null);
  const [togglingVisibilityHash, setTogglingVisibilityHash] = useState<string | null>(null);
  const retryOwnerIdRef = React.useRef<string | null>(null);
  const [localPreviewUrls, setLocalPreviewUrls] = useState<Record<string, string>>({});

  // Upload poster states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadEventName, setUploadEventName] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  React.useEffect(() => {
    setSavedFestivalContext(null);
    if (Platform.OS !== 'web' || !user?.id || !tenant_id) return;
    try {
      const raw = localStorage.getItem('posterStudio:lastFestivalScope');
      if (!raw) return;
      const saved = JSON.parse(raw) as { userId?: string; tenantId?: string; festivalId?: string };
      if (saved.userId === user.id && saved.tenantId === tenant_id && saved.festivalId) {
        setSavedFestivalContext(saved.festivalId);
      }
    } catch {
      setSavedFestivalContext(null);
    }
  }, [user?.id, tenant_id]);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || !user?.id || !tenant_id || !activeFestival?.id) return;
    const saved = { userId: user.id, tenantId: tenant_id, festivalId: activeFestival.id };
    try {
      localStorage.setItem('posterStudio:lastFestivalScope', JSON.stringify(saved));
      setSavedFestivalContext(activeFestival.id);
    } catch {
      // The cloud context remains authoritative if browser storage is unavailable.
    }
  }, [user?.id, tenant_id, activeFestival?.id]);

  const localFestivalId = activeFestival?.id || savedFestivalContext;
  const localDeliveryScope: PosterDeliveryScope | null = user?.id && tenant_id && localFestivalId
    ? { userId: user.id, tenantId: tenant_id, festivalId: localFestivalId }
    : null;
  const localDeliveryQueryKey = [
    'poster-deliveries',
    localDeliveryScope?.userId,
    localDeliveryScope?.tenantId,
    localDeliveryScope?.festivalId,
  ];
  const {
    data: localDeliveries = [],
    isLoading: isLocalDeliveriesLoading,
    refetch: refetchLocalDeliveries,
  } = useQuery({
    queryKey: localDeliveryQueryKey,
    queryFn: () => localDeliveryScope
      ? listPosterDeliveries(localDeliveryScope, { limit: 100 })
      : Promise.resolve([]),
    enabled: Platform.OS === 'web' && !!localDeliveryScope,
    staleTime: 0,
  });

  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const urls: Record<string, string> = {};
    for (const delivery of localDeliveries) {
      const blob = delivery.outputs[0]?.blob;
      if (blob) urls[delivery.operationId] = URL.createObjectURL(blob);
    }
    setLocalPreviewUrls(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [localDeliveries]);

  const handleFileSelect = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be under 10MB');
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    };
    input.click();
  };

  const handleUploadPoster = async () => {
    if (!selectedFile || !uploadEventName.trim() || !activeFestival?.id || !tenant_id) return;
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const metadata = await uploadService.uploadPoster(selectedFile, activeFestival.id, tenant_id, (p) => setUploadProgress(p));
      const renderHash = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const { error } = await supabase.from('generated_assets').insert({
        tenant_id,
        festival_id: activeFestival.id,
        asset_type: 'poster',
        render_hash: renderHash,
        resolution: 'hd',
        storage_path: metadata.object_key,
        public_url: metadata.file_url,
        event_name: uploadEventName.trim(),
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['generated-assets', activeFestival.id] });
      setShowUploadModal(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      setUploadEventName('');
      setUploadProgress(0);
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleTogglePublicVisibility = async (asset: any) => {
    if (asset.is_local_delivery || !activeFestival?.id || !tenant_id) return;
    const isCurrentlyHidden = asset.visibility_status === 'hidden' || asset.visibility_status === 'draft';
    const nextStatus = isCurrentlyHidden ? 'published' : 'hidden';
    setTogglingVisibilityHash(asset.render_hash);
    try {
      let query = supabase
        .from('generated_assets')
        .update({ visibility_status: nextStatus, updated_at: new Date().toISOString() })
        .eq('festival_id', activeFestival.id)
        .eq('tenant_id', tenant_id);
      if (String(asset.render_hash || '').startsWith('_ungrouped_')) {
        query = query.eq('id', asset.id);
      } else {
        query = query.eq('render_hash', asset.render_hash);
      }
      const { error } = await query;
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['generated-assets', activeFestival.id] });
    } catch (err: any) {
      alert('Failed to update public visibility: ' + (err?.message || 'Unknown error'));
    } finally {
      setTogglingVisibilityHash(null);
    }
  };

  const handleDeletePoster = async (asset: any) => {
    if (asset.is_local_delivery) return;
    if (!activeFestival?.id) return;
    const confirmed = confirm(`Delete poster "${asset.event_name}"?`);
    if (!confirmed) return;
    try {
      const query = String(asset.render_hash || '').startsWith('_ungrouped_')
        ? supabase.from('generated_assets').delete().eq('id', asset.id)
        : supabase.from('generated_assets').delete().eq('render_hash', asset.render_hash);
      const { error } = await query;
      if (error) throw error;
      for (const objectKey of (asset.storage_paths || []) as string[]) {
        if (objectKey) {
          try { await uploadService.deleteObject(objectKey); } catch (_) {}
        }
      }
      queryClient.invalidateQueries({ queryKey: ['generated-assets', activeFestival.id] });
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const fetchImageBlob = async (imageUrl: string): Promise<Blob> => {
    let response = await fetch(imageUrl).catch(() => null);
    if (!response || !response.ok) {
      response = await fetch(`/api/proxy-image?url=${encodeURIComponent(imageUrl)}`);
    }
    if (!response || !response.ok) {
      throw new Error('Could not fetch image bytes');
    }
    return await response.blob();
  };

  const handleDownloadPdf = async (asset: any) => {
    const imageUrl = asset.resolutions?.hd || asset.resolutions?.standard || asset.resolutions?.share;
    if (!imageUrl || Platform.OS !== 'web') return;
    setExportingPdfId(asset.render_hash);
    try {
      const blob = await fetchImageBlob(imageUrl);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const img = new window.Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
      });
      const orientation = img.width >= img.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({
        orientation,
        unit: 'px',
        format: [img.width || 1080, img.height || 1080],
      });
      const imgFormat = blob.type.includes('png') ? 'PNG' : 'JPEG';
      pdf.addImage(dataUrl, imgFormat, 0, 0, img.width || 1080, img.height || 1080);
      const safeName = (asset.event_name || 'poster').replace(/[^a-zA-Z0-9_-]+/g, '_');
      pdf.save(`${safeName}.pdf`);
    } catch (err: any) {
      alert('PDF export failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setExportingPdfId(null);
    }
  };

  const handleBatchZipExport = async (itemsToExport: any[]) => {
    if (Platform.OS !== 'web' || itemsToExport.length === 0 || isExportingZip) return;
    setIsExportingZip(true);
    try {
      const entries: { name: string; data: Uint8Array }[] = [];
      const usedNames = new Set<string>();

      for (let i = 0; i < itemsToExport.length; i++) {
        const asset = itemsToExport[i];
        const imageUrl = asset.resolutions?.hd || asset.resolutions?.standard || asset.resolutions?.share;
        const localBlob: Blob | undefined = asset.is_local_delivery
          ? asset.delivery?.outputs?.[0]?.blob
          : undefined;
        if (!localBlob && !imageUrl) continue;
        try {
          const blob = localBlob || await fetchImageBlob(imageUrl);
          const buf = new Uint8Array(await blob.arrayBuffer());
          const ext = blob.type.includes('png') ? 'png' : 'jpg';
          const base = `${asset.result_no ? `${asset.result_no}_` : ''}${asset.event_name || 'poster'}`
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .slice(0, 60);
          let fileName = `${base}.${ext}`;
          let counter = 1;
          while (usedNames.has(fileName)) {
            fileName = `${base}_${counter++}.${ext}`;
          }
          usedNames.add(fileName);
          entries.push({ name: fileName, data: buf });
        } catch (err) {
          console.warn('Skipping asset in ZIP export:', asset.event_name, err);
        }
      }

      if (entries.length === 0) {
        alert('No downloadable posters found.');
        return;
      }

      const zipBlob = buildZipBlob(entries);
      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = `${(activeFestival?.custom_name || 'festival').replace(/[^a-zA-Z0-9_-]+/g, '_')}_posters.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);
    } finally {
      setIsExportingZip(false);
    }
  };

  const {
    data: cloudMediaData,
    isLoading: isCloudAssetsLoading,
    isError: isCloudAssetsError,
    refetch,
  } = useQuery({
    queryKey: ['generated-assets', activeFestival?.id, tenant_id, user?.id],
    queryFn: async () => {
      if (!activeFestival?.id) return { assets: [], knownStoragePaths: [] as string[] };
      const { data, error } = await supabase
        .from('generated_assets')
        .select(`
          *,
          item:items(item_name_en, item_name_ml, item_type),
          result:results(public_result_no, public_visible)
        `)
        .eq('festival_id', activeFestival.id)
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;

      const knownStoragePaths = [...new Set((data as any[]).flatMap((row) => {
        const values = [row.storage_path, row.public_url]
          .filter((value): value is string => typeof value === 'string' && value.length > 0);
        return values.map((value) => value.startsWith('r2://') ? value.slice('r2://'.length) : value);
      }))];
      
      // Group by render_hash (ignore superseded rows where is_current === false)
      const grouped = (data as any[]).reduce((acc, curr, idx) => {
        if (curr.is_current === false) return acc;
        const key = curr.render_hash || `_ungrouped_${idx}`;
        if (!acc[key]) {
          const isExplicitDraft = curr.visibility_status === 'draft' || curr.visibility_status === 'hidden';
          const isResultHidden = curr.result && curr.result.public_visible === false;
          const isLivePublic = !isExplicitDraft && !isResultHidden;
          acc[key] = {
            id: curr.id,
            render_hash: key,
            template_id: curr.template_id,
            event_id: curr.event_id,
            result_id: curr.result_id,
            generation_id: curr.generation_id || null,
            event_name: curr.event_name || curr.item?.item_name_en || curr.item?.item_name_ml || 'Festival Event',
            result_no: curr.result?.public_result_no,
            visibility_status: curr.visibility_status || 'published',
            is_live_public: isLivePublic,
            created_at: curr.created_at,
            storage_paths: [] as string[],
            asset_ids: [] as string[],
            resolutions: {}
          };
        }
        if (curr.id && !acc[key].asset_ids.includes(curr.id)) acc[key].asset_ids.push(curr.id);
        if (curr.storage_path && !acc[key].storage_paths.includes(curr.storage_path)) {
          acc[key].storage_paths.push(curr.storage_path);
        } else if (curr.public_url && curr.public_url.startsWith('r2://')) {
          const k = curr.public_url.replace('r2://', '');
          if (!acc[key].storage_paths.includes(k)) acc[key].storage_paths.push(k);
        }
        acc[key].resolutions[curr.resolution] = curr.public_url;
        return acc;
      }, {} as Record<string, any>);
      
      const resultAssets = Object.values(grouped) as any[];
      
      // Resolve r2:// URLs to presigned HTTP URLs
      for (const asset of resultAssets) {
        for (const res of Object.keys(asset.resolutions)) {
          let url = asset.resolutions[res];
          if (url && url.startsWith('r2://')) {
            const objectKey = url.replace('r2://', '');
            try {
              const now = Date.now();
              const storageKey = `presigned_${objectKey}`;
              let cachedUrl = signedUrlCache.get(objectKey)?.url;
              
              // If not in memory, check AsyncStorage
              if (!cachedUrl) {
                const persisted = await AsyncStorage.getItem(storageKey);
                if (persisted) {
                   const parsed = JSON.parse(persisted);
                   if (parsed.expires > now) {
                     cachedUrl = parsed.url;
                     signedUrlCache.set(objectKey, { url: parsed.url, expires: parsed.expires });
                   }
                }
              }

              if (cachedUrl) {
                asset.resolutions[res] = cachedUrl;
              } else {
                const signedUrl = await storageService.getPresignedUrl(objectKey, 'image/jpeg', 'download');
                asset.resolutions[res] = signedUrl;
                const expires = now + 55 * 60 * 1000;
                signedUrlCache.set(objectKey, { url: signedUrl, expires });
                AsyncStorage.setItem(storageKey, JSON.stringify({ url: signedUrl, expires })).catch(console.error);
              }
            } catch (e) {
              console.error('Failed to presign URL', e);
            }
          }
        }
      }
      
      return { assets: resultAssets, knownStoragePaths };
    },
    enabled: !!activeFestival?.id,
    refetchInterval: isProcessing ? 3000 : false, // Poll if queue is processing
  });

  const assets: any[] = cloudMediaData?.assets ?? EMPTY_MEDIA_ASSETS;
  const knownStoragePaths: string[] = cloudMediaData?.knownStoragePaths ?? EMPTY_STORAGE_PATHS;
  const cloudStoragePathSet = React.useMemo(() => new Set(knownStoragePaths), [knownStoragePaths]);
  const currentCloudAssetIds = React.useMemo(
    () => new Set<string>(assets.flatMap((asset: any) => asset.asset_ids ?? [])),
    [assets],
  );
  const cloudMediaAvailable = !!activeFestival?.id && !isCloudAssetsLoading && !isCloudAssetsError;
  const localAssets = React.useMemo(() => localDeliveries
    .filter((delivery) => shouldShowLocalPosterDelivery(
      delivery,
      cloudStoragePathSet,
      currentCloudAssetIds,
      cloudMediaAvailable,
    ))
    .map((delivery) => {
      const preview = localPreviewUrls[delivery.operationId];
      const eventName = delivery.snapshot.variables.event_name || 'Poster';
      const resolutionUrl = preview || undefined;
      return {
        id: `local:${delivery.operationId}`,
        render_hash: `local_${delivery.operationId}`,
        template_id: delivery.snapshot.templateId,
        event_id: delivery.snapshot.itemId,
        result_id: delivery.snapshot.resultId,
        generation_id: delivery.serverGenerationId,
        event_name: eventName,
        result_no: delivery.snapshot.variables.result_no,
        visibility_status: delivery.serverVisibilityStatus || 'unknown',
        is_live_public: delivery.serverVisibilityStatus === 'published',
        created_at: delivery.createdAt,
        storage_paths: delivery.outputs.map((output) => output.storageKey),
        asset_ids: delivery.serverAssetIds,
        resolutions: resolutionUrl ? { hd: resolutionUrl, standard: resolutionUrl } : {},
        is_local_delivery: true,
        delivery,
      };
    }),
  [localDeliveries, localPreviewUrls, cloudStoragePathSet, currentCloudAssetIds, cloudMediaAvailable]);
  const mediaAssets = React.useMemo(() => [...assets, ...localAssets]
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at))), [assets, localAssets]);
  const isLoading = isLocalDeliveriesLoading || (isCloudAssetsLoading && localAssets.length === 0);

  const [waNumber, setWaNumber] = useState('');
  const [waCaption, setWaCaption] = useState('🏆 *{festival_name}* 🏆\n━━━━━━━━━━━━━━━━━━━━\n\n*മത്സരഫലം പ്രസിദ്ധീകരിച്ചു!* 🎉\n\n🔹 *ഇനം:* {event_name}\n{result_no_text}\n\nവിജയികൾക്ക് അഭിനന്ദനങ്ങൾ! 🌟');
  const [isSharingId, setIsSharingId] = useState<string | null>(null);

  const downloadLocalDelivery = (delivery: PosterDeliveryRecord) => {
    if (Platform.OS !== 'web') return;
    const blob = delivery.outputs[0]?.blob;
    if (!blob) {
      alert('This local poster has no saved image bytes.');
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `poster-${delivery.snapshot.itemId || delivery.snapshot.resultId}.jpg`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const handleEditAsset = (asset: any) => {
    const params: Record<string, string> = {};
    const editFestivalId = asset.is_local_delivery ? asset.delivery.festivalId : activeFestival?.id;
    if (editFestivalId) params.festivalId = editFestivalId;
    if (asset.is_local_delivery) {
      params.deliveryId = asset.delivery.operationId;
    } else if (asset.generation_id) {
      params.generationId = asset.generation_id;
    } else {
      params.assetId = String(asset.id);
    }
    router.push({ pathname: '/(admin)/settings/leaderboard/poster-studio', params });
  };

  const handleRetryLocalDelivery = async (delivery: PosterDeliveryRecord) => {
    const auth = useAuthStore.getState();
    const scope: PosterDeliveryScope = {
      userId: delivery.userId,
      tenantId: delivery.tenantId,
      festivalId: delivery.festivalId,
    };
    if (!isOnline) {
      alert('This poster is saved on this device. Connect to the internet before retrying upload.');
      return;
    }
    if (!auth.user?.id || auth.user.id !== scope.userId
      || (auth.tenant_id !== scope.tenantId && auth.is_superadmin !== true)) {
      alert('Switch back to the account and tenant that created this poster before retrying.');
      return;
    }
    if (!retryOwnerIdRef.current) retryOwnerIdRef.current = createPosterOperationId();
    setRetryingDeliveryId(delivery.operationId);
    try {
      const result = await runPosterDelivery(
        delivery.operationId,
        scope,
        retryOwnerIdRef.current,
        {
          isScopeActive: async (requestedScope) => {
            const currentAuth = useAuthStore.getState();
            let currentFestivalId = queryClient.getQueryData<{ id?: string } | null>([
              'active-festival', currentAuth.tenant_id,
            ])?.id;
            if (!currentFestivalId && Platform.OS === 'web') {
              try {
                const raw = localStorage.getItem('posterStudio:lastFestivalScope');
                const cached = raw ? JSON.parse(raw) as { userId?: string; tenantId?: string; festivalId?: string } : null;
                if (cached && cached.userId === currentAuth.user?.id && cached.tenantId === currentAuth.tenant_id) {
                  currentFestivalId = cached.festivalId;
                }
              } catch {
                currentFestivalId = undefined;
              }
            }
            return currentAuth.user?.id === requestedScope.userId
              && (currentAuth.tenant_id === requestedScope.tenantId || currentAuth.is_superadmin === true)
              && currentFestivalId === requestedScope.festivalId;
          },
        },
      );
      const currentAuth = useAuthStore.getState();
      if (currentAuth.user?.id === scope.userId
        && (currentAuth.tenant_id === scope.tenantId || currentAuth.is_superadmin === true)) {
        await Promise.all([
          refetchLocalDeliveries(),
          queryClient.invalidateQueries({ queryKey: ['generated-assets', delivery.festivalId] }),
        ]);
      }
      if (result.status === 'failed') alert(`Upload is still pending. ${result.error}`);
      else if (result.status === 'busy') alert('Another Studio tab is already uploading this poster.');
      else if (result.status === 'missing') alert('The saved local poster could not be found.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Poster upload retry failed.');
    } finally {
      setRetryingDeliveryId(null);
    }
  };

  React.useEffect(() => {
    const loadWaSettings = async () => {
      try {
        const savedNumber = await AsyncStorage.getItem('waTargetNumber');
        if (savedNumber) setWaNumber(savedNumber);
        
        const savedCaption = await AsyncStorage.getItem('waCaptionTemplate_v2');
        if (savedCaption) setWaCaption(savedCaption);
      } catch (e) {
        console.error('Failed to load WA settings', e);
      }
    };
    loadWaSettings();
  }, []);

  const saveWaNumber = async (val: string) => {
    setWaNumber(val);
    await AsyncStorage.setItem('waTargetNumber', val).catch(console.error);
  };

  const saveWaCaption = async (val: string) => {
    setWaCaption(val);
    await AsyncStorage.setItem('waCaptionTemplate_v2', val).catch(console.error);
  };

  const handleWhatsAppShare = async (asset: any) => {
    if (!waNumber.trim()) {
      alert('Please enter a WhatsApp number at the top of the page first.');
      // Focus could be done if we had a ref
      return;
    }
    
    // Format number: remove non-digits
    let cleanNumber = waNumber.replace(/\D/g, '');
    if (cleanNumber.length === 10) cleanNumber = '91' + cleanNumber; // default to India if just 10 digits

    try {
      setIsSharingId(asset.render_hash);
      const imageUrl = asset.resolutions?.share || asset.resolutions?.hd || asset.resolutions?.standard;
      
      // Generate text
      const text = waCaption
        .replace(/{event_name}/g, asset.event_name || '')
        .replace(/{result_no}/g, asset.result_no || '')
        .replace(/{result_no_text}/g, asset.result_no ? `🔹 *റിസൾട്ട് നമ്പർ:* ${asset.result_no}` : '')
        .replace(/{festival_name}/g, activeFestival?.custom_name || 'Consolium');

      if (Platform.OS === 'web') {
        try {
          // In modern browsers, fetching takes time, which invalidates the user gesture.
          // To fix this, we pass a Promise directly into ClipboardItem.
          const makeImagePromise = async () => {
            let response = await fetch(imageUrl).catch(() => null);
            if (!response || !response.ok) {
              response = await fetch(`/api/proxy-image?url=${encodeURIComponent(imageUrl)}`);
            }
            const blob = await response.blob();
            
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = URL.createObjectURL(blob);
            });

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('No canvas context');
            ctx.drawImage(img, 0, 0);

            return new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((b) => {
                if (b) resolve(b);
                else reject(new Error('Canvas toBlob failed'));
              }, 'image/png');
            });
          };

          const clipboardItem = new (window as any).ClipboardItem({
            'image/png': makeImagePromise()
          });

          await navigator.clipboard.write([clipboardItem]);
          
          const waUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(text + '\n\n[Please paste the image that was just copied to your clipboard!]')}`;
          window.open(waUrl, '_blank');
          alert('✅ Image copied to clipboard!\n\nWhatsApp will now open. Just press Paste (Ctrl+V) in the chat to send the image.');
        } catch (clipboardError) {
          console.error('Clipboard write failed:', clipboardError);
          // Fallback if clipboard fails
          const fallbackUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(text + '\n\nView Poster: ' + imageUrl)}`;
          window.open(fallbackUrl, '_blank');
          alert('Could not copy image automatically. Sent link instead.');
        }
      } else {
        // Mobile fallback
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], 'poster.jpg', { type: blob.type || 'image/jpeg' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: text,
              text: text,
            });
            return;
          } catch (shareErr) {
            console.log('Mobile share failed, falling back to link');
          }
        }
        
        const url = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(text + '\n\nView Poster: ' + imageUrl)}`;
        Linking.openURL(url);
      }
    } catch (e) {
      console.error('Share error:', e);
      alert('Failed to share image.');
    } finally {
      setIsSharingId(null);
    }
  };

  const filteredAssets = React.useMemo(() => {
    if (filter === 'published') return mediaAssets.filter((a: any) => !a.is_local_delivery && a.is_live_public);
    if (filter === 'draft') return mediaAssets.filter((a: any) => !a.is_local_delivery && !a.is_live_public);
    if (filter === 'pending') return mediaAssets.filter((a: any) => a.is_local_delivery);
    return mediaAssets;
  }, [mediaAssets, filter]);

  const openUrl = (url: string) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Media Center</Text>
          <Text style={styles.subtitle}>Manage and share generated assets</Text>
          {savedFestivalContext && (!activeFestival?.id || !isOnline) && (
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
              Showing posters for the last festival saved on this device.
            </Text>
          )}
          {isCloudAssetsError && (
            <Text style={{ color: '#9A3412', fontSize: 12, marginTop: 4 }}>
              Cloud Media Center is unavailable. Saved posters on this device are still shown below.
            </Text>
          )}
        </View>
        <View style={styles.headerActions}>
          {isProcessing && (
            <View style={styles.queueBadge}>
              <ActivityIndicator size="small" color={coreColor(colors.navy, 'primaryText')} />
              <Text style={styles.queueText}>{jobs.length} Jobs Queued</Text>
            </View>
          )}
          <TouchableOpacity style={styles.btnSecondary} onPress={() => refetch()}>
            <RefreshCw size={16} color={coreColor(colors.navy, 'primaryText')} />
            <Text style={styles.btnSecondaryText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnPrimary, (isExportingZip || filteredAssets.length === 0) && styles.btnDisabled]}
            onPress={() => handleBatchZipExport(filteredAssets)}
            disabled={isExportingZip || filteredAssets.length === 0}
          >
            <Archive size={16} color={ui.colors.onPrimary} />
            <Text style={styles.btnPrimaryText}>
              {isExportingZip ? 'Exporting ZIP...' : `Batch Export (${filteredAssets.length})`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: coreColor('#0F766E', 'primary') }]} onPress={() => setShowUploadModal(true)}>
            <Upload size={16} color={ui.colors.onPrimary} />
            <Text style={styles.btnPrimaryText}>Upload Poster</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isLoading ? (
          <ActivityIndicator size="large" color={coreColor(colors.navy, 'primaryText')} style={{ marginTop: 40 }} />
        ) : mediaAssets.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🗂️</Text>
            <Text style={styles.emptyTitle}>No assets generated yet</Text>
            <Text style={styles.emptySub}>
              {isCloudAssetsError
                ? 'Cloud assets could not be loaded and no matching local posters were found on this device.'
                : 'Publish results in Poster Studio to see them here.'}
            </Text>
          </View>
        ) : (
          <>
            {/* Filter Tabs */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {([
                { key: 'all', label: `All (${mediaAssets.length})` },
                { key: 'published', label: `🌐 Published Live (${mediaAssets.filter((a: any) => !a.is_local_delivery && a.is_live_public).length})` },
                { key: 'draft', label: `📝 Drafts / Not Public (${mediaAssets.filter((a: any) => !a.is_local_delivery && !a.is_live_public).length})` },
                { key: 'pending', label: `💾 On this device (${localAssets.length})` },
              ] as const).map((tab) => {
                const active = filter === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => setFilter(tab.key)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? colors.navy : colors.border,
                      backgroundColor: active ? colors.navy : colors.card,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFFFFF' : colors.navy }}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ marginBottom: 20, padding: 16, backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <View style={{ flex: 1, minWidth: 250 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: coreColor(colors.navy, 'primaryText') }}>WhatsApp Target Number</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>Enter the phone number (with country code).</Text>
                </View>
                <TextInput 
                  value={waNumber}
                  onChangeText={saveWaNumber}
                  placeholder="e.g. 919876543210"
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10, width: 200, fontSize: 14 }}
                  keyboardType="phone-pad"
                />
              </View>
              
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, marginTop: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: coreColor(colors.navy, 'primaryText') }}>WhatsApp Image Caption Template</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => saveWaCaption(waCaption + ' *bold text*')} style={{ paddingHorizontal: 12, paddingVertical: 4, backgroundColor: coreColor('#F1F5F9', 'surface'), borderRadius: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: 'bold' }}>B</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => saveWaCaption(waCaption + ' _italic text_')} style={{ paddingHorizontal: 12, paddingVertical: 4, backgroundColor: coreColor('#F1F5F9', 'surface'), borderRadius: 4 }}>
                      <Text style={{ fontSize: 12, fontStyle: 'italic' }}>I</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => saveWaCaption(waCaption + ' ~strikethrough~')} style={{ paddingHorizontal: 12, paddingVertical: 4, backgroundColor: coreColor('#F1F5F9', 'surface'), borderRadius: 4 }}>
                      <Text style={{ fontSize: 12, textDecorationLine: 'line-through' }}>S</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <TextInput 
                  value={waCaption}
                  onChangeText={saveWaCaption}
                  multiline
                  numberOfLines={4}
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top' }}
                />
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
                  Placeholders: {'{event_name}'}, {'{result_no}'}, {'{result_no_text}'}, {'{festival_name}'}
                </Text>
              </View>
            </View>
            <View style={styles.grid}>
              {filteredAssets.map((asset: any) => (
              <View key={asset.render_hash} style={styles.card}>
                <View style={styles.imageContainer}>
                  <Image 
                    source={{ uri: asset.resolutions?.thumb || asset.resolutions?.standard || asset.resolutions?.hd || 'https://via.placeholder.com/400' }}
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                  <View
                    style={[
                      styles.qualityBadge,
                      {
                        left: 12,
                        right: undefined,
                        backgroundColor: asset.is_local_delivery
                          ? 'rgba(120, 53, 15, 0.94)'
                          : asset.is_live_public ? 'rgba(6, 95, 70, 0.9)' : 'rgba(51, 65, 85, 0.9)',
                      },
                    ]}
                  >
                    <Text style={styles.qualityText}>
                      {asset.is_local_delivery
                        ? deliveryStatusLabel(asset.delivery)
                        : asset.visibility_status === 'hidden'
                        ? '🙈 Hidden'
                        : asset.is_live_public ? '🌐 Live Public' : '📝 Draft (Hidden)'}
                    </Text>
                  </View>
                  <View style={styles.qualityBadge}>
                    <Text style={styles.qualityText}>
                      {asset.resolutions?.hd ? 'HD' : asset.resolutions?.standard ? 'Standard' : 'Poster'}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.cardBody}>
                  <Text style={styles.eventName} numberOfLines={1}>{asset.event_name}</Text>
                  <Text style={styles.metaText}>
                    {asset.result_no ? `Result #${asset.result_no}` : 'Poster'} • {new Date(asset.created_at).toLocaleDateString()}
                    {asset.is_local_delivery ? ' • Saved on this device' : ''}
                  </Text>
                  
                  <View style={styles.actionsGrid}>
                    {asset.is_local_delivery ? (
                      <>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => downloadLocalDelivery(asset.delivery)}>
                          <Download size={14} color={coreColor(colors.navy, 'primaryText')} />
                          <Text style={styles.actionText}>Download</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => handleEditAsset(asset)}>
                          <PenLine size={14} color={colors.navy} />
                          <Text style={styles.actionText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, (!isOnline || retryingDeliveryId === asset.delivery.operationId || asset.delivery.status === 'synced') && styles.actionBtnDisabled]}
                          onPress={() => handleRetryLocalDelivery(asset.delivery)}
                          disabled={!isOnline || retryingDeliveryId === asset.delivery.operationId || asset.delivery.status === 'synced'}
                        >
                          {retryingDeliveryId === asset.delivery.operationId
                            ? <ActivityIndicator size="small" color={coreColor(colors.navy, 'primaryText')} />
                            : <RefreshCw size={14} color={coreColor(colors.navy, 'primaryText')} />}
                          <Text style={styles.actionText}>{asset.delivery.status === 'synced' ? 'Uploaded' : 'Retry upload'}</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity
                        style={[styles.actionBtn, !asset.resolutions?.hd && styles.actionBtnDisabled]}
                        onPress={() => asset.resolutions?.hd && openUrl(asset.resolutions.hd)}
                        disabled={!asset.resolutions?.hd}
                      >
                        <Download size={14} color={coreColor(colors.navy, 'primaryText')} />
                        <Text style={styles.actionText}>HD Image</Text>
                      </TouchableOpacity>
                    )}
                    
                    <TouchableOpacity 
                      style={[styles.actionBtn, (!(asset.resolutions?.hd || asset.resolutions?.standard) || exportingPdfId === asset.render_hash) && styles.actionBtnDisabled]}
                      onPress={() => handleDownloadPdf(asset)}
                      disabled={!(asset.resolutions?.hd || asset.resolutions?.standard) || exportingPdfId === asset.render_hash}
                    >
                      <Download size={14} color={coreColor(colors.navy, 'primaryText')} />
                      <Text style={styles.actionText}>{exportingPdfId === asset.render_hash ? 'PDF...' : 'PDF'}</Text>
                    </TouchableOpacity>
                    
                    {!asset.is_local_delivery && <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleEditAsset(asset)}
                    >
                      <PenLine size={14} color={colors.navy} />
                      <Text style={styles.actionText}>Edit</Text>
                    </TouchableOpacity>}

                    {!asset.is_local_delivery && <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => {
                        const url = asset.resolutions?.share || asset.resolutions?.hd || asset.resolutions?.standard;
                        if(Platform.OS === 'web') {
                          navigator.clipboard.writeText(url);
                          alert('Link copied to clipboard!');
                        }
                      }}
                    >
                      <Share2 size={14} color={coreColor(colors.navy, 'primaryText')} />
                      <Text style={styles.actionText}>Link</Text>
                    </TouchableOpacity>}
                    
                    {!asset.is_local_delivery && <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnWhatsApp]}
                      onPress={() => handleWhatsAppShare(asset)}
                    >
                      <Share2 size={14} color={ui.colors.onPrimary} />
                      <Text style={styles.actionTextWhatsApp}>Share</Text>
                    </TouchableOpacity>}
                    
                    {!asset.is_local_delivery && <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        (asset.visibility_status !== 'hidden' && asset.is_live_public)
                          ? { backgroundColor: '#FFF7ED', borderColor: '#FDBA74' }
                          : { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' },
                        togglingVisibilityHash === asset.render_hash && styles.actionBtnDisabled,
                      ]}
                      onPress={() => handleTogglePublicVisibility(asset)}
                      disabled={togglingVisibilityHash === asset.render_hash}
                    >
                      {asset.visibility_status !== 'hidden' && asset.is_live_public
                        ? <EyeOff size={14} color="#C2410C" />
                        : <Eye size={14} color="#047857" />}
                      <Text style={[
                        styles.actionText,
                        { color: (asset.visibility_status !== 'hidden' && asset.is_live_public) ? '#C2410C' : '#047857' },
                      ]}>
                        {togglingVisibilityHash === asset.render_hash
                          ? 'Saving...'
                          : (asset.visibility_status !== 'hidden' && asset.is_live_public) ? 'Hide Public' : 'Show Public'}
                      </Text>
                    </TouchableOpacity>}

                    {!asset.is_local_delivery && <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: ui.colors.dangerSoft }]}
                      onPress={() => handleDeletePoster(asset)}
                    >
                      <Trash2 size={14} color={ui.colors.danger} />
                      <Text style={[styles.actionText, { color: ui.colors.danger }]}>Delete</Text>
                    </TouchableOpacity>}
                  </View>
                </View>
              </View>
            ))}
          </View>
          </>
        )}
      </ScrollView>

      {/* Upload Poster Modal */}
      <Modal
        visible={showUploadModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !isUploading && setShowUploadModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Upload Custom Poster</Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Event / Poster Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Malayalam Speech Result"
                value={uploadEventName}
                onChangeText={setUploadEventName}
                editable={!isUploading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Poster Image (JPG/PNG/WEBP) *</Text>
              <TouchableOpacity 
                style={styles.imagePickerBtn} 
                onPress={handleFileSelect}
                disabled={isUploading}
              >
                {previewUrl ? (
                  <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="cover" />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Plus size={24} color={colors.muted} />
                    <Text style={styles.imagePlaceholderText}>Click to select image</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {isUploading && (
              <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
                <Text style={styles.progressText}>Uploading... {Math.round(uploadProgress)}%</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.btnCancel} 
                onPress={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  setUploadEventName('');
                }}
                disabled={isUploading}
              >
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.btnPrimary, { backgroundColor: coreColor('#0F766E', 'primary') }, (!selectedFile || !uploadEventName.trim() || isUploading) && styles.btnDisabled]}
                onPress={handleUploadPoster}
                disabled={!selectedFile || !uploadEventName.trim() || isUploading}
              >
                {isUploading ? <ActivityIndicator size="small" color={coreColor("#fff", 'onPrimary')} /> : <Upload size={16} color={coreColor("#fff", 'onPrimary')} />}
                <Text style={styles.btnPrimaryText}>{isUploading ? 'Uploading...' : 'Upload Poster'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: coreColor(colors.navy, 'primaryText'),
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  queueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.soft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  queueText: {
    fontSize: 13,
    fontWeight: '600',
    color: coreColor(colors.navy, 'primaryText'),
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: coreColor(colors.navy, 'primaryText'),
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.colors.onPrimary,
  },
  scrollContent: {
    padding: 24,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: coreColor(colors.navy, 'primaryText'),
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: colors.muted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  card: {
    width: 320,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  imageContainer: {
    width: '100%',
    height: 280,
    backgroundColor: colors.bg,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  qualityBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: coreAlpha(coreColor('#0b1f3a', 'surface'), 0.8),
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  qualityText: {
    color: ui.colors.onPrimary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardBody: {
    padding: 16,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '600',
    color: coreColor(colors.navy, 'primaryText'),
    marginBottom: 4,
  },
  metaText: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 16,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: colors.bg,
    borderRadius: 6,
    gap: 6,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: coreColor(colors.navy, 'primaryText'),
  },
  actionBtnWhatsApp: {
    backgroundColor: colors.whatsapp,
  },
  actionTextWhatsApp: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.colors.onPrimary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: coreAlpha(coreColor('#000000', 'overlay'), 0.5),
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: coreColor(colors.navy, 'primaryText'),
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: coreColor(colors.navy, 'primaryText'),
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: colors.bg,
  },
  imagePickerBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 8,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  imagePlaceholder: {
    alignItems: 'center',
    gap: 8,
  },
  imagePlaceholderText: {
    color: colors.muted,
    fontSize: 14,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  progressContainer: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBar: {
    height: '100%',
    backgroundColor: coreColor('#0F766E', 'primary'),
  },
  progressText: {
    position: 'absolute',
    top: -20,
    right: 0,
    fontSize: 12,
    color: colors.muted,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
  },
  btnCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnCancelText: {
    color: colors.muted,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  }
});
