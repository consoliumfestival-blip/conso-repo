import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import StudioCanvas from './Canvas/StudioCanvas';
import TransformBlock from './Properties/TransformBlock';
import TypographyBlock from './Properties/TypographyBlock';
import EffectsBlock from './Properties/EffectsBlock';
import MobileBottomSheet from './Properties/MobileBottomSheet';
import TextToolbar from './Toolbar/TextToolbar';
import { useCanvasStore } from './Stores/canvasStore';
import { useLayerStore } from './Stores/layerStore';
import CanvasSizeBlock from './Properties/CanvasSizeBlock';
import BackgroundBlock from './Properties/BackgroundBlock';
import { useTemplateStore } from './Stores/templateStore';
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

import ErrorBoundary from './ErrorBoundary';
import DiagnosticsOverlay from './DiagnosticsOverlay';
import { validateTemplateHealth, ValidationIssue } from './Utils/validation';
import { useGetPosterTemplates } from '../../../core/hooks/useLeaderboardSettings';
import { RESULT_NUMBER_PRESETS, NEXT_RESULT_MODE } from './Utils/resultNumberPresets';
import CreateTemplateModal from './Templates/CreateTemplateModal';
import { supabase } from '../../../core/config/supabase';
import OffscreenRenderer from './Canvas/OffscreenRenderer';
import { uploadService } from '../../../services/storage/uploadService';
import { useRouter } from 'expo-router';
import { fontService, FontMetadata } from '../../../services/fontService';
import { loadFont } from './Utils/fontLoader';
import { storageService } from '../../../services/storage/storageService';

import { useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, Palette, Maximize2, Eye, Save, Zap, Send, 
  MoreHorizontal, Grid, Magnet, Square, Ruler, RotateCcw, 
  LayoutTemplate, Type, Image, Trophy, Undo, Redo, Sparkles, ChevronDown, Layers
} from 'lucide-react';

interface PosterStudioProps {
  festivalId: string;
  tenantId: string;
}

export default function PosterStudio({ festivalId, tenantId }: PosterStudioProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1180;
  const isDesktop = width >= 1180;

  const { zoomLevel, setZoom, fitToViewport, gridVisible, setGridVisible, gridSnap, setGridSnap, gridSize, setGridSize, rulerVisible, setRulerVisible, safeZoneVisible, setSafeZoneVisible, failedFonts } = useCanvasStore();
  const { layers, selectedIds } = useLayerStore();
  const { activeTemplate, hasUnsavedChanges, saveDraft, draftRecoveryAvailable, restoreDraft, clearDraft, lastSavedAt, variables, currentResultId, saveResultOverride, typographyMode, toggleTypographyMode, resultNumberMode, cycleResultNumberMode } = useTemplateStore();
  const safeVariables = variables || {};
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
  const [activeDockPanel, setActiveDockPanel] = useState<DockPanelType>('layers');
  const [isDockOpen, setIsDockOpen] = useState(false);
  const { contextMenu, openMenu: openContextMenu, closeMenu: closeContextMenu } = useContextMenu();
  const bgInputRef = useRef<HTMLInputElement>(null);
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
  }, [dbTemplates, currentTemplateId]);

  // Initial Draft Loading — only fires when a real templateId is set
  useEffect(() => {
    if (currentTemplateId) {
      useTemplateStore.getState().loadDraftOnStart(currentTemplateId);
    }
  }, [currentTemplateId]);

  // Load custom tenant fonts at startup
  useEffect(() => {
    if (!tenantId) return;
    const loadCustomFonts = async () => {
      try {
        console.log('[PosterStudio] Loading custom tenant fonts...');
        const fonts = await fontService.getFonts(tenantId);
        await Promise.all(
          fonts.map(async (f) => {
            const meta = f.metadata as FontMetadata;
            if (!meta) return;

            let url = f.file_url;
            if (url && url.startsWith('r2://')) {
              const objectKey = url.replace('r2://', '');
              try {
                const ext = objectKey.split('.').pop()?.toLowerCase() || 'ttf';
                const contentType = ext === 'woff2' ? 'font/woff2' : ext === 'woff' ? 'font/woff' : ext === 'otf' ? 'font/otf' : 'font/ttf';
                url = await storageService.getPresignedUrl(objectKey, contentType, 'download');
              } catch (e) {
                console.error('Failed to resolve font signed URL at startup', e);
              }
            }

            if (url) {
              console.log(`[PosterStudio] Registering custom font: ${meta.family}`);
              await loadFont({
                family: meta.family,
                url: url,
                category: 'Custom Fonts'
              });
            }
          })
        );
      } catch (e) {
        console.error('Failed to preload custom fonts:', e);
      }
    };
    loadCustomFonts();
  }, [tenantId]);

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
  useKeyboardShortcuts();
  useMemoryBudget();

  useEffect(() => {
    const onShowShortcuts = () => setShowShortcuts(true);
    window.addEventListener('poster-studio:show-shortcuts', onShowShortcuts);
    return () => window.removeEventListener('poster-studio:show-shortcuts', onShowShortcuts);
  }, []);

  // Dirty State Marking
  useEffect(() => {
    // Only mark unsaved if the app has fully loaded
    if (layers.length > 0) {
      useTemplateStore.getState().markUnsaved();
    }
  }, [layers, safeVariables]);

  // Debounced Autosave
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const timer = setTimeout(() => {
      saveDraft();
    }, 1500);
    return () => clearTimeout(timer);
  }, [hasUnsavedChanges, saveDraft]);

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

  // Background image upload handler (Uploading properly to R2 instead of heavy Base64 local state)
  const handleBgUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Compress the image before uploading to avoid huge storage costs
      const { compressImage } = await import('./Utils/imageCompressor');
      const compressedFile = await compressImage(file, 2048, 2048, 0.85);
      
      const metadata = await uploadService.uploadTemplate(
        compressedFile,
        festivalId,
        tenantId,
        'background',
        'jpg',
        () => {} // progress
      );
      
      useTemplateStore.getState().updateTemplateMeta({ background_url: `r2://${metadata.object_key}` });
    } catch (err) {
      console.error('Top bar BG upload failed:', err);
      alert('Failed to upload background image');
    }
  }, [festivalId, tenantId]);

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
      fontFamily: 'Poppins',
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
      x: cx - 440, y: cy - 120, width: 880, height: 120,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      fontSize: 96, fontFamily: 'Poppins', fontWeight: 900,
      fill: '#000000', align: 'center', lineHeight: 1.1, letterSpacing: 2,
      zIndex: maxZ, isVisible: true, isLocked: false, lockProfile: 'editable',
      dynamicBinding: 'event_name_primary',
    });
    addLayer({
      id: secondaryId, type: 'text', version: '1.0',
      name: 'Event Name Secondary',
      text: '{event_name_secondary}',
      x: cx - 440, y: cy + 20, width: 880, height: 80,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      fontSize: 52, fontFamily: 'Poppins', fontWeight: 400,
      fill: '#333333', align: 'center', lineHeight: 1.2, letterSpacing: 0,
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

  const handleCapture = useCallback(async (captureFunc: () => string) => {
    if (!activeTemplate) return;
    try {
      const dataUrl = captureFunc();

      // Convert dataURL → Blob
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      const blob = new Blob([u8arr], { type: mime });

      // --- FALLBACK ACTIONS (Auto-Download + WhatsApp Share) ---
      try {
        // 1. Auto-Download
        const a = document.createElement('a');
        a.href = dataUrl;
        const timestamp = Date.now();
        a.download = `poster_${timestamp}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // 2. WhatsApp Share (Clipboard + Open Tab)
        if (typeof window !== 'undefined' && navigator.clipboard && (window as any).ClipboardItem) {
          const clipboardItem = new (window as any).ClipboardItem({
            'image/png': blob.type === 'image/png' ? blob : blob.slice(0, blob.size, 'image/png')
          });
          await navigator.clipboard.write([clipboardItem]);
          
          // Open WhatsApp
          const waUrl = `https://wa.me/?text=${encodeURIComponent('Please paste (Ctrl+V) the poster image from your clipboard.')}`;
          window.open(waUrl, '_blank');
        }
      } catch (fallbackErr) {
        console.error('Fallback actions failed:', fallbackErr);
      }
      // ---------------------------------------------------------

      // Upload to R2
      const uploaded = await uploadService.uploadGeneratedAsset(blob, festivalId, tenantId);

      // Unique hash for this render (groups resolutions in Media Center)
      const renderHash = `${activeTemplate.id}_${currentResultId || 'base'}_${Date.now()}`;
      const eventName = safeVariables['event_name'] || 'Festival Event';

      // Save to generated_assets — both hd and standard point to same URL for now
      const { error: dbError } = await supabase.from('generated_assets').insert([
        {
          tenant_id: tenantId,
          festival_id: festivalId,
          template_id: activeTemplate.id,
          result_id: currentResultId || null,
          public_url: uploaded.file_url,
          storage_path: uploaded.object_key,
          resolution: 'hd',
          asset_type: 'poster',
          render_hash: renderHash,
        },
        {
          tenant_id: tenantId,
          festival_id: festivalId,
          template_id: activeTemplate.id,
          result_id: currentResultId || null,
          public_url: uploaded.file_url,
          storage_path: uploaded.object_key,
          resolution: 'standard',
          asset_type: 'poster',
          render_hash: renderHash,
        },
      ]);

      if (dbError) throw new Error(dbError.message);

      queryClient.invalidateQueries({ queryKey: ['generated-assets', festivalId] });
      useTemplateStore.getState().updateStableLayout();
      alert('✅ Poster published to Media Center!');
    } catch (e: any) {
      console.error(e);
      alert('Failed to generate poster: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsGenerating(false);
    }
  }, [activeTemplate, festivalId, tenantId, currentResultId, safeVariables]);

  return (
    <ErrorBoundary>
      <div style={styles.root}>
        {/* ---- OFFLINE BANNER ---- */}
      {!isOnline && (
        <div style={styles.offlineBanner}>
          📡 Offline — changes will sync when connection restores
        </div>
      )}

      {/* ---- DRAFT RECOVERY BANNER ---- */}
      {draftRecoveryAvailable && (
        <div style={styles.draftBanner}>
          <span>🗂 Unsaved draft found from a previous session.</span>
          <div style={styles.draftActions}>
            <button onClick={() => restoreDraft()} style={styles.draftBtn}>Restore Draft</button>
            <button onClick={() => clearDraft()} style={{ ...styles.draftBtn, backgroundColor: 'transparent', color: '#64748B' }}>Discard</button>
          </div>
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
                color: '#94A3B8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 600,
                padding: '6px 8px',
                borderRadius: '4px'
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2a2a2a')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <ArrowLeft size={14} /> Back
            </button>
            <span style={{ width: 1, height: 16, backgroundColor: '#2a2a2a', margin: '0 4px' }} />
            <span style={{ ...styles.studioTitle, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Palette size={16} color="#38BDF8" /> Poster Studio
            </span>
            {/* Template selector has been moved to the Templates Panel in the Right Control Dock */}
            {/* Change Background Button replacing the old status pill */}
            <input type="file" ref={bgInputRef} style={{ display: 'none' }} onChange={handleBgUpload} accept="image/*" />
            <button
              onClick={() => bgInputRef.current?.click()}
              style={{
                marginLeft: '16px',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                backgroundColor: currentResultId ? '#8B5CF6' : '#3B82F6',
                color: 'white',
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
              <Image size={14} /> Change {currentResultId ? 'Result' : 'Template'} BG
            </button>
            {currentResultId && (
               <button
                 onClick={async () => {
                   useTemplateStore.getState().setCurrentResultId(null);
                   const activeTemplate = useTemplateStore.getState().activeTemplate;
                   if (activeTemplate) {
                     useLayerStore.getState().setLayers(activeTemplate.layers);
                   }
                 }}
                 style={{
                   marginLeft: '8px',
                   padding: '6px 12px',
                   backgroundColor: '#475569',
                   color: 'white',
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
                 onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                 onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#475569')}
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
                    backgroundColor: showResizePopover ? '#334155' : 'transparent',
                    color: '#E2E8F0',
                    border: '1px solid #475569',
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
                    background: '#F8FAFC',
                    borderRadius: 8,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    zIndex: 1000,
                    border: '1px solid #CBD5E1',
                    width: 320
                  }}>
                    <CanvasSizeBlock />
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ ...styles.topbarRight, flexWrap: 'wrap' }}>
            {/* Viewport Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  const el = document.getElementById('view-dropdown');
                  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
                }}
                style={{ ...styles.topBtn, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Eye size={14} /> View <ChevronDown size={12} />
              </button>
              <div id="view-dropdown" style={{ display: 'none', position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#171717', border: '1px solid #2a2a2a', borderRadius: 6, padding: 8, zIndex: 100, minWidth: 140 }}>
                <button onClick={() => setGridVisible(!gridVisible)} style={{ ...styles.toolBtn, display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', color: gridVisible ? '#5EEAD4' : '#94A3B8' }}><Grid size={14} /> Grid</button>
                <button onClick={() => setGridSnap(!gridSnap)} style={{ ...styles.toolBtn, display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', color: gridSnap ? '#5EEAD4' : '#94A3B8' }}><Magnet size={14} /> Snap</button>
                <button onClick={() => setSafeZoneVisible(!safeZoneVisible)} style={{ ...styles.toolBtn, display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', color: safeZoneVisible ? '#5EEAD4' : '#94A3B8' }}><Square size={14} /> Safe Zones</button>
                <button onClick={() => setRulerVisible(!rulerVisible)} style={{ ...styles.toolBtn, display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', color: rulerVisible ? '#5EEAD4' : '#94A3B8' }}><Ruler size={14} /> Ruler</button>
              </div>
            </div>

            {!currentResultId && (
              <button
                onClick={async () => {
                  setIsSaving(true);
                  await saveDraft();
                  
                  const currentLayers = useLayerStore.getState().layers;
                  const currentBg = activeTemplate?.background_url || '';
                  
                  if (activeTemplate?.isPublishable && activeTemplate.id && activeTemplate.id !== 'starter-template') {
                    await supabase
                      .from('poster_templates')
                      .update({
                        layers: currentLayers,
                        background_url: currentBg,
                        width: activeTemplate.width,
                        height: activeTemplate.height,
                        aspect_ratio: activeTemplate.aspect_ratio,
                      })
                      .eq('id', activeTemplate.id);
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
                style={{ ...styles.topBtn, display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#3B82F6', color: '#FFFFFF', borderColor: '#3B82F6' }}
              >
                <Save size={14} /> {isSaving ? 'Saving...' : 'Save'}
              </button>
            )}
            {currentResultId && (
              <button
                onClick={async () => {
                  setIsSaving(true);
                  await saveResultOverride();
                  setIsSaving(false);
                }}
                disabled={isSaving}
                style={{ ...styles.topBtn, display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#8B5CF6', color: '#FFFFFF', borderColor: '#8B5CF6' }}
              >
                <Save size={14} /> {isSaving ? 'Saving...' : 'Save Edit'}
              </button>
            )}
            {currentResultId && (
              <button 
                onClick={() => setIsGenerating(true)} 
                disabled={isGenerating}
                style={{ ...styles.topBtn, display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#0F766E', color: '#FFFFFF', borderColor: '#0F766E' }}
              >
                <Zap size={14} /> {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            )}
            {!currentResultId && (
              <button 
                onClick={() => setShowPublish(true)} 
                style={{ ...styles.topBtn, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', backgroundColor: '#0F766E', color: '#FFFFFF', borderColor: '#0F766E' }}
              >
                <Send size={14} /> Publish
              </button>
            )}
            
            {/* More Menu for less used actions */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  const el = document.getElementById('more-dropdown');
                  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
                }}
                style={{ ...styles.topBtn, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                More <ChevronDown size={12} />
              </button>
              <div id="more-dropdown" style={{ display: 'none', position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#171717', border: '1px solid #2a2a2a', borderRadius: 6, padding: 8, zIndex: 100, minWidth: 180 }}>
                {/* ── Typography Mode Toggle ── */}
                <button
                  onClick={toggleTypographyMode}
                  title={`Typography Mode: ${typographyMode === 'A' ? 'BIG first / small second' : 'small first / BIG second'}. Click to swap.`}
                  style={{ ...styles.toolBtn, display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', color: typographyMode === 'A' ? '#818CF8' : '#A78BFA' }}
                >
                  <Type size={14} /> {typographyMode === 'A' ? 'Font: BIG/small' : 'Font: small/BIG'}
                </button>
                {/* ── Result Number Switcher ── */}
                <button
                  onClick={handleResultModeSwitch}
                  title={`Result Number Mode: ${resultNumberMode}. Click to cycle presets.`}
                  style={{ ...styles.toolBtn, display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', color: '#F472B6' }}
                >
                  <Maximize2 size={14} /> Size: {resultNumberMode}
                </button>
                {/* ── Insert Event Name Layers ── */}
                <button
                  onClick={insertEventNameLayers}
                  title="Insert pre-styled Event Name Primary + Secondary layers"
                  style={{ ...styles.toolBtn, display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', color: '#38BDF8' }}
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
                  style={{ ...styles.toolBtn, display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', color: '#F87171' }}
                >
                  <RotateCcw size={14} /> Reset Canvas
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                const result = historyUndo(layers);
                if (result) useLayerStore.getState().setLayers(result);
              }}
              style={{ ...styles.topBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', opacity: canUndo ? 1 : 0.4 }}
              title="Undo (Ctrl+Z)"
            >
              <Undo size={14} />
            </button>
            <button
              onClick={() => {
                const result = historyRedo(layers);
                if (result) useLayerStore.getState().setLayers(result);
              }}
              style={{ ...styles.topBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', opacity: canRedo ? 1 : 0.4 }}
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
          {activeTemplate && (
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
                  <p style={{ color: '#475569', fontSize: 11, marginTop: 12 }}>
                    Debug mode: Use the dropdown above to load a local demo template.
                  </p>
                )}
              </div>
            </div>
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

      {/* ---- PUBLISHED RESULTS PANEL (Phase 6 placeholder) ---- */}
      {/* <PublishedResultsPanel festivalId={festivalId} tenantId={tenantId} /> */}

      {/* ---- BOTTOM BAR (Viewport Controls) ---- */}
      <div style={styles.bottomBar}>
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
              <p style={{ color: '#0F766E', fontSize: 13, margin: '16px 0' }}>✓ Template is perfectly healthy.</p>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto', margin: '16px 0' }}>
                {validationIssues.map((iss, i) => (
                  <div key={i} style={{ ...styles.issueRow, backgroundColor: iss.type === 'error' ? '#FEF2F2' : '#FFFBEB', borderColor: iss.type === 'error' ? '#FECACA' : '#FDE68A' }}>
                    <span style={{ fontSize: 16 }}>{iss.type === 'error' ? '❌' : '⚠️'}</span>
                    <span style={{ fontSize: 12, color: '#0F172A' }}>{iss.message}</span>
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

      {/* ---- DIAGNOSTICS OVERLAY (ADD-ON 52) ---- */}
      {isDebug && <DiagnosticsOverlay />}

      {/* ---- OFFSCREEN RENDERER FOR GENERATION ---- */}
      {isGenerating && activeTemplate && (
        <OffscreenRenderer
          layers={layers}
          variables={safeVariables}
          width={activeTemplate.width}
          height={activeTemplate.height}
          backgroundUrl={activeTemplate.background_url}
          backgroundTransform={activeTemplate.background_transform}
          onReady={handleCapture}
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
  root: { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0f0f0f', fontFamily: 'Inter, sans-serif' },
  offlineBanner: { backgroundColor: '#FEF3C7', color: '#92400E', padding: '8px 16px', fontSize: 13, fontWeight: 600, textAlign: 'center' },
  draftBanner: { backgroundColor: '#1E3A8A', color: '#DBEAFE', padding: '10px 16px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  draftActions: { display: 'flex', gap: 8 },
  draftBtn: { padding: '6px 14px', borderRadius: 8, border: '1px solid #3B82F6', backgroundColor: '#2563EB', color: '#FFFFFF', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  fontWarning: { backgroundColor: '#713F12', color: '#FEF9C3', padding: '8px 16px', fontSize: 12, borderBottom: '1px solid #854D0E' },
  // Topbar — two-row professional toolbar
  topbar: { display: 'flex', flexDirection: 'column', backgroundColor: '#1f1f1f', borderBottom: '1px solid #2a2a2a', flexShrink: 0, userSelect: 'none' },
  topbarRow1: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #2a2a2a' },
  topbarRow2: { display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', overflowX: 'auto' },
  topbarLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  topbarRight: { display: 'flex', alignItems: 'center', gap: 6 },
  studioTitle: { fontSize: 15, fontWeight: 800, color: '#E2E8F0', letterSpacing: '0.02em' },
  templateName: { fontSize: 12, color: '#94A3B8', backgroundColor: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: 6, fontWeight: 500 },
  saveStatus: { fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' },
  // Professional tool buttons
  topBtn: { padding: '6px 12px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', backgroundColor: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#CBD5E1', touchAction: 'manipulation', whiteSpace: 'nowrap', transition: 'all 0.12s' },
  toolGroup: { display: 'flex', alignItems: 'center', gap: 2 },
  toolDivider: { width: 1, height: 22, backgroundColor: '#2a2a2a', margin: '0 8px', flexShrink: 0 },
  toolBtn: { padding: '7px 11px', borderRadius: 4, border: '1px solid transparent', backgroundColor: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#94A3B8', touchAction: 'manipulation', whiteSpace: 'nowrap', transition: 'all 0.12s' },
  zoomLabel: { fontSize: 12, color: '#CBD5E1', width: 46, textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
  topSelect: { height: 32, borderRadius: 4, border: '1px solid #2a2a2a', backgroundColor: '#171717', color: '#94A3B8', fontSize: 12, fontWeight: 600, padding: '0 4px' },
  workspace: { display: 'flex', flex: 1, overflow: 'hidden' },
  leftRibbon: { width: 72, flexShrink: 0, backgroundColor: '#18191B', display: 'flex', flexDirection: 'column', padding: '16px 0', zIndex: 40 },
  ribbonBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 0', gap: 4, cursor: 'pointer', background: 'transparent', border: 'none', color: '#94A3B8', transition: 'color 0.15s' },
  ribbonBtnActive: { color: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.05)' },
  ribbonIcon: { fontSize: 20 },
  ribbonLabel: { fontSize: 10, fontWeight: 500 },
  leftFlyout: { width: 320, flexShrink: 0, backgroundColor: '#171717', borderRight: '1px solid #2a2a2a', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, zIndex: 30, position: 'relative' },
  canvasArea: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 10, backgroundColor: '#e5e7eb', backgroundImage: 'radial-gradient(#d1d5db 1px, transparent 1px)', backgroundSize: '24px 24px' },
  contextToolbarPill: { backgroundColor: '#2B2D31', borderRadius: 8, margin: '12px auto 0 auto', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 50 },
  canvasWrapper: { flex: 1, position: 'relative', overflow: 'hidden' },
  emptyStateCenter: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyStateCard: { textAlign: 'center', maxWidth: 440, padding: 40, backgroundColor: '#171717', borderRadius: 6, border: '1px solid #2a2a2a', boxShadow: '0 4px 32px rgba(0,0,0,0.4)' },
  emptyStateTitle: { fontSize: 22, fontWeight: 800, color: '#E2E8F0', marginBottom: 12, marginTop: 0 },
  emptyStateMsg: { fontSize: 14, color: '#94A3B8', lineHeight: '1.6', marginBottom: 24 },
  emptyStateCta: { padding: '12px 28px', borderRadius: 6, border: 'none', backgroundColor: '#0F766E', color: '#FFFFFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em' },
  panelSection: { display: 'flex', flexDirection: 'column', gap: 8 },
  panelTitle: { fontSize: 11, fontWeight: 700, color: '#E2E8F0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, margin: '0 0 8px' },
  emptyMsg: { fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '20px 0' },
  layerItem: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 10px', borderRadius: 4, border: '1px solid', cursor: 'pointer', transition: 'all 0.15s' },
  layerIcon: { fontSize: 13, flexShrink: 0, width: 22, textAlign: 'center', color: '#94A3B8' },
  layerName: { flex: 1, fontSize: 12, fontWeight: 500, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  layerActions: { display: 'flex', gap: 4 },
  bottomBar: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', backgroundColor: '#1f1f1f', borderTop: '1px solid #2a2a2a', padding: '6px 16px', zIndex: 40 },
  bottomZoomGroup: { display: 'flex', alignItems: 'center', gap: 4, backgroundColor: '#171717', borderRadius: 6, padding: '4px', border: '1px solid #2a2a2a' },
  bottomToolBtn: { padding: '4px 8px', background: 'transparent', border: 'none', color: '#94A3B8', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 4 },
  bottomZoomLabel: { fontSize: 12, color: '#E2E8F0', fontVariantNumeric: 'tabular-nums', width: 44, textAlign: 'center' },
  modalBackdrop: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalBox: { backgroundColor: '#171717', borderRadius: 6, padding: 20, width: 400, maxWidth: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '1px solid #2a2a2a' },
  modalTitle: { fontSize: 16, fontWeight: 700, color: '#E2E8F0', borderBottom: '1px solid #2a2a2a', paddingBottom: 8, margin: 0 },
  issueRow: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 4, border: '1px solid', marginBottom: 8 },
  modalBtn: { padding: '8px 16px', backgroundColor: '#1f1f1f', border: '1px solid #2a2a2a', borderRadius: 4, fontSize: 13, fontWeight: 600, color: '#E2E8F0', cursor: 'pointer' },
};

