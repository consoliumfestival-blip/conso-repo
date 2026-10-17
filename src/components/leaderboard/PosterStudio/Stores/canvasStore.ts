import { create } from 'zustand';

export type ExportPreset = 'instagram' | 'whatsapp' | 'a4' | 'youtube' | 'story' | 'facebook';
export type GridSize = 8 | 16 | 32;
export type RenderMode = 'editing' | 'preview' | 'export';
export type DeviceQuality = 'high' | 'medium' | 'low';

interface CanvasStore {
  // Viewport
  zoomLevel: number;
  panX: number;
  panY: number;
  isUserZoomed: boolean;
  stageWidth: number;
  stageHeight: number;
  // Grid & Rulers
  gridVisible: boolean;
  gridSnap: boolean;
  gridSize: GridSize;
  rulerVisible: boolean;
  // Safe Zones
  safeZoneVisible: boolean;
  activeExportPreset: ExportPreset;
  // Hydration
  hydrationComplete: boolean;
  // Fonts
  failedFonts: string[];
  // Rendering
  renderMode: RenderMode;
  deviceQuality: DeviceQuality;
  // Dev
  fpsOverlayVisible: boolean;

  // Actions
  setZoom: (zoom: number, userInitiated?: boolean) => void;
  setIsUserZoomed: (v: boolean) => void;
  setPan: (x: number, y: number) => void;
  setStageSize: (w: number, h: number) => void;
  setGridVisible: (v: boolean) => void;
  setGridSnap: (v: boolean) => void;
  setGridSize: (s: GridSize) => void;
  setRulerVisible: (v: boolean) => void;
  setSafeZoneVisible: (v: boolean) => void;
  setExportPreset: (p: ExportPreset) => void;
  setHydrationComplete: (v: boolean) => void;
  addFailedFont: (family: string) => void;
  setRenderMode: (m: RenderMode) => void;
  setDeviceQuality: (q: DeviceQuality) => void;
  fitToViewport: () => void;
}

/** Detect device quality tier based on hardware concurrency + memory */
function detectDeviceQuality(): DeviceQuality {
  if (typeof navigator === 'undefined') return 'high';
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as any).deviceMemory ?? 4;
  if (cores >= 8 && mem >= 8) return 'high';
  if (cores >= 4 && mem >= 4) return 'medium';
  return 'low';
}

export const useCanvasStore = create<CanvasStore>((set) => ({
  zoomLevel: 1,
  panX: 0,
  panY: 0,
  isUserZoomed: false,
  stageWidth: 800,
  stageHeight: 800,
  gridVisible: false,
  gridSnap: false,
  gridSize: 16,
  rulerVisible: false,
  safeZoneVisible: true,
  activeExportPreset: 'instagram',
  hydrationComplete: false,
  failedFonts: [],
  renderMode: 'editing',
  deviceQuality: detectDeviceQuality(),
  fpsOverlayVisible: false,

  setZoom: (zoom, userInitiated = true) => set((s) => ({ zoomLevel: Math.min(4, Math.max(0.1, zoom)), isUserZoomed: userInitiated ? true : s.isUserZoomed })),
  setIsUserZoomed: (isUserZoomed) => set({ isUserZoomed }),
  setPan: (panX, panY) => set({ panX, panY }),
  setStageSize: (stageWidth, stageHeight) => set({ stageWidth, stageHeight }),
  setGridVisible: (gridVisible) => set({ gridVisible }),
  setGridSnap: (gridSnap) => set({ gridSnap }),
  setGridSize: (gridSize) => set({ gridSize }),
  setRulerVisible: (rulerVisible) => set({ rulerVisible }),
  setSafeZoneVisible: (safeZoneVisible) => set({ safeZoneVisible }),
  setExportPreset: (activeExportPreset) => set({ activeExportPreset }),
  setHydrationComplete: (hydrationComplete) => set({ hydrationComplete }),
  addFailedFont: (family) => set((s) => ({ failedFonts: [...new Set([...s.failedFonts, family])] })),
  setRenderMode: (renderMode) => set({ renderMode }),
  setDeviceQuality: (deviceQuality) => set({ deviceQuality }),
  fitToViewport: () => set({ isUserZoomed: false }),
}));
