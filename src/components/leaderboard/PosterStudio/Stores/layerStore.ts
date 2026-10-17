import { create } from 'zustand';
import { z } from 'zod';

export type LockProfile = 'editable' | 'semi-locked' | 'fully-locked';
export type LayerType = 'text' | 'image' | 'shape' | 'group';
export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type OverflowMode = 'clip' | 'ellipsis' | 'auto-shrink';

export const LayerSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'image', 'shape', 'group']),
  version: z.string().default('1.0'),
  name: z.string(),
  // Transform
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().default(0),
  scaleX: z.number().default(1),
  scaleY: z.number().default(1),
  // State
  isVisible: z.boolean().default(true),
  isLocked: z.boolean().default(false),
  lockProfile: z.enum(['editable', 'semi-locked', 'fully-locked']).default('editable'),
  zIndex: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  // Text-specific
  text: z.string().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
  fontWeight: z.number().optional(),
  fontStyle: z.string().optional(),
  textDecoration: z.string().optional(),
  fill: z.string().optional(),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  lineHeight: z.number().optional(),
  letterSpacing: z.number().optional(),
  backgroundFill: z.string().optional(),
  backgroundOpacity: z.number().optional(),
  overflowMode: z.enum(['clip', 'ellipsis', 'auto-shrink', 'auto-wrap']).optional(),
  maxLines: z.number().optional(),
  // Effects
  shadowColor: z.string().optional(),
  shadowBlur: z.number().optional(),
  shadowOffsetX: z.number().optional(),
  shadowOffsetY: z.number().optional(),
  // Manual override for auto-fill
  manualOverride: z.boolean().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  cornerRadius: z.number().optional(),
  // Image-specific
  src: z.string().optional(),
  // Variable binding
  variableKey: z.string().optional(),
  dynamicBinding: z.string().optional(),
  resolvedText: z.string().optional(),
  // Future-proof
  animations: z.record(z.string(), z.any()).optional(),
  meta: z.record(z.string(), z.any()).optional(),
  // Group children
  children: z.array(z.string()).optional(),
});

export type LayerData = z.infer<typeof LayerSchema>;

interface LayerStore {
  layers: LayerData[];
  selectedIds: string[];

  // Actions
  setLayers: (layers: LayerData[]) => void;
  addLayer: (layer: LayerData) => void;
  updateLayer: (id: string, patch: Partial<LayerData>) => void;
  updateLayerLinked: (id: string, patch: Partial<LayerData>) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  toggleLock: (id: string) => void;
  toggleVisibility: (id: string) => void;
  groupSelected: () => void;
  ungroupLayer: (id: string) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
}

export const useLayerStore = create<LayerStore>((set, get) => ({
  layers: [],
  selectedIds: [],

  setLayers: (layers) => set({ layers }),
  addLayer: (layer) => set((s) => ({ layers: [...s.layers, layer] })),
  updateLayer: (id, patch) =>
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
  updateLayerLinked: (id, patch) =>
    set((s) => {
      const sourceLayer = s.layers.find((l) => l.id === id);
      if (!sourceLayer) return { layers: s.layers };

      let groupType: 'name' | 'unit' | 'rank' | null = null;
      if (sourceLayer.dynamicBinding?.startsWith('name_')) groupType = 'name';
      else if (sourceLayer.dynamicBinding?.startsWith('unit_')) groupType = 'unit';
      else if (sourceLayer.id.endsWith('r') && ['1', '2', '3'].includes(sourceLayer.text || '')) groupType = 'rank';
      else if (sourceLayer.name.includes('Rank')) groupType = 'rank';

      if (!groupType) {
        return { layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
      }

      return {
        layers: s.layers.map((l) => {
          let matchesGroup = false;
          if (groupType === 'name' && l.dynamicBinding?.startsWith('name_')) matchesGroup = true;
          else if (groupType === 'unit' && l.dynamicBinding?.startsWith('unit_')) matchesGroup = true;
          else if (groupType === 'rank' && (l.id.endsWith('r') || l.name.includes('Rank'))) matchesGroup = true;

          return matchesGroup ? { ...l, ...patch } : l;
        }),
      };
    }),
  removeLayer: (id) =>
    set((s) => ({
      layers: s.layers.filter((l) => l.id !== id),
      selectedIds: s.selectedIds.filter((sid) => sid !== id),
    })),
  duplicateLayer: (id) => {
    const { layers } = get();
    const original = layers.find((l) => l.id === id);
    if (!original) return;
    const clone: LayerData = {
      ...original,
      id: `layer_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      x: original.x + 16,
      y: original.y + 16,
      name: `${original.name} (copy)`,
      zIndex: Math.max(...layers.map((l) => l.zIndex)) + 1,
    };
    set((s) => ({ layers: [...s.layers, clone], selectedIds: [clone.id] }));
  },
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  toggleSelect: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((sid) => sid !== id)
        : [...s.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [] }),
  bringForward: (id) =>
    set((s) => {
      const sorted = [...s.layers].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((l) => l.id === id);
      if (idx < sorted.length - 1) {
        const next = sorted[idx + 1];
        return {
          layers: s.layers.map((l) => {
            if (l.id === id) return { ...l, zIndex: next.zIndex };
            if (l.id === next.id) return { ...l, zIndex: sorted[idx].zIndex };
            return l;
          }),
        };
      }
      return {};
    }),
  sendBackward: (id) =>
    set((s) => {
      const sorted = [...s.layers].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((l) => l.id === id);
      if (idx > 0) {
        const prev = sorted[idx - 1];
        return {
          layers: s.layers.map((l) => {
            if (l.id === id) return { ...l, zIndex: prev.zIndex };
            if (l.id === prev.id) return { ...l, zIndex: sorted[idx].zIndex };
            return l;
          }),
        };
      }
      return {};
    }),
  toggleLock: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, isLocked: !l.isLocked } : l)),
    })),
  toggleVisibility: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, isVisible: !l.isVisible } : l)),
    })),
  groupSelected: () => {
    const { layers, selectedIds } = get();
    const editable = selectedIds.filter((id) => {
      const l = layers.find((ll) => ll.id === id);
      return l && l.lockProfile !== 'fully-locked';
    });
    if (editable.length < 2) return;
    const groupCount = layers.filter((l) => l.type === 'group').length;
    const groupLayer: LayerData = {
      id: `group_${Date.now()}`,
      type: 'group',
      version: '1.0',
      name: `Group ${groupCount + 1}`,
      x: 0, y: 0, width: 0, height: 0, rotation: 0, scaleX: 1, scaleY: 1,
      isVisible: true, isLocked: false, lockProfile: 'editable',
      zIndex: Math.max(...layers.map((l) => l.zIndex)) + 1,
      opacity: 1,
      children: editable,
    };
    set((s) => ({
      layers: [...s.layers.filter((l) => !editable.includes(l.id)), groupLayer],
      selectedIds: [groupLayer.id],
    }));
  },
  ungroupLayer: (id) => {
    const { layers } = get();
    const group = layers.find((l) => l.id === id && l.type === 'group');
    if (!group || !group.children) return;
    set((s) => ({
      layers: s.layers.filter((l) => l.id !== id),
      selectedIds: group.children || [],
    }));
  },
  reorderLayers: (fromIndex, toIndex) =>
    set((s) => {
      const sorted = [...s.layers].sort((a, b) => a.zIndex - b.zIndex);
      const moved = sorted.splice(fromIndex, 1)[0];
      sorted.splice(toIndex, 0, moved);
      return { layers: sorted.map((l, i) => ({ ...l, zIndex: i })) };
    }),
}));
