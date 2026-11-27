import { coreColor, coreAlpha } from '@/constants/coreTheme';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import StudioCanvas from './Canvas/StudioCanvas';
import TransformBlock from './Properties/TransformBlock';
import TypographyBlock from './Properties/TypographyBlock';
import EffectsBlock from './Properties/EffectsBlock';
import MobileBottomSheet from './Properties/MobileBottomSheet';
import TextToolbar from './Toolbar/TextToolbar';
import { useCanvasStore } from './Stores/canvasStore';
import { LayerSchema, useLayerStore, type LayerData } from './Stores/layerStore';
import { getLayerGroupIssues } from './Utils/layerTree';
import CanvasSizeBlock from './Properties/CanvasSizeBlock';
import BackgroundBlock from './Properties/BackgroundBlock';
import { useTemplateStore, type TemplateData } from './Stores/templateStore';
import { useOfflineStore } from './Stores/offlineStore';
import { useHistoryStore } from './Stores/historyStore';
import { useKeyboardShortcuts } from './Hooks/useKeyboardShortcuts';
import { useMemoryBudget } from './Hooks/useMemoryBudget';
import ShortcutGuide from './Toolbar/ShortcutGuide';
import { VariablePreview } from './Variables/VariablePreview';
import VariableBindingPanel from './Variables/VariableBindingPanel';
import VersionHistory from './Templates/VersionHistory';
import PublishApproval from './Templates/PublishApproval';
import PublishedResultsPanel from './Results/PublishedResultsPanel';
import ControlDock from './ControlDock/ControlDock';
import StudioContextMenu from './ContextMenu/StudioContextMenu';
import { useContextMenu } from './Hooks/useContextMenu';

export type DockPanelType = 'templates' | 'text' | 'assets' | 'layers' | 'background' | 'results' | 'properties' | null;

const MOBILE_TOOL_ITEMS = [
  { panel: 'templates', label: 'Templates', Icon: LayoutTemplate },
  { panel: 'results', label: 'Results', Icon: Trophy },
  { panel: 'assets', label: 'Assets', Icon: Image },
  { panel: 'layers', label: 'Layers', Icon: Layers },
  { panel: 'background', label: 'Background', Icon: Palette },
  { panel: 'text', label: 'Text', Icon: Type },
  { panel: 'properties', label: 'Properties', Icon: SlidersHorizontal },
] as const;

import ErrorBoundary from './ErrorBoundary';
import DiagnosticsOverlay from './DiagnosticsOverlay';
import { validateTemplateHealth, ValidationIssue } from './Utils/validation';
import { useGetPosterTemplates } from '../../../core/hooks/useLeaderboardSettings';
import { RESULT_NUMBER_PRESETS, NEXT_RESULT_MODE } from './Utils/resultNumberPresets';
import CreateTemplateModal from './Templates/CreateTemplateModal';
import { supabase } from '../../../core/config/supabase';
import OffscreenRenderer from './Canvas/OffscreenRenderer';
import MultiFrameGrid from './Canvas/MultiFrameGrid';
import { formatBackgroundSize, uploadPosterBackground } from './Services/backgroundUploadService';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fontService, FontMetadata } from '../../../services/fontService';
import { loadFont } from './Utils/fontLoader';
import { storageService } from '../../../services/storage/storageService';
import { useAuthStore } from '../../../core/store/authStore';
import { resultVisibilityService } from '../../../services/resultVisibilityService';
import { buildRankVariables, fingerprintOfficialResults, resolveOfficialResultNumber } from './Results/resultGroupRules';
import { isPosterDesignSnapshot } from './Database/posterDesignSnapshot';
import type { PosterAssetReference, PosterDeliveryScope, PosterDesignSnapshot, PosterSourceAssetBlob } from './Database/posterDesignSnapshot';
import { canAccessPosterSnapshot } from './Utils/posterSnapshotAccess';
import { getPosterDelivery, savePendingPosterDelivery } from './Database/posterDeliveryRepository';
import { getPosterGenerationSnapshot } from './Database/posterGenerationClient';
import { createPosterOperationId, runPosterDelivery } from './Services/posterDeliveryService';
import { createPendingPosterDelivery, createPosterDesignSnapshot, measurePosterBlob, stablePosterAssetReference } from './Services/posterDeliveryFactory';
import { posterStudioThemeStyle } from './theme';

import { useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, Palette, Maximize2, Eye, Save, Zap, Send, 
  MoreHorizontal, Grid, Magnet, Square, Ruler, RotateCcw, 
  LayoutTemplate, Type, Image, Trophy, Undo, Redo, Sparkles, ChevronDown, Layers, SlidersHorizontal
} from 'lucide-react';

interface PosterStudioProps {
  festivalId: string;
  tenantId: string;
}

interface PosterGenerationContext {
  operationId: string;
  scope: PosterDeliveryScope;
  snapshot: PosterDesignSnapshot;
  backgroundUrl: string;
}

export default function PosterStudio({ festivalId, tenantId }: PosterStudioProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const routeParams = useLocalSearchParams<{
    deliveryId?: string | string[];
    generationId?: string | string[];
    assetId?: string | string[];
  }>();
  const readRouteParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value)?.trim() || '';
  const deliveryId = readRouteParam(routeParams.deliveryId);
  const generationId = readRouteParam(routeParams.generationId);
  const legacyAssetId = readRouteParam(routeParams.assetId);
  const editRouteKey = deliveryId ? `delivery:${deliveryId}` : generationId ? `generation:${generationId}` : legacyAssetId ? `asset:${legacyAssetId}` : '';
  const authUserId = useAuthStore((state) => state.user?.id ?? '');
  const { width } = useWindowDimensions();
  const isTablet = width >= 768 && width < 1180;
  const isDesktop = width >= 1180;

  const { zoomLevel, setZoom, fitToViewport, gridVisible, setGridVisible, gridSnap, setGridSnap, gridSize, setGridSize, rulerVisible, setRulerVisible, safeZoneVisible, setSafeZoneVisible, failedFonts } = useCanvasStore();
  const { layers, selectedIds } = useLayerStore();
  const {
    activeTemplate,
    hasUnsavedChanges,
    saveDraft,
    draftRecoveryAvailable,
    restoreDraft,
    clearDraft,
    lastSavedAt,
    variables,
    currentResultId,
    currentItemId,
    setCurrentItemId,
    setCurrentResultPublicVisible,
    bumpAssetsRefreshTick,
    isMultiFrameMode,
    setIsMultiFrameMode,
    batchItems,
    saveResultOverride,
    typographyMode,
    toggleTypographyMode,
    resultNumberMode,
    cycleResultNumberMode,
  } = useTemplateStore();
  const safeVariables = variables || {};
  const layerGroupIssues = getLayerGroupIssues(layers);
  const { data: dbTemplates } = useGetPosterTemplates(festivalId);
  const { isOnline } = useOfflineStore();
  const canUndo = useHistoryStore((s) => s.canUndo());
  const canRedo = useHistoryStore((s) => s.canRedo());


  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResizePopover, setShowResizePopover] = useState(false);
  const [isDebug, setIsDebug] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationContext, setGenerationContext] = useState<PosterGenerationContext | null>(null);
  const [downloadRecovery, setDownloadRecovery] = useState<{ blob: Blob; filename: string } | null>(null);
  const [posterCustomFontReferences, setPosterCustomFontReferences] = useState<PosterAssetReference[]>([]);
  const [editLoadState, setEditLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [editLoadError, setEditLoadError] = useState('');
  const [editMissingSourceKeys, setEditMissingSourceKeys] = useState<string[]>([]);
  const [legacyRecreatedFromTemplate, setLegacyRecreatedFromTemplate] = useState(false);
  const [editSourceSnapshot, setEditSourceSnapshot] = useState<PosterDesignSnapshot | null>(null);
  const [editSourceStatus, setEditSourceStatus] = useState<'idle' | 'checking' | 'current' | 'changed' | 'offline' | 'unavailable'>('idle');
  const [isRefreshingSource, setIsRefreshingSource] = useState(false);
  const [activeDockPanel, setActiveDockPanel] = useState<DockPanelType>('layers');
  const [isDockOpen, setIsDockOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const { contextMenu, openMenu: openContextMenu, closeMenu: closeContextMenu } = useContextMenu();
  const bgInputRef = useRef<HTMLInputElement>(null);
  const [bgUploadProgress, setBgUploadProgress] = useState<number | null>(null);
  const [bgUploadPhase, setBgUploadPhase] = useState<'preparing' | 'uploading' | null>(null);
  const [bgUploadDetails, setBgUploadDetails] = useState('');
  const bgUploadControllerRef = useRef<AbortController | null>(null);
  const processedGenerationIdsRef = useRef(new Set<string>());
  const editLoadTokenRef = useRef(0);
  const restoredDesignSignatureRef = useRef<string | null>(null);
  const deliveryOwnerIdRef = useRef<string | null>(null);
  const historyUndo = useHistoryStore((s) => s.undo);
  const historyRedo = useHistoryStore((s) => s.redo);
  // Default to first DB template (not a demo). Falls back to empty string so loadDraftOnStart gets null.
  const [currentTemplateId, setCurrentTemplateId] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsDebug(window.location.search.includes('debug=1'));
    }
  }, []);

  // When DB templates first load, auto-select the last used one, or the first one
  useEffect(() => {
    if (editRouteKey) return;
    if (!dbTemplates) return; // Wait until data is fetched

    if (dbTemplates.length === 0) {
      const state = useTemplateStore.getState();
      if (!state.activeTemplate || state.activeTemplate.id !== 'starter-template') {
        state.loadStarterTemplate();
      }
    } else if (dbTemplates.length > 0 && !currentTemplateId) {
      const lastId = localStorage.getItem('posterStudio_lastTemplateId');
      const exists = lastId && dbTemplates.find((t: any) => t.id === lastId);
      setCurrentTemplateId(exists ? lastId : dbTemplates[0].id!);
    }
  }, [dbTemplates, currentTemplateId, editRouteKey]);

  // Initial Draft Loading — only fires when a real templateId is set
  useEffect(() => {
    if (!editRouteKey && currentTemplateId) {
      useTemplateStore.getState().loadDraftOnStart(currentTemplateId);
    }
  }, [currentTemplateId, editRouteKey]);

  useEffect(() => {
    if (!editRouteKey) {
      restoredDesignSignatureRef.current = null;
      setEditLoadState('idle');
      setEditLoadError('');
      setEditMissingSourceKeys([]);
      setLegacyRecreatedFromTemplate(false);
      setEditSourceSnapshot(null);
      setEditSourceStatus('idle');
      return;
    }
    if (!authUserId || !festivalId || !tenantId) return;

    const token = ++editLoadTokenRef.current;
    const scope: PosterDeliveryScope = { userId: authUserId, tenantId, festivalId };
    const objectUrls: string[] = [];
    let cancelled = false;
    setEditLoadState('loading');
    setEditLoadError('');
    setEditMissingSourceKeys([]);
    setLegacyRecreatedFromTemplate(false);
    setEditSourceStatus('idle');

    const isCurrentRequest = () => {
      const auth = useAuthStore.getState();
      return !cancelled
        && editLoadTokenRef.current === token
        && auth.user?.id === scope.userId
        && (auth.tenant_id === scope.tenantId || auth.is_superadmin === true)
        && tenantId === scope.tenantId
        && festivalId === scope.festivalId;
    };

    const contentTypeForReference = (reference: PosterAssetReference): string => {
      if (reference.contentType) return reference.contentType;
      const extension = reference.assetKey.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
      if (extension === 'png') return 'image/png';
      if (extension === 'webp') return 'image/webp';
      if (extension === 'gif') return 'image/gif';
      if (extension === 'svg') return 'image/svg+xml';
      if (extension === 'woff2') return 'font/woff2';
      if (extension === 'woff') return 'font/woff';
      if (extension === 'otf') return 'font/otf';
      if (extension === 'ttf') return 'font/ttf';
      return 'image/jpeg';
    };

    const restoreLegacyAsset = async (assetId: string): Promise<PosterDesignSnapshot | null> => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) {
        throw new Error('This Media Center asset ID is invalid.');
      }
      const { data: asset, error: assetError } = await supabase
        .from('generated_assets')
        .select('*')
        .eq('id', assetId)
        .eq('tenant_id', scope.tenantId)
        .eq('festival_id', scope.festivalId)
        .maybeSingle();
      if (assetError) throw new Error('The Media Center asset could not be loaded.');
      if (!asset) throw new Error('This poster was not found in the active tenant and festival.');
      if (typeof asset.generation_id === 'string' && asset.generation_id) {
        const savedGeneration = await getPosterGenerationSnapshot(asset.generation_id, scope);
        if (!savedGeneration) throw new Error('The editable design for this poster is unavailable to the current account.');
        if (savedGeneration.generationId !== asset.generation_id) throw new Error('The server returned a different poster generation.');
        return savedGeneration.snapshot;
      }

      if (typeof asset.template_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(asset.template_id)) {
        throw new Error('Original editable design unavailable. This poster has no saved template to recreate from.');
      }
      const { data: storedTemplate, error: templateError } = await supabase
        .from('poster_templates')
        .select('*')
        .eq('id', asset.template_id)
        .eq('tenant_id', scope.tenantId)
        .eq('festival_id', scope.festivalId)
        .maybeSingle();
      if (templateError || !storedTemplate) {
        throw new Error('Original editable design unavailable. The saved template is no longer available in this festival.');
      }
      if (!Number.isFinite(storedTemplate.width) || !Number.isFinite(storedTemplate.height)
        || storedTemplate.width <= 0 || storedTemplate.height <= 0
        || !Array.isArray(storedTemplate.layers)) {
        throw new Error('The saved template has invalid dimensions or layer data and cannot be recreated safely.');
      }
      const layerResults = storedTemplate.layers.map((layer: unknown) => LayerSchema.safeParse(layer));
      if (layerResults.some((result: { success: boolean }) => !result.success)) {
        throw new Error('The saved template contains unsupported layer data. The original poster is still available in Media Center.');
      }

      const missingKeys = new Set<string>();
      const resolveLegacyReference = async (source: string): Promise<string> => {
        const reference = stablePosterAssetReference(source);
        if (!reference) return source;
        if (/^https?:\/\//i.test(reference.assetKey) || reference.assetKey.startsWith('/')) return reference.assetKey;
        return storageService.getPresignedUrl(reference.assetKey, contentTypeForReference(reference), 'download');
      };
      const layers = await Promise.all((storedTemplate.layers as LayerData[]).map(async (layer) => {
        if (layer.type !== 'image' || !layer.src) return layer;
        try {
          return { ...layer, src: await resolveLegacyReference(layer.src) };
        } catch {
          const reference = stablePosterAssetReference(layer.src);
          if (reference) missingKeys.add(reference.assetKey);
          return layer;
        }
      }));

      let backgroundUrl = typeof storedTemplate.background_url === 'string' ? storedTemplate.background_url : '';
      if (backgroundUrl) {
        try {
          backgroundUrl = await resolveLegacyReference(backgroundUrl);
        } catch {
          const reference = stablePosterAssetReference(backgroundUrl);
          if (reference) missingKeys.add(reference.assetKey);
          backgroundUrl = '';
        }
      }

      const resultRows = await resultVisibilityService.listPosterStudioResults(scope.tenantId, scope.festivalId);
      const matchingRows = resultRows.filter((row) => row.published === true && (
        typeof asset.event_id === 'string' && asset.event_id
          ? row.item_id === asset.event_id
          : typeof asset.result_id === 'string' && row.result_id === asset.result_id
      ));
      const selectedResult = matchingRows.find((row) => row.result_id === asset.result_id) ?? matchingRows[0];
      const variables = selectedResult ? {
        event_name: selectedResult.item_name,
        result_no: resolveOfficialResultNumber(matchingRows).value,
        ...buildRankVariables(matchingRows),
      } : {};
      const recreatedTemplate: TemplateData = {
        id: storedTemplate.id,
        name: `${storedTemplate.name || 'Poster'} (recreated)`,
        background_url: backgroundUrl,
        background_transform: storedTemplate.background_transform || undefined,
        width: storedTemplate.width,
        height: storedTemplate.height,
        aspect_ratio: storedTemplate.aspect_ratio || `${storedTemplate.width}:${storedTemplate.height}`,
        layers,
        schema_version: storedTemplate.schema_version || '1.0',
        template_version: storedTemplate.version || storedTemplate.template_version || 1,
        status: storedTemplate.status === 'published' || storedTemplate.status === 'pending_approval' ? storedTemplate.status : 'draft',
        isLocal: false,
        isPublishable: true,
      };
      if (!isCurrentRequest()) return null;
      const sourceFingerprint = matchingRows.length > 0 ? fingerprintOfficialResults(matchingRows) : '';
      restoredDesignSignatureRef.current = JSON.stringify({ layers, variables });
      useTemplateStore.getState().restorePosterDesign({
        template: recreatedTemplate,
        layers,
        variables,
        itemId: selectedResult?.item_id ?? null,
        resultId: selectedResult?.result_id ?? null,
        sourceResultFingerprint: sourceFingerprint,
        typographyMode: useTemplateStore.getState().typographyMode,
      });
      if (selectedResult) {
        useTemplateStore.getState().setCurrentResultPublicVisible(matchingRows.some((row) => row.public_visible));
        await useTemplateStore.getState().loadResultOverride(selectedResult.result_id, isCurrentRequest);
        restoredDesignSignatureRef.current = JSON.stringify({
          layers: useLayerStore.getState().layers,
          variables: useTemplateStore.getState().variables,
        });
      }
      if (!isCurrentRequest()) return null;
      setEditSourceSnapshot(null);
      setEditSourceStatus('idle');
      setEditMissingSourceKeys([...missingKeys]);
      setLegacyRecreatedFromTemplate(true);
      setEditLoadState('ready');
      return null;
    };

    const restore = async () => {
      try {
        let snapshot: PosterDesignSnapshot | null = null;
        let sourceAssets: PosterSourceAssetBlob[] = [];
        if (deliveryId) {
          const localRecord = await getPosterDelivery(deliveryId, scope);
          if (localRecord) {
            snapshot = localRecord.snapshot;
            sourceAssets = localRecord.sourceAssets ?? [];
          }
        } else if (generationId) {
          const serverSnapshot = await getPosterGenerationSnapshot(generationId, scope);
          if (!serverSnapshot) throw new Error('The editable Poster Studio snapshot was not found for this generation.');
          if (serverSnapshot.generationId !== generationId) throw new Error('The server returned a different poster generation.');
          snapshot = serverSnapshot.snapshot;
        } else if (legacyAssetId) {
          snapshot = await restoreLegacyAsset(legacyAssetId);
          if (!snapshot) return;
        }

        if (!snapshot && generationId) {
          throw new Error('The editable Poster Studio snapshot is unavailable for this generation.');
        }
        if (!snapshot || !isPosterDesignSnapshot(snapshot)) {
          throw new Error('The saved Poster Studio design snapshot is invalid or unavailable.');
        }
        const accessMode = generationId ? 'tenant_shared' : 'owner_only';
        if (!canAccessPosterSnapshot(snapshot, scope, accessMode)) {
          throw new Error('This poster belongs to a different account, tenant, or festival.');
        }

        // Re-evaluate availability on each restore; older local records may have
        // marked every stable reference as missing before trying to reconnect it.
        const missingKeys = new Set<string>();
        const cachedByKey = new Map(sourceAssets.map((asset) => [asset.assetKey, asset]));
        const resolvedByKey = new Map<string, string>();
        const resolveReference = async (reference: PosterAssetReference): Promise<string> => {
          const existing = resolvedByKey.get(reference.assetKey);
          if (existing) return existing;
          const cached = cachedByKey.get(reference.assetKey);
          if (cached) {
            const objectUrl = URL.createObjectURL(cached.blob);
            objectUrls.push(objectUrl);
            resolvedByKey.set(reference.assetKey, objectUrl);
            return objectUrl;
          }
          if (/^https?:\/\//i.test(reference.assetKey) || reference.assetKey.startsWith('/')) {
            resolvedByKey.set(reference.assetKey, reference.assetKey);
            return reference.assetKey;
          }
          const url = await storageService.getPresignedUrl(
            reference.assetKey,
            contentTypeForReference(reference),
            'download',
          );
          resolvedByKey.set(reference.assetKey, url);
          return url;
        };

        const layers = await Promise.all(snapshot.layers.map(async (layer) => {
          if (layer.type !== 'image' || !layer.src) return layer;
          const reference = stablePosterAssetReference(layer.src);
          if (!reference) return layer;
          const savedReference = snapshot!.assetReferences.find((entry) => entry.assetKey === reference.assetKey) ?? reference;
          try {
            return { ...layer, src: await resolveReference(savedReference) };
          } catch {
            missingKeys.add(savedReference.assetKey);
            return layer;
          }
        }));

        let backgroundUrl = '';
        if (snapshot.backgroundAsset) {
          try {
            backgroundUrl = await resolveReference(snapshot.backgroundAsset);
          } catch {
            missingKeys.add(snapshot.backgroundAsset.assetKey);
          }
        }
        for (const font of snapshot.customFontReferences) {
          if (!font.fontFamily) continue;
          try {
            const url = await resolveReference(font);
            await loadFont({
              family: font.fontFamily,
              url,
              cacheKey: font.assetKey,
              category: 'Custom Fonts',
            });
          } catch {
            missingKeys.add(font.assetKey);
          }
        }

        if (!isCurrentRequest()) return;
        restoredDesignSignatureRef.current = JSON.stringify({ layers, variables: snapshot.variables });
        const template = {
          id: snapshot.templateId,
          name: 'Poster generation design',
          background_url: backgroundUrl,
          background_transform: snapshot.backgroundTransform ?? undefined,
          width: snapshot.width,
          height: snapshot.height,
          aspect_ratio: `${snapshot.width}:${snapshot.height}`,
          layers,
          schema_version: '1.0.0',
          template_version: snapshot.templateVersion,
          status: 'draft' as const,
          isLocal: false,
          isPublishable: true,
        };
        useTemplateStore.getState().restorePosterDesign({
          template,
          layers,
          variables: snapshot.variables,
          itemId: snapshot.itemId,
          resultId: snapshot.resultId,
          sourceResultFingerprint: snapshot.sourceResultFingerprint,
          typographyMode: snapshot.typographyMode,
        });
        setEditSourceSnapshot(snapshot);
        setEditMissingSourceKeys([...missingKeys]);
        setEditLoadState('ready');
      } catch (error) {
        if (!isCurrentRequest()) return;
        setEditLoadError(error instanceof Error ? error.message : 'Poster design could not be restored.');
        setEditLoadState('error');
      }
    };

    void restore();
    return () => {
      cancelled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [editRouteKey, deliveryId, generationId, legacyAssetId, authUserId, tenantId, festivalId]);

  useEffect(() => {
    if (!editRouteKey || editLoadState !== 'ready' || !editSourceSnapshot) return;
    const activeScope = { userId: authUserId, tenantId, festivalId };
    if (!canAccessPosterSnapshot(editSourceSnapshot, activeScope, generationId ? 'tenant_shared' : 'owner_only')) return;
    if (!isOnline) {
      setEditSourceStatus('offline');
      return;
    }

    let cancelled = false;
    setEditSourceStatus('checking');
    void resultVisibilityService.listPosterStudioResults(tenantId, festivalId)
      .then((results) => {
        if (cancelled) return;
        const officialRows = results.filter((row) => row.published === true && (
          editSourceSnapshot.itemId
            ? row.item_id === editSourceSnapshot.itemId
            : row.result_id === editSourceSnapshot.resultId
        ));
        setEditSourceStatus(
          fingerprintOfficialResults(officialRows) === editSourceSnapshot.sourceResultFingerprint
            ? 'current'
            : 'changed',
        );
      })
      .catch(() => {
        if (!cancelled) setEditSourceStatus('unavailable');
      });
    return () => { cancelled = true; };
  }, [editRouteKey, editLoadState, editSourceSnapshot, authUserId, tenantId, festivalId, generationId, isOnline]);

  // Load the custom-font manifest at startup. Font binaries are fetched only
  // when a font is selected or needed by the poster being rendered.
  useEffect(() => {
    setPosterCustomFontReferences([]);
    if (!tenantId) return;
    let cancelled = false;
    const loadCustomFontReferences = async () => {
      try {
        const fonts = await fontService.getFonts(tenantId, festivalId);
        if (cancelled) return;
        setPosterCustomFontReferences(fonts.flatMap((font) => {
          const metadata = font.metadata as FontMetadata | null;
          const reference = stablePosterAssetReference(font.file_url);
          return metadata?.family && reference
            ? [{ ...reference, assetId: font.id, fontFamily: metadata.family }]
            : [];
        }));
      } catch (e) {
        if (!cancelled) console.error('Failed to load custom font references:', e);
      }
    };
    void loadCustomFontReferences();
    return () => { cancelled = true; };
  }, [tenantId, festivalId]);

  const handleToolClick = useCallback((panel: DockPanelType) => {
    if (activeDockPanel === panel && isDockOpen) {
      // Don't auto-close on click if user wants it open, wait, the rule says:
      // "Clicking a tool should open or switch the corresponding panel."
      // If they click the *same* tool again, should it close? "Close dock must be user-controlled".
      // But standard toggles close it. Let's keep it open, or toggle it. Canva toggles it. Let's just switch or open.
      setIsDockOpen(true);
    } else {
      setActiveDockPanel(panel);
      setIsDockOpen(true);
    }
  }, [activeDockPanel, isDockOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDockOpen) {
        e.preventDefault();
        e.stopPropagation(); // Prevent useKeyboardShortcuts from clearing selection
        setIsDockOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isDockOpen]);

  useEffect(() => {
    if (!isViewMenuOpen && !isMoreMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!viewMenuRef.current?.contains(target)) setIsViewMenuOpen(false);
      if (!moreMenuRef.current?.contains(target)) setIsMoreMenuOpen(false);
    };
    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsViewMenuOpen(false);
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleMenuKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleMenuKeyDown);
    };
  }, [isViewMenuOpen, isMoreMenuOpen]);

  // ── Result Number Typography Mode Switcher ──────────
  const handleResultModeSwitch = () => {
    // 1. Update mode in store
    useTemplateStore.getState().cycleResultNumberMode();
    const newMode = useTemplateStore.getState().resultNumberMode;
    const preset = RESULT_NUMBER_PRESETS[newMode];

    // 2. Find result_no layer
    const { layers: ls, updateLayer } = useLayerStore.getState();
    const resultLayer = ls.find(l => l.dynamicBinding === 'result_no' || l.text?.includes('{result_no}'));

    if (resultLayer) {
      useHistoryStore.getState().push(ls);
      updateLayer(resultLayer.id, {
        fontFamily: preset.fontFamily,
        fontWeight: preset.fontWeight,
        fontSize: preset.fontSize,
      });
      useTemplateStore.getState().markUnsaved();
    }
  };

  const selectedLayer = selectedIds.length === 1 ? layers.find((l) => l.id === selectedIds[0]) || null : null;

  // Register keyboard shortcuts
  useKeyboardShortcuts(Boolean(editRouteKey));
  useMemoryBudget();

  useEffect(() => {
    const onShowShortcuts = () => setShowShortcuts(true);
    window.addEventListener('poster-studio:show-shortcuts', onShowShortcuts);
    return () => window.removeEventListener('poster-studio:show-shortcuts', onShowShortcuts);
  }, []);

  // Dirty State Marking
  useEffect(() => {
    if (editRouteKey && editLoadState !== 'ready') return;
    const signature = JSON.stringify({ layers, variables: safeVariables });
    if (restoredDesignSignatureRef.current === signature) return;
    restoredDesignSignatureRef.current = null;
    if (layers.length > 0) {
      useTemplateStore.getState().markUnsaved();
    }
  }, [layers, safeVariables, editRouteKey, editLoadState]);

  // Debounced Autosave
  useEffect(() => {
    if (editRouteKey || !hasUnsavedChanges) return;
    const timer = setTimeout(() => {
      saveDraft();
    }, 1500);
    return () => clearTimeout(timer);
  }, [hasUnsavedChanges, saveDraft, editRouteKey]);

  // Warn on Unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useTemplateStore.getState().hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes.';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Network detection
  const { setIsOnline } = useOfflineStore();
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [setIsOnline]);

  const canvasW = activeTemplate?.width || 1080;
  const canvasH = activeTemplate?.height || 1080;

  // Status bar text
  const saveStatus = !isOnline
    ? '📡 Offline — changes queued'
    : hasUnsavedChanges
    ? '● Unsaved changes'
    : lastSavedAt
    ? `✓ Saved ${formatRelativeTime(lastSavedAt)}`
    : '✓ Draft saved';

  const runValidation = () => {
    if (!activeTemplate) return;
    const issues = validateTemplateHealth(activeTemplate, layers, useTemplateStore.getState().variables);
    setValidationIssues(issues);
    setShowValidation(true);
  };

  // Upload the user-selected background through the shared, format-preserving R2 path.
  const handleBgUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const controller = new AbortController();
    bgUploadControllerRef.current = controller;
    try {
      setBgUploadDetails('');
      setBgUploadProgress(0);
      const { metadata, uploadedFile } = await uploadPosterBackground(file, {
        festivalId,
        tenantId,
        templateWidth: activeTemplate?.width || canvasW,
        templateHeight: activeTemplate?.height || canvasH,
        backgroundScale: activeTemplate?.background_transform?.scale,
        signal: controller.signal,
        onPhase: setBgUploadPhase,
        onPrepared: (preparedFile) => setBgUploadDetails(
          `${file.name} · ${formatBackgroundSize(file.size)} → ${formatBackgroundSize(preparedFile.size)}`,
        ),
        onProgress: setBgUploadProgress,
      });
      useTemplateStore.getState().updateTemplateMeta({ background_url: `r2://${metadata.object_key}` });
      setBgUploadDetails(`${file.name} · ${formatBackgroundSize(file.size)} → ${formatBackgroundSize(uploadedFile.size)} uploaded`);
    } catch (err) {
      console.error('Top bar BG upload failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to upload background image. Retry after checking your connection.');
    } finally {
      if (bgUploadControllerRef.current === controller) bgUploadControllerRef.current = null;
      setBgUploadPhase(null);
      setBgUploadProgress(null);
      e.target.value = '';
    }
  }, [activeTemplate?.background_transform?.scale, activeTemplate?.height, activeTemplate?.width, canvasH, canvasW, festivalId, tenantId]);

  // Layer quick actions
  const handleDuplicateLayer = () => {
    if (!selectedLayer) return;
    const { layers: ls } = useLayerStore.getState();
    const { duplicateLayer } = useLayerStore.getState();
    useHistoryStore.getState().push(ls);
    duplicateLayer(selectedLayer.id);
  };

  const handleAddText = () => {
    const { addLayer, layers: ls } = useLayerStore.getState();
    useHistoryStore.getState().push(ls);
    const newId = `layer_text_${Date.now()}`;
    addLayer({
      id: newId,
      type: 'text',
      version: '1.0',
      name: 'New Text',
      text: 'New Text',
      x: canvasW / 2 - 100,
      y: canvasH / 2 - 20,
      width: 200,
      height: 40,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      fontSize: 32,
      fontFamily: 'Outfit',
      fontWeight: 600,
      fill: '#000000',
      align: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
      zIndex: ls.length > 0 ? Math.max(...ls.map(l => l.zIndex)) + 1 : 1,
      isVisible: true,
      isLocked: false,
      lockProfile: 'editable',
    });
    useLayerStore.getState().setSelectedIds([newId]);
  };

  // ── Insert pre-styled Event Name Primary + Secondary layers ──────────
  const insertEventNameLayers = () => {
    const { addLayer, layers: ls } = useLayerStore.getState();
    useHistoryStore.getState().push(ls);
    const maxZ = ls.length > 0 ? Math.max(...ls.map(l => l.zIndex)) + 1 : 10;
    const cx = (activeTemplate?.width ?? 1080) / 2;
    const cy = (activeTemplate?.height ?? 1080) / 2;
    const primaryId = `evt_primary_${Date.now()}`;
    const secondaryId = `evt_secondary_${Date.now() + 1}`;
    addLayer({
      id: primaryId, type: 'text', version: '1.0',
      name: 'Event Name Primary',
      text: '{event_name_primary}',
      x: cx - 440, y: cy - 100, width: 880, height: 90,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      fontSize: 52, fontFamily: 'Outfit', fontWeight: 900,
      fill: '#000000', align: 'center', lineHeight: 1.1, letterSpacing: 1,
      overflowMode: 'auto-shrink', maxLines: 2,
      zIndex: maxZ, isVisible: true, isLocked: false, lockProfile: 'editable',
      dynamicBinding: 'event_name_primary',
    });
    addLayer({
      id: secondaryId, type: 'text', version: '1.0',
      name: 'Event Name Secondary',
      text: '{event_name_secondary}',
      x: cx - 440, y: cy + 4, width: 880, height: 64,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      fontSize: 32, fontFamily: 'Outfit', fontWeight: 400,
      fill: '#333333', align: 'center', lineHeight: 1.2, letterSpacing: 0,
      overflowMode: 'auto-shrink', maxLines: 1,
      zIndex: maxZ + 1, isVisible: true, isLocked: false, lockProfile: 'editable',
      dynamicBinding: 'event_name_secondary',
    });
    useLayerStore.getState().setSelectedIds([primaryId]);
    useTemplateStore.getState().markUnsaved();
    useTemplateStore.getState().updateStableLayout();
  };

  const handleDeleteLayer = () => {
    if (!selectedLayer) return;
    const { layers: ls, removeLayer } = useLayerStore.getState();
    useHistoryStore.getState().push(ls);
    removeLayer(selectedLayer.id);
  };

  const scaleText = (factor: number) => {
    const currentLayers = useLayerStore.getState().layers;
    const selectedIds = useLayerStore.getState().selectedIds;
    useHistoryStore.getState().push(currentLayers);
    
    const newLayers = currentLayers.map(l => {
      if (l.type === 'text' && l.fontSize) {
        if (selectedIds.length > 0 && !selectedIds.includes(l.id)) {
          return l;
        }
        return { ...l, fontSize: Math.max(8, Math.round(l.fontSize * factor)) };
      }
      return l;
    });
    useLayerStore.getState().setLayers(newLayers);
  };

  const beginSingleGeneration = useCallback(() => {
    try {
      const current = useTemplateStore.getState();
      const template = current.activeTemplate;
      const auth = useAuthStore.getState();
      const userId = auth.user?.id;
      if (!template || !current.currentItemId || !current.currentResultId) {
        throw new Error('Select an official result before generating a poster.');
      }
      if (!userId || (auth.tenant_id !== tenantId && auth.is_superadmin !== true)) {
        throw new Error('Sign in to the selected tenant before generating a poster.');
      }
      if (!template.id || template.isLocal || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(template.id)) {
        throw new Error('Save this template to the database before generating a poster.');
      }
      const scope = { userId, tenantId, festivalId };
      const operationId = createPosterOperationId();
      const snapshot = createPosterDesignSnapshot({
        scope,
        template,
        itemId: current.currentItemId,
        resultId: current.currentResultId,
        layers: useLayerStore.getState().layers,
        variables: current.variables,
        typographyMode: current.typographyMode,
        sourceResultFingerprint: current.sourceResultFingerprint,
        customFontReferences: posterCustomFontReferences,
      });
      processedGenerationIdsRef.current.delete(operationId);
      setGenerationContext({ operationId, scope, snapshot, backgroundUrl: template.background_url });
      setIsGenerating(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Poster generation could not start.');
    }
  }, [festivalId, tenantId, posterCustomFontReferences]);

  const handleCapture = useCallback(async (captureFunc: (ratio?: number) => Promise<Blob>) => {
    const context = generationContext;
    if (!context || processedGenerationIdsRef.current.has(context.operationId)) return;
    processedGenerationIdsRef.current.add(context.operationId);
    let blob: Blob | null = null;
    let savedLocally = false;
    try {
      blob = await captureFunc();
      const dimensions = await measurePosterBlob(blob);
      const record = createPendingPosterDelivery({
        operationId: context.operationId,
        scope: context.scope,
        snapshot: context.snapshot,
        blob,
        ...dimensions,
      });
      await savePendingPosterDelivery(record);
      savedLocally = true;

      if (!deliveryOwnerIdRef.current) deliveryOwnerIdRef.current = createPosterOperationId();
      const outcome = await runPosterDelivery(
        context.operationId,
        context.scope,
        deliveryOwnerIdRef.current,
        {
          isScopeActive: (scope) => {
            const auth = useAuthStore.getState();
            return auth.user?.id === scope.userId
              && (auth.tenant_id === scope.tenantId || auth.is_superadmin === true)
              && festivalId === scope.festivalId
              && tenantId === scope.tenantId;
          },
        },
      );

      const auth = useAuthStore.getState();
      const stillInScope = auth.user?.id === context.scope.userId
        && (auth.tenant_id === context.scope.tenantId || auth.is_superadmin === true)
        && festivalId === context.scope.festivalId
        && tenantId === context.scope.tenantId;
      if (stillInScope && outcome.status === 'synced') {
        queryClient.invalidateQueries({ queryKey: ['generated-assets', festivalId] });
        bumpAssetsRefreshTick();
        useTemplateStore.getState().updateStableLayout();
        alert(outcome.result.visibilityStatus === 'published'
          ? 'Poster saved on this device and uploaded to Media Center.'
          : 'Poster saved on this device and uploaded as a Media Center draft.');
      } else if (stillInScope && outcome.status === 'failed') {
        alert(`Poster saved on this device. Upload is pending and can be retried from Media Center. ${outcome.error}`);
      } else if (stillInScope && outcome.status === 'busy') {
        alert('Poster is saved on this device and another Studio tab is already uploading it.');
      } else if (stillInScope && outcome.status === 'missing') {
        alert('Poster image is ready, but its local recovery record could not be found. Generate it again before retrying.');
      }
    } catch (error) {
      console.error(error);
      if (!savedLocally && blob) {
        setDownloadRecovery({
          blob,
          filename: `poster-${context.snapshot.itemId || context.snapshot.resultId}.jpg`,
        });
        alert('Local recovery could not be saved. Download the generated poster before closing this page.');
      } else if (!savedLocally) {
        alert(`Poster could not be saved: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } else {
        const auth = useAuthStore.getState();
        if (auth.user?.id === context.scope.userId
          && (auth.tenant_id === context.scope.tenantId || auth.is_superadmin === true)) {
          alert(`Poster is saved on this device. Upload can be retried from Media Center. ${error instanceof Error ? error.message : ''}`);
        }
      }
    } finally {
      setIsGenerating(false);
      setGenerationContext(null);
    }
  }, [generationContext, festivalId, tenantId, queryClient, bumpAssetsRefreshTick]);

  const handleRenderError = useCallback((error: Error) => {
    console.error('[PosterStudio] Poster renderer failed before upload.', error);
    setIsGenerating(false);
    setGenerationContext(null);
    alert(`Poster could not be rendered, so no upload was started. ${error.message}`);
  }, []);

  const refreshOfficialResultData = useCallback(async () => {
    if (!editSourceSnapshot || !isOnline) return;
    setIsRefreshingSource(true);
    try {
      const auth = useAuthStore.getState();
      const activeScope = {
        userId: auth.user?.id ?? '',
        tenantId: tenantId,
        festivalId: festivalId,
      };
      if (!canAccessPosterSnapshot(
        editSourceSnapshot,
        activeScope,
        generationId ? 'tenant_shared' : 'owner_only',
      ) || (auth.tenant_id !== editSourceSnapshot.tenantId && auth.is_superadmin !== true)) {
        throw new Error('The active account or festival changed. Reopen this poster from Media Center.');
      }

      const results = await resultVisibilityService.listPosterStudioResults(tenantId, festivalId);
      const officialRows = results.filter((row) => row.published === true && (
        editSourceSnapshot.itemId
          ? row.item_id === editSourceSnapshot.itemId
          : row.result_id === editSourceSnapshot.resultId
      ));
      if (officialRows.length === 0) throw new Error('No current official result rows are available for this poster.');

      const current = useTemplateStore.getState();
      const nextFingerprint = fingerprintOfficialResults(officialRows);
      current.setVariables({
        ...current.variables,
        ...buildRankVariables(officialRows),
        result_no: resolveOfficialResultNumber(officialRows).value,
      });
      current.setSourceResultFingerprint(nextFingerprint);
      current.markUnsaved();
      setEditSourceStatus('current');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Official result data could not be refreshed.');
      setEditSourceStatus('unavailable');
    } finally {
      setIsRefreshingSource(false);
    }
  }, [editSourceSnapshot, isOnline, festivalId, tenantId, generationId]);

  if (editRouteKey && editLoadState !== 'ready') {
    return (
      <div style={{ ...styles.root, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, width: '100%', background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 12px 40px rgba(15, 23, 42, 0.14)' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 18, color: 'var(--ps-text)' }}>
            {editLoadState === 'error' ? 'Poster design could not be opened' : 'Restoring poster design'}
          </h2>
          <p style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 1.5, color: 'var(--ps-muted)' }}>
            {editLoadState === 'error' ? editLoadError : 'Checking the saved design and reconnecting its source assets…'}
          </p>
          <button onClick={() => router.back()} style={styles.modalBtn}>Back to Media Center</button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="poster-studio" style={{ ...posterStudioThemeStyle, ...styles.root }}>
        {/* ---- OFFLINE BANNER ---- */}
      {!isOnline && (
        <div style={styles.offlineBanner}>
          📡 Offline — changes will sync when connection restores
        </div>
      )}

      {/* ---- DRAFT RECOVERY BANNER ---- */}
      {draftRecoveryAvailable && !editRouteKey && (
        <div style={styles.draftBanner}>
          <span>🗂 Unsaved draft found from a previous session.</span>
          <div style={styles.draftActions}>
            <button onClick={() => restoreDraft()} style={styles.draftBtn}>Restore Draft</button>
            <button onClick={() => clearDraft()} style={{ ...styles.draftBtn, backgroundColor: 'transparent', color: coreColor('#64748B', 'textMuted') }}>Discard</button>
          </div>
        </div>
      )}
      {editMissingSourceKeys.length > 0 && (
        <div role="status" style={{ margin: '8px 16px', padding: '10px 12px', borderRadius: 8, background: '#fff7ed', color: '#9a3412', fontSize: 13 }}>
          The design is editable, but {editMissingSourceKeys.length} source asset{editMissingSourceKeys.length === 1 ? '' : 's'} could not be reconnected. Affected image or font layers may need their source reselected before generating.
        </div>
      )}
      {legacyRecreatedFromTemplate && (
        <div role="status" style={{ margin: '8px 16px', padding: '10px 12px', borderRadius: 8, background: '#eff6ff', color: '#1e40af', fontSize: 13 }}>
          Original editable design unavailable. This is a new design from the currently saved template and available official result data. The previous Media Center poster remains unchanged; Generate saves a new poster. Select a current result from Results if one was not restored.
        </div>
      )}
      {layerGroupIssues.length > 0 && (
        <div role="alert" style={{ margin: '8px 16px', padding: '10px 12px', borderRadius: 8, background: '#fff7ed', color: '#9a3412', fontSize: 13 }}>
          Some saved groups refer to {layerGroupIssues.reduce((count, issue) => count + issue.missingLayerIds.length, 0)} missing layer record(s). Their artwork cannot be reconstructed automatically; rebuild those elements manually.
        </div>
      )}
      {editRouteKey && !legacyRecreatedFromTemplate && (
        <div role="status" style={{ margin: '8px 16px', padding: '10px 12px', borderRadius: 8, background: '#eff6ff', color: '#1e40af', fontSize: 13 }}>
          Re-editing a saved design. Generate creates a new poster revision; the current Media Center poster stays available until the new upload is finalized.
        </div>
      )}
      {editRouteKey && editSourceSnapshot && editLoadState === 'ready' && editSourceStatus !== 'current' && (
        <div role="status" style={{ margin: '8px 16px', padding: '10px 12px', borderRadius: 8, background: editSourceStatus === 'changed' ? '#fff7ed' : '#eff6ff', color: editSourceStatus === 'changed' ? '#9a3412' : '#1e40af', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>
            {editSourceStatus === 'changed' && 'Official result data changed since this poster was generated.'}
            {editSourceStatus === 'checking' && 'Checking whether official result data has changed…'}
            {editSourceStatus === 'offline' && 'Offline: this saved design is open; official result data cannot be refreshed.'}
            {editSourceStatus === 'unavailable' && 'Official result data could not be checked. The saved design remains unchanged.'}
            {editSourceStatus === 'idle' && 'Official result source status is not available.'}
          </span>
          {editSourceStatus === 'changed' && (
            <button onClick={refreshOfficialResultData} disabled={isRefreshingSource || !isOnline} style={styles.draftBtn}>
              {isRefreshingSource ? 'Refreshing…' : 'Refresh result data'}
            </button>
          )}
        </div>
      )}

      {/* ---- FONT FAILURE TOAST ---- */}
      {failedFonts.length > 0 && (
        <div style={styles.fontWarning}>
          ⚠ Font unavailable: {failedFonts.join(', ')} — system fallback active. Export may differ.
        </div>
      )}

      {/* ---- TOPBAR ---- */}
      <div style={styles.topbar}>
        {/* Row 1: Brand + template name + status */}
        <div style={styles.topbarRow1}>
          <div style={styles.topbarLeft}>
            <button 
              onClick={() => router.back()}
              style={{
                background: 'transparent',
                border: 'none',
                color: coreColor('#94A3B8', 'textSubtle'),
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 600,
                padding: '6px 8px',
                borderRadius: '4px'
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = coreColor('#2a2a2a', 'surfaceMuted'))}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <ArrowLeft size={14} /> Back
            </button>
            <span style={{ width: 1, height: 16, backgroundColor: coreColor('#2a2a2a', 'surfaceStrong'), margin: '0 4px' }} />
            <span style={{ ...styles.studioTitle, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Palette size={16} color={coreColor("#38BDF8", 'info')} /> Poster Studio
            </span>
            {/* Template selector has been moved to the Templates Panel in the Right Control Dock */}
            {/* Change Background Button replacing the old status pill */}
            <input type="file" ref={bgInputRef} style={{ display: 'none' }} onChange={handleBgUpload} accept="image/jpeg,image/png,image/webp" />
            <button
              onClick={() => bgUploadPhase === null && bgInputRef.current?.click()}
              disabled={bgUploadPhase !== null}
              style={{
                marginLeft: '16px',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                backgroundColor: currentResultId ? coreColor('#8B5CF6', 'infoAction') : coreColor('#3B82F6', 'infoAction'),
                color: coreColor('white', 'onPrimary'),
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                transition: 'opacity 0.2s'
              }}
              onMouseOver={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
            >
              <Image size={14} /> {bgUploadPhase === null
                ? `Change ${currentResultId ? 'Result' : 'Template'} BG`
                : bgUploadPhase === 'preparing'
                  ? 'Preparing image…'
                  : (bgUploadProgress ?? 0) >= 100 ? 'Finishing upload…' : `Uploading ${bgUploadProgress ?? 0}%`}
            </button>
            {bgUploadPhase && storageService.providerName === 'r2' && (bgUploadPhase === 'preparing' || (bgUploadProgress ?? 0) < 100) && (
              <button
                onClick={() => bgUploadControllerRef.current?.abort()}
                style={{ padding: '4px 8px', borderRadius: 4, fontSize: 11, backgroundColor: 'transparent', color: coreColor('#94A3B8', 'textSubtle'), border: `1px solid ${coreColor('#334155', 'border')}`, cursor: 'pointer' }}
                aria-label="Cancel background image upload"
              >Cancel</button>
            )}
            {bgUploadDetails && <span title={bgUploadDetails} style={{ fontSize: 10, color: coreColor('#94A3B8', 'textSubtle'), maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bgUploadDetails}</span>}
            {currentResultId && (
               <button
                 onClick={async () => {
                   useTemplateStore.getState().setCurrentResultId(null);
                   setCurrentItemId(null);
                   setCurrentResultPublicVisible(false);
                   const activeTemplate = useTemplateStore.getState().activeTemplate;
                   if (activeTemplate) {
                     useLayerStore.getState().setLayers(activeTemplate.layers);
                   }
                 }}
                 style={{
                   marginLeft: '8px',
                   padding: '6px 12px',
                   backgroundColor: coreColor('#475569', 'surfaceStrong'),
                   color: coreColor('white', 'text'),
                   border: 'none',
                   borderRadius: '6px',
                   fontSize: '12px',
                   fontWeight: 'bold',
                   cursor: 'pointer',
                   transition: 'background-color 0.2s',
                   display: 'flex',
                   alignItems: 'center',
                   gap: '6px'
                 }}
                 onMouseOver={(e) => (e.currentTarget.style.backgroundColor = coreColor('#334155', 'surfaceMuted'))}
                 onMouseOut={(e) => (e.currentTarget.style.backgroundColor = coreColor('#475569', 'surfaceMuted'))}
               >
                 <Undo size={14} /> Back to Base Template
               </button>
            )}
            
            {/* Canvas Resize Button */}
            {activeTemplate && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowResizePopover(!showResizePopover)}
                  style={{
                    marginLeft: '8px',
                    padding: '4px 10px',
                    backgroundColor: showResizePopover ? coreColor('#334155', 'surfaceStrong') : 'transparent',
                    color: coreColor('#E2E8F0', 'text'),
                    border: `1px solid ${coreColor('#475569', 'border')}`,
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Maximize2 size={14} /> Resize
                </button>
                {showResizePopover && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 8,
                    background: coreColor('#F8FAFC', 'surfaceStrong'),
                    borderRadius: 8,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    zIndex: 1000,
                    border: `1px solid ${coreColor('#CBD5E1', 'border')}`,
                    width: 320
                  }}>
                    <CanvasSizeBlock />
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ ...styles.topbarRight, flexWrap: 'wrap' }}>
            {/* Multi-Frame Grid Toggle */}
            {activeTemplate && (
              <button
                onClick={() => {
                  if (!isMultiFrameMode && batchItems.length === 0) {
                    setActiveDockPanel('results');
                    setIsDockOpen(true);
                  }
                  setIsMultiFrameMode(!isMultiFrameMode);
                }}
                style={{
                  ...styles.topBtn,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: isMultiFrameMode ? 'var(--ps-accent)' : 'var(--ps-surface)',
                  color: isMultiFrameMode ? '#FFFFFF' : 'var(--ps-muted)',
                  borderColor: isMultiFrameMode ? 'var(--ps-accent)' : 'var(--ps-border)',
                }}
              >
                ⧉ Multi-Frame ({batchItems.length}/6)
              </button>
            )}

            {/* Viewport Dropdown */}
            <div ref={viewMenuRef} style={{ position: 'relative' }}>
              <button
                aria-haspopup="menu"
                aria-expanded={isViewMenuOpen}
                aria-controls="view-dropdown"
                onClick={() => { setIsMoreMenuOpen(false); setIsViewMenuOpen((open) => !open); }}
                style={{ ...styles.topBtn, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Eye size={14} /> View <ChevronDown size={12} />
              </button>
              {isViewMenuOpen && <div id="view-dropdown" role="menu" aria-label="Canvas view options" style={styles.dropdownMenu}>
                <button role="menuitemcheckbox" aria-checked={gridVisible} onClick={() => setGridVisible(!gridVisible)} style={{ ...styles.toolBtn, ...styles.dropdownMenuItem, color: gridVisible ? 'var(--ps-accent)' : 'var(--ps-muted)' }}><Grid size={14} /> Grid</button>
                <button role="menuitemcheckbox" aria-checked={gridSnap} onClick={() => setGridSnap(!gridSnap)} style={{ ...styles.toolBtn, ...styles.dropdownMenuItem, color: gridSnap ? 'var(--ps-accent)' : 'var(--ps-muted)' }}><Magnet size={14} /> Snap</button>
                <button role="menuitemcheckbox" aria-checked={safeZoneVisible} onClick={() => setSafeZoneVisible(!safeZoneVisible)} style={{ ...styles.toolBtn, ...styles.dropdownMenuItem, color: safeZoneVisible ? 'var(--ps-accent)' : 'var(--ps-muted)' }}><Square size={14} /> Safe Zones</button>
                <button role="menuitemcheckbox" aria-checked={rulerVisible} onClick={() => setRulerVisible(!rulerVisible)} style={{ ...styles.toolBtn, ...styles.dropdownMenuItem, color: rulerVisible ? 'var(--ps-accent)' : 'var(--ps-muted)' }}><Ruler size={14} /> Ruler</button>
              </div>}
            </div>

            {!currentResultId && !editRouteKey && (
              <button
                onClick={async () => {
                  setIsSaving(true);
                  await saveDraft();
                  
                  const currentLayers = useLayerStore.getState().layers;
                  const currentBg = activeTemplate?.background_url || '';
                  
                  if (activeTemplate?.isPublishable && activeTemplate.id && activeTemplate.id !== 'starter-template') {
                    const updatePayload: Record<string, any> = {
                      layers: currentLayers,
                      background_url: currentBg,
                      background_transform: activeTemplate.background_transform || null,
                      width: activeTemplate.width,
                      height: activeTemplate.height,
                      aspect_ratio: activeTemplate.aspect_ratio,
                    };
                    let { error: updateError } = await supabase
                      .from('poster_templates')
                      .update(updatePayload)
                      .eq('id', activeTemplate.id);
                    if (updateError && (updateError.code === '42703' || updateError.message?.includes('background_transform'))) {
                      delete updatePayload.background_transform;
                      ({ error: updateError } = await supabase
                        .from('poster_templates')
                        .update(updatePayload)
                        .eq('id', activeTemplate.id));
                    }
                    if (updateError) {
                      alert('Failed to save template: ' + updateError.message);
                      setIsSaving(false);
                      return;
                    }
                    queryClient.invalidateQueries({ queryKey: ['poster-templates', festivalId] });
                  } else {
                    const templateName = window.prompt('Enter a name to save this new template:', 'Custom Template');
                    if (templateName) {
                      const newId = crypto.randomUUID();
                      const { error } = await supabase
                        .from('poster_templates')
                        .insert({
                          id: newId,
                          tenant_id: tenantId,
                          festival_id: festivalId,
                          name: templateName,
                          background_url: currentBg,
                          width: activeTemplate?.width || 1080,
                          height: activeTemplate?.height || 1080,
                          aspect_ratio: activeTemplate?.aspect_ratio || '1:1',
                          layers: currentLayers,
                          is_active: true,
                          status: 'draft'
                        });
                      if (!error) {
                        useTemplateStore.getState().setActiveTemplate({
                          ...activeTemplate!,
                          id: newId,
                          name: templateName,
                          isPublishable: true,
                          isLocal: false
                        });
                        queryClient.invalidateQueries({ queryKey: ['poster-templates', festivalId] });
                      } else {
                        alert('Failed to save template: ' + error.message);
                      }
                    }
                  }
                  useTemplateStore.getState().markSaved();
                  setIsSaving(false);
                }}
                disabled={isSaving}
                style={{ ...styles.topBtn, ...styles.supportingAction, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Save size={14} /> {isSaving ? 'Saving...' : 'Save'}
              </button>
            )}
            {currentResultId && !editRouteKey && (
              <button
                onClick={async () => {
                  setIsSaving(true);
                  await saveResultOverride();
                  setIsSaving(false);
                }}
                disabled={isSaving}
                style={{ ...styles.topBtn, ...styles.supportingAction, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Save size={14} /> {isSaving ? 'Saving...' : 'Save Edit'}
              </button>
            )}
            {currentResultId && (
              <button 
                onClick={beginSingleGeneration}
                disabled={isGenerating}
                style={{ ...styles.topBtn, ...styles.primaryAction, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Zap size={14} /> {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            )}
            {!currentResultId && !editRouteKey && (
              <button 
                onClick={() => setShowPublish(true)} 
                  style={{ ...styles.topBtn, ...styles.supportingAction, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}
              >
                <Send size={14} /> Publish
              </button>
            )}
            
            {/* More Menu for less used actions */}
            <div ref={moreMenuRef} style={{ position: 'relative' }}>
              <button
                aria-haspopup="menu"
                aria-expanded={isMoreMenuOpen}
                aria-controls="more-dropdown"
                onClick={() => { setIsViewMenuOpen(false); setIsMoreMenuOpen((open) => !open); }}
                style={{ ...styles.topBtn, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                More <ChevronDown size={12} />
              </button>
              {isMoreMenuOpen && <div id="more-dropdown" role="menu" aria-label="More canvas actions" style={{ ...styles.dropdownMenu, minWidth: 180 }}>
                {/* ── Typography Mode Toggle ── */}
                <button
                  onClick={toggleTypographyMode}
                  title={`Typography Mode: ${typographyMode === 'A' ? 'BIG first / small second' : 'small first / BIG second'}. Click to swap.`}
                  style={{ ...styles.toolBtn, display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', color: typographyMode === 'A' ? coreColor('#818CF8', 'info') : coreColor('#A78BFA', 'info') }}
                >
                  <Type size={14} /> {typographyMode === 'A' ? 'Font: BIG/small' : 'Font: small/BIG'}
                </button>
                {/* ── Result Number Switcher ── */}
                <button
                  onClick={handleResultModeSwitch}
                  title={`Result Number Mode: ${resultNumberMode}. Click to cycle presets.`}
                  style={{ ...styles.toolBtn, display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', color: coreColor('#F472B6', 'info') }}
                >
                  <Maximize2 size={14} /> Size: {resultNumberMode}
                </button>
                {/* ── Insert Event Name Layers ── */}
                <button
                  onClick={insertEventNameLayers}
                  title="Insert pre-styled Event Name Primary + Secondary layers"
                  style={{ ...styles.toolBtn, display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', color: coreColor('#38BDF8', 'info') }}
                >
                  <Sparkles size={14} /> Insert Events
                </button>
                <div style={styles.toolDividerHoriz} />
                <button onClick={() => setShowShortcuts(true)} style={{ ...styles.toolBtn, display: 'block', width: '100%', textAlign: 'left' }}>? Shortcuts</button>
                <button
                  onClick={async () => {
                    await useTemplateStore.getState().clearDraft();
                    if (dbTemplates && dbTemplates.length > 0) {
                      const firstTemplate = dbTemplates[0];
                      await useTemplateStore.getState().loadDraftOnStart(firstTemplate.id);
                    } else {
                      useLayerStore.getState().setLayers([]);
                      useTemplateStore.getState().setActiveTemplate(null);
                    }
                    useTemplateStore.getState().markSaved();
                  }}
                  style={{ ...styles.toolBtn, display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', color: coreColor('#F87171', 'danger') }}
                >
                  <RotateCcw size={14} /> Reset Canvas
                </button>
              </div>}
            </div>

            <button
              onClick={() => {
                const result = historyUndo(layers);
                if (result) useLayerStore.getState().setLayers(result);
              }}
              disabled={!canUndo}
              aria-label="Undo"
              style={{ ...styles.topBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', opacity: canUndo ? 1 : 0.45 }}
              title="Undo (Ctrl+Z)"
            >
              <Undo size={14} />
            </button>
            <button
              onClick={() => {
                const result = historyRedo(layers);
                if (result) useLayerStore.getState().setLayers(result);
              }}
              disabled={!canRedo}
              aria-label="Redo"
              style={{ ...styles.topBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', opacity: canRedo ? 1 : 0.45 }}
              title="Redo (Ctrl+Y)"
            >
              <Redo size={14} />
            </button>
            <span style={styles.saveStatus}>{saveStatus}</span>
          </div>
        </div>

      </div>

      {/* ---- MAIN WORKSPACE ---- */}
      <div style={{ ...styles.workspace, flexDirection: isDesktop ? 'row' : 'column' }}>
        {/* ---- LEFT TOOL RAIL (Canva Style) ---- */}
        {isDesktop && (
          <div style={styles.leftRibbon}>
            <button 
              style={{ ...styles.ribbonBtn, ...(activeDockPanel === 'templates' && isDockOpen ? styles.ribbonBtnActive : {}) }}
              onClick={() => handleToolClick('templates')}
            >
              <div style={styles.ribbonIcon}><LayoutTemplate size={20} /></div>
              <span style={styles.ribbonLabel}>Templates</span>
            </button>
            <button 
              style={{ ...styles.ribbonBtn, ...(activeDockPanel === 'text' && isDockOpen ? styles.ribbonBtnActive : {}) }}
              onClick={() => handleToolClick('text')}
            >
              <div style={styles.ribbonIcon}><Type size={20} /></div>
              <span style={styles.ribbonLabel}>Text</span>
            </button>
            <button 
              style={{ ...styles.ribbonBtn, ...(activeDockPanel === 'assets' && isDockOpen ? styles.ribbonBtnActive : {}) }}
              onClick={() => handleToolClick('assets')}
            >
              <div style={styles.ribbonIcon}><Image size={20} /></div>
              <span style={styles.ribbonLabel}>Assets</span>
            </button>
            <button 
              style={{ ...styles.ribbonBtn, ...(activeDockPanel === 'layers' && isDockOpen ? styles.ribbonBtnActive : {}) }}
              onClick={() => handleToolClick('layers')}
            >
              <div style={styles.ribbonIcon}><Layers size={20} /></div>
              <span style={styles.ribbonLabel}>Layers</span>
            </button>
            <button 
              style={{ ...styles.ribbonBtn, ...(activeDockPanel === 'background' && isDockOpen ? styles.ribbonBtnActive : {}) }}
              onClick={() => handleToolClick('background')}
            >
              <div style={styles.ribbonIcon}><Palette size={20} /></div>
              <span style={styles.ribbonLabel}>Background</span>
            </button>
            <button 
              style={{ ...styles.ribbonBtn, ...(activeDockPanel === 'results' && isDockOpen ? styles.ribbonBtnActive : {}) }}
              onClick={() => handleToolClick('results')}
            >
              <div style={styles.ribbonIcon}><Trophy size={20} /></div>
              <span style={styles.ribbonLabel}>Results</span>
            </button>
          </div>
        )}

        {/* ---- CANVAS CENTER ---- */}
        <div style={styles.canvasArea}>
          {/* ---- CANVA STYLE FLOATING CONTEXT TOOLBAR ---- */}
          {activeTemplate && !isMultiFrameMode && (
            <div style={{...styles.contextToolbarPill, display: selectedLayer && selectedLayer.type === 'text' ? 'flex' : 'none'}}>
              {selectedLayer && selectedLayer.type === 'text' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <TextToolbar onOpenProperties={() => handleToolClick('properties')} />
                </div>
              )}
            </div>
          )}

          {!activeTemplate ? (
            // Empty state — no DB template loaded yet
            <div style={styles.emptyStateCenter}>
              <div style={styles.emptyStateCard}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎨</div>
                <h2 style={styles.emptyStateTitle}>No Template Loaded</h2>
                <p style={styles.emptyStateMsg}>
                  Create a database template to start designing and publishing.
                  Templates are stored in Supabase with a unique UUID and can be
                  published to Cloudflare R2.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  style={styles.emptyStateCta}
                >
                  + Create Database Template
                </button>
                {isDebug && (
                  <p style={{ color: coreColor('#475569', 'text'), fontSize: 11, marginTop: 12 }}>
                    Debug mode: Use the dropdown above to load a local demo template.
                  </p>
                )}
              </div>
            </div>
          ) : isMultiFrameMode ? (
            <MultiFrameGrid
              festivalId={festivalId}
              tenantId={tenantId}
              customFontReferences={posterCustomFontReferences}
            />
          ) : (
            <div style={styles.canvasWrapper} onContextMenu={(e) => {
              // If a layer is selected and we right-click on the canvas, it could be for the layer
              // or we pass right-click down to StudioCanvas
              // For now, if there's exactly one layer selected, we assume context menu is for that layer.
              // A better way is to pass openContextMenu down to StudioCanvas shapes.
              // We will pass it down in the next step.
            }}>
              <StudioCanvas
                canvasWidth={canvasW}
                canvasHeight={canvasH}
                backgroundUrl={activeTemplate?.background_url}
                onContextMenu={openContextMenu}
              />
            </div>
          )}
        </div>
        
        {/* ---- RIGHT CONTROL DOCK ---- */}
        {isDesktop && isDockOpen && (
          <ControlDock 
            activePanel={activeDockPanel} 
            onClose={() => setIsDockOpen(false)}
            festivalId={festivalId}
            tenantId={tenantId}
            currentTemplateId={currentTemplateId}
            setCurrentTemplateId={(newId: string) => {
              setCurrentTemplateId(newId);
              localStorage.setItem('posterStudio_lastTemplateId', newId);
              useTemplateStore.getState().setCurrentResultId(null);
            }}
            setShowCreateModal={setShowCreateModal}
          />
        )}
      </div>

      {!isDesktop && isDockOpen && (
        <div
          style={{
            ...styles.mobileDockLayer,
            ...(isTablet ? styles.tabletDockLayer : {}),
          }}
          onClick={() => setIsDockOpen(false)}
          aria-hidden="false"
        >
          <div
            style={{
              ...styles.mobileDockPanel,
              ...(isTablet ? styles.tabletDockPanel : {}),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <ControlDock
              mobile
              activePanel={activeDockPanel}
              onClose={() => setIsDockOpen(false)}
              festivalId={festivalId}
              tenantId={tenantId}
              currentTemplateId={currentTemplateId}
              setCurrentTemplateId={(newId: string) => {
                setCurrentTemplateId(newId);
                localStorage.setItem('posterStudio_lastTemplateId', newId);
                useTemplateStore.getState().setCurrentResultId(null);
              }}
              setShowCreateModal={setShowCreateModal}
            />
          </div>
        </div>
      )}

      {/* ---- PUBLISHED RESULTS PANEL (Phase 6 placeholder) ---- */}
      {/* <PublishedResultsPanel festivalId={festivalId} tenantId={tenantId} /> */}

      {/* ---- BOTTOM BAR (Viewport Controls) ---- */}
      <div style={{ ...styles.bottomBar, ...(!isDesktop ? styles.responsiveBottomBar : {}) }}>
        {!isDesktop && (
          <div style={styles.mobileToolRail} role="toolbar" aria-label="Poster editing tools">
            {MOBILE_TOOL_ITEMS.map(({ panel, label, Icon }) => {
              const selected = activeDockPanel === panel && isDockOpen;
              return (
                <button
                  key={panel}
                  type="button"
                  aria-label={label}
                  aria-pressed={selected}
                  onClick={() => handleToolClick(panel)}
                  style={{ ...styles.mobileToolButton, ...(selected ? styles.mobileToolButtonActive : {}) }}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}
        <div style={styles.bottomZoomGroup}>
          <button onClick={() => setZoom(Math.max(0.1, zoomLevel - 0.1))} style={styles.bottomToolBtn} title="Zoom Out">−</button>
          <span style={styles.bottomZoomLabel}>{Math.round(zoomLevel * 100)}%</span>
          <button onClick={() => setZoom(zoomLevel + 0.1)} style={styles.bottomToolBtn} title="Zoom In">+</button>
          <button onClick={fitToViewport} style={styles.bottomToolBtn} title="Fit to Screen">⊡ Fit</button>
        </div>
      </div>

      {/* ---- MOBILE BOTTOM SHEET ---- */}
      {!isDesktop && (
        <MobileBottomSheet
          selectedLayer={selectedLayer}
          onClose={() => useLayerStore.getState().clearSelection()}
          hidden={isDockOpen}
        />
      )}

      {/* ---- CONTEXT MENU ---- */}
      {contextMenu.isOpen && (
        <StudioContextMenu 
          x={contextMenu.x}
          y={contextMenu.y}
          targetId={contextMenu.targetId}
          targetType={contextMenu.targetType}
          onClose={closeContextMenu}
          onOpenProperties={() => {
            closeContextMenu();
            handleToolClick('properties');
          }}
        />
      )}

      {/* ---- VALIDATION MODAL ---- */}
      {showValidation && (
        <div style={styles.modalBackdrop} onClick={() => setShowValidation(false)}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Health Report</h3>
            {validationIssues.length === 0 ? (
              <p style={{ color: coreColor('#0F766E', 'primaryText'), fontSize: 13, margin: '16px 0' }}>✓ Template is perfectly healthy.</p>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto', margin: '16px 0' }}>
                {validationIssues.map((iss, i) => (
                  <div key={i} style={{ ...styles.issueRow, backgroundColor: iss.type === 'error' ? coreColor('#FEF2F2', 'dangerSoft') : coreColor('#FFFBEB', 'warningSoft'), borderColor: iss.type === 'error' ? coreColor('#FECACA', 'border') : coreColor('#FDE68A', 'border') }}>
                    <span style={{ fontSize: 16 }}>{iss.type === 'error' ? '❌' : '⚠️'}</span>
                    <span style={{ fontSize: 12, color: coreColor('#0F172A', 'overlay') }}>{iss.message}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowValidation(false)} style={styles.modalBtn}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showShortcuts && <ShortcutGuide onClose={() => setShowShortcuts(false)} />}
      {showVersionHistory && (
        <div style={styles.modalBackdrop} onClick={() => setShowVersionHistory(false)}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <VersionHistory />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setShowVersionHistory(false)} style={styles.modalBtn}>Close</button>
            </div>
          </div>
        </div>
      )}
      {showPublish && (
        <div style={styles.modalBackdrop} onClick={() => setShowPublish(false)}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <PublishApproval />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setShowPublish(false)} style={styles.modalBtn}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- CREATE TEMPLATE MODAL ---- */}
      {showCreateModal && (
        <CreateTemplateModal
          visible={showCreateModal}
          festivalId={festivalId}
          tenantId={tenantId}
          onClose={() => setShowCreateModal(false)}
          onCreated={(newId) => {
            setCurrentTemplateId(newId);
            setShowCreateModal(false);
          }}
        />
      )}

      {downloadRecovery && (
        <div style={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="poster-recovery-title">
          <div style={styles.modalBox}>
            <h3 id="poster-recovery-title" style={styles.modalTitle}>Download your generated poster</h3>
              <p style={{ color: 'var(--ps-muted)', fontSize: 13 }}>
              Browser storage could not save this poster. Download the image before leaving this page.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setDownloadRecovery(null)} style={styles.modalBtn}>Close</button>
              <button
                onClick={() => {
                  const objectUrl = URL.createObjectURL(downloadRecovery.blob);
                  const anchor = document.createElement('a');
                  anchor.href = objectUrl;
                  anchor.download = downloadRecovery.filename;
                  anchor.click();
                  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
                }}
                style={styles.emptyStateCta}
              >
                Download poster
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- DIAGNOSTICS OVERLAY (ADD-ON 52) ---- */}
      {isDebug && <DiagnosticsOverlay />}

      {/* ---- OFFSCREEN RENDERER FOR GENERATION ---- */}
      {isGenerating && generationContext && (
        <OffscreenRenderer
          key={generationContext.operationId}
          renderKey={generationContext.operationId}
          layers={generationContext.snapshot.layers}
          variables={generationContext.snapshot.variables}
          width={generationContext.snapshot.width}
          height={generationContext.snapshot.height}
          backgroundUrl={generationContext.backgroundUrl}
          backgroundTransform={generationContext.snapshot.backgroundTransform}
          customFontReferences={generationContext.snapshot.customFontReferences}
          onReady={handleCapture}
          onError={handleRenderError}
        />
      )}
      </div>
    </ErrorBoundary>
  );
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: coreColor('#0f0f0f', 'surfaceStrong'), fontFamily: "Outfit_400Regular" },
  offlineBanner: { backgroundColor: coreColor('#FEF3C7', 'warningSoft'), color: coreColor('#92400E', 'warning'), padding: '8px 16px', fontSize: 13, fontWeight: 600, textAlign: 'center' },
  draftBanner: { backgroundColor: coreColor('#1E3A8A', 'infoAction'), color: coreColor('#DBEAFE', 'infoSoft'), padding: '10px 16px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  draftActions: { display: 'flex', gap: 8 },
  draftBtn: { padding: '6px 14px', borderRadius: 8, border: `1px solid ${coreColor('#3B82F6', 'border')}`, backgroundColor: coreColor('#2563EB', 'infoAction'), color: coreColor('#FFFFFF', 'text'), cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  fontWarning: { backgroundColor: coreColor('#713F12', 'warningAction'), color: coreColor('#FEF9C3', 'warning'), padding: '8px 16px', fontSize: 12, borderBottom: `1px solid ${coreColor('#854D0E', 'border')}` },
  // Topbar — two-row professional toolbar
  topbar: { display: 'flex', flexDirection: 'column', backgroundColor: coreColor('#1f1f1f', 'surfaceStrong'), borderBottom: `1px solid ${coreColor('#2a2a2a', 'border')}`, flexShrink: 0, userSelect: 'none' },
  topbarRow1: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: `1px solid ${coreColor('#2a2a2a', 'border')}` },
  topbarRow2: { display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', overflowX: 'auto' },
  topbarLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  topbarRight: { display: 'flex', alignItems: 'center', gap: 6 },
  studioTitle: { fontSize: 15, fontWeight: 800, color: coreColor('#E2E8F0', 'text'), letterSpacing: '0.02em' },
  templateName: { fontSize: 12, color: coreColor('#94A3B8', 'textSubtle'), backgroundColor: coreAlpha(coreColor('#ffffff', 'overlay'), 0.08), padding: '4px 10px', borderRadius: 6, fontWeight: 500 },
  saveStatus: { fontSize: 11, color: coreColor('#94A3B8', 'textSubtle'), fontFamily: "Outfit_400Regular" },
  // Professional tool buttons
  topBtn: { padding: '6px 12px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', backgroundColor: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: coreColor('#CBD5E1', 'text'), touchAction: 'manipulation', whiteSpace: 'nowrap', transition: 'all 0.12s' },
  toolGroup: { display: 'flex', alignItems: 'center', gap: 2 },
  toolDivider: { width: 1, height: 22, backgroundColor: coreColor('#2a2a2a', 'surfaceStrong'), margin: '0 8px', flexShrink: 0 },
  toolBtn: { padding: '7px 11px', borderRadius: 4, border: '1px solid transparent', backgroundColor: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: coreColor('#94A3B8', 'textSubtle'), touchAction: 'manipulation', whiteSpace: 'nowrap', transition: 'all 0.12s' },
  zoomLabel: { fontSize: 12, color: coreColor('#CBD5E1', 'text'), width: 46, textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
  topSelect: { height: 32, borderRadius: 4, border: `1px solid ${coreColor('#2a2a2a', 'border')}`, backgroundColor: coreColor('#171717', 'surfaceStrong'), color: coreColor('#94A3B8', 'textSubtle'), fontSize: 12, fontWeight: 600, padding: '0 4px' },
  workspace: { display: 'flex', flex: 1, overflow: 'hidden' },
  leftRibbon: { width: 72, flexShrink: 0, backgroundColor: coreColor('#18191B', 'surfaceStrong'), display: 'flex', flexDirection: 'column', padding: '16px 0', zIndex: 40 },
  ribbonBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 0', gap: 4, cursor: 'pointer', background: 'transparent', border: 'none', color: coreColor('#94A3B8', 'textSubtle'), transition: 'color 0.15s' },
  ribbonBtnActive: { color: coreColor('#FFFFFF', 'text'), backgroundColor: coreAlpha(coreColor('#ffffff', 'overlay'), 0.05) },
  ribbonIcon: { fontSize: 20 },
  ribbonLabel: { fontSize: 10, fontWeight: 500 },
  leftFlyout: { width: 320, flexShrink: 0, backgroundColor: coreColor('#171717', 'surfaceStrong'), borderRight: `1px solid ${coreColor('#2a2a2a', 'border')}`, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, zIndex: 30, position: 'relative' },
  canvasArea: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 10, backgroundColor: coreColor('#e5e7eb', 'surface'), backgroundImage: 'radial-gradient(#d1d5db 1px, transparent 1px)', backgroundSize: '24px 24px' },
  contextToolbarPill: { backgroundColor: coreColor('#2B2D31', 'surfaceStrong'), borderRadius: 8, margin: '12px auto 0 auto', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 50 },
  canvasWrapper: { flex: 1, position: 'relative', overflow: 'hidden' },
  emptyStateCenter: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyStateCard: { textAlign: 'center', maxWidth: 440, padding: 40, backgroundColor: coreColor('#171717', 'surfaceStrong'), borderRadius: 6, border: `1px solid ${coreColor('#2a2a2a', 'border')}`, boxShadow: '0 4px 32px rgba(0,0,0,0.4)' },
  emptyStateTitle: { fontSize: 22, fontWeight: 800, color: coreColor('#E2E8F0', 'text'), marginBottom: 12, marginTop: 0 },
  emptyStateMsg: { fontSize: 14, color: coreColor('#94A3B8', 'textSubtle'), lineHeight: '1.6', marginBottom: 24 },
  emptyStateCta: { padding: '12px 28px', borderRadius: 6, border: 'none', backgroundColor: coreColor('#0F766E', 'primary'), color: coreColor('#FFFFFF', 'onPrimary'), fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em' },
  panelSection: { display: 'flex', flexDirection: 'column', gap: 8 },
  panelTitle: { fontSize: 11, fontWeight: 700, color: coreColor('#E2E8F0', 'text'), textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, margin: '0 0 8px' },
  emptyMsg: { fontSize: 12, color: coreColor('#94A3B8', 'textSubtle'), textAlign: 'center', padding: '20px 0' },
  layerItem: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 10px', borderRadius: 4, border: '1px solid', cursor: 'pointer', transition: 'all 0.15s' },
  layerIcon: { fontSize: 13, flexShrink: 0, width: 22, textAlign: 'center', color: coreColor('#94A3B8', 'textSubtle') },
  layerName: { flex: 1, fontSize: 12, fontWeight: 500, color: coreColor('#E2E8F0', 'text'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  layerActions: { display: 'flex', gap: 4 },
  bottomBar: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', backgroundColor: coreColor('#1f1f1f', 'surfaceStrong'), borderTop: `1px solid ${coreColor('#2a2a2a', 'border')}`, padding: '6px 16px', zIndex: 40 },
  supportingAction: { backgroundColor: 'var(--ps-surface)', color: 'var(--ps-text)', borderColor: 'var(--ps-border-strong)' },
  primaryAction: { backgroundColor: 'var(--ps-accent)', color: '#FFFFFF', borderColor: 'var(--ps-accent)' },
  dropdownMenu: { position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--ps-surface)', border: '1px solid var(--ps-border)', borderRadius: 8, padding: 6, zIndex: 100, minWidth: 140, boxShadow: 'var(--ps-shadow)' },
  dropdownMenuItem: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 36, textAlign: 'left', borderRadius: 6 },
  toolDividerHoriz: { height: 1, width: '100%', backgroundColor: 'var(--ps-border)', margin: '8px 0', flexShrink: 0 },
  responsiveBottomBar: { flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: '4px 8px calc(4px + env(safe-area-inset-bottom))', zIndex: 9002 },
  mobileToolRail: { display: 'flex', alignItems: 'stretch', gap: 4, width: '100%', minWidth: 0, overflowX: 'auto', overscrollBehaviorX: 'contain', padding: '2px 0', scrollbarWidth: 'thin' },
  mobileToolButton: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, flex: '1 0 64px', minWidth: 64, minHeight: 44, padding: '4px 6px', border: '1px solid transparent', borderRadius: 8, backgroundColor: 'transparent', color: 'var(--ps-muted)', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', touchAction: 'manipulation' },
  mobileToolButtonActive: { color: 'var(--ps-accent)', backgroundColor: 'var(--ps-accent-soft)', borderColor: 'var(--ps-border)' },
  mobileDockLayer: { position: 'fixed', inset: 0, zIndex: 8500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '12px 8px calc(92px + env(safe-area-inset-bottom))', backgroundColor: 'rgba(15, 23, 42, 0.28)', boxSizing: 'border-box' },
  tabletDockLayer: { alignItems: 'center', justifyContent: 'flex-end', padding: 16 },
  mobileDockPanel: { width: '100%', height: 'min(72dvh, 620px)', maxHeight: 'calc(100dvh - 112px - env(safe-area-inset-bottom))', minHeight: 0 },
  tabletDockPanel: { width: 'min(420px, calc(100vw - 32px))', height: 'min(72dvh, 680px)', maxHeight: 'calc(100dvh - 32px)' },
  bottomZoomGroup: { display: 'flex', alignItems: 'center', gap: 4, backgroundColor: coreColor('#171717', 'surfaceStrong'), borderRadius: 6, padding: '4px', border: `1px solid ${coreColor('#2a2a2a', 'border')}` },
  bottomToolBtn: { padding: '4px 8px', background: 'transparent', border: 'none', color: coreColor('#94A3B8', 'textSubtle'), fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 4 },
  bottomZoomLabel: { fontSize: 12, color: coreColor('#E2E8F0', 'text'), fontVariantNumeric: 'tabular-nums', width: 44, textAlign: 'center' },
  modalBackdrop: { position: 'fixed', inset: 0, backgroundColor: coreAlpha(coreColor('#000000', 'surface'), 0.8), zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalBox: { backgroundColor: coreColor('#171717', 'surfaceStrong'), borderRadius: 6, padding: 20, width: 400, maxWidth: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: `1px solid ${coreColor('#2a2a2a', 'border')}` },
  modalTitle: { fontSize: 16, fontWeight: 700, color: coreColor('#E2E8F0', 'text'), borderBottom: `1px solid ${coreColor('#2a2a2a', 'border')}`, paddingBottom: 8, margin: 0 },
  issueRow: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 4, border: '1px solid', marginBottom: 8 },
  modalBtn: { padding: '8px 16px', backgroundColor: coreColor('#1f1f1f', 'surfaceStrong'), border: `1px solid ${coreColor('#2a2a2a', 'border')}`, borderRadius: 4, fontSize: 13, fontWeight: 600, color: coreColor('#E2E8F0', 'text'), cursor: 'pointer' },
};

