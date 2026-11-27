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
  shapeKind: z.enum(['rect', 'circle']).optional(),
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
  transformGroup: (id: string, transform: { x: number; y: number; width: number; height: number }) => void;
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
    set((s) => {
      const deleted = s.layers.find((layer) => layer.id === id);
      const withoutDeleted = s.layers.filter((layer) => layer.id !== id);
      if (!deleted || deleted.type === 'group') {
        return {
          layers: withoutDeleted,
          selectedIds: s.selectedIds.filter((selectedId) => selectedId !== id),
        };
      }

      const updatedLayers = withoutDeleted.map((layer) => {
        if (layer.type !== 'group' || !layer.children?.includes(id)) return layer;
        return { ...layer, children: layer.children.filter((childId) => childId !== id) };
      });
      const emptyGroupIds = new Set(updatedLayers
        .filter((layer) => layer.type === 'group' && (layer.children || []).length === 0)
        .map((layer) => layer.id));

      return {
        layers: updatedLayers.filter((layer) => !emptyGroupIds.has(layer.id)),
        selectedIds: s.selectedIds.filter((selectedId) => selectedId !== id && !emptyGroupIds.has(selectedId)),
      };
    }),
  duplicateLayer: (id) => {
    const { layers } = get();
    const original = layers.find((l) => l.id === id);
    if (!original) return;
    if (original.type === 'group') {
      const originalChildren = (original.children || [])
        .map((childId) => layers.find((layer) => layer.id === childId))
        .filter((layer): layer is LayerData => Boolean(layer));
      if (originalChildren.length !== (original.children || []).length || originalChildren.length === 0) return;
      const newIds = new Map(originalChildren.map((child) => [child.id, `layer_${Date.now()}_${Math.random().toString(36).slice(2)}`]));
      const nextZIndex = Math.max(...layers.map((layer) => layer.zIndex)) + 1;
      const clonedChildren = originalChildren.map((child, index) => ({
        ...child,
        id: newIds.get(child.id)!,
        x: child.x + 16,
        y: child.y + 16,
        zIndex: nextZIndex + index,
        name: `${child.name} (copy)`,
      }));
      const clone: LayerData = {
        ...original,
        id: `group_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        x: original.x + 16,
        y: original.y + 16,
        name: `${original.name} (copy)`,
        zIndex: nextZIndex,
        children: (original.children || []).map((childId) => newIds.get(childId)!),
      };
      set((state) => ({ layers: [...state.layers, ...clonedChildren, clone], selectedIds: [clone.id] }));
      return;
    }
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
      layers: s.layers.map((l) => {
        if (l.id !== id) return l;
        const nextLocked = !(l.isLocked || l.lockProfile === 'fully-locked');
        return {
          ...l,
          isLocked: nextLocked,
          lockProfile: nextLocked ? 'fully-locked' : 'editable',
        };
      }),
    })),
  toggleVisibility: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, isVisible: !l.isVisible } : l)),
    })),
  groupSelected: () => {
    const { layers, selectedIds } = get();
    const alreadyGrouped = new Set(layers.flatMap((layer) => layer.type === 'group' ? layer.children || [] : []));
    const selected = selectedIds.filter((id) => {
      const l = layers.find((ll) => ll.id === id);
      return l && l.type !== 'group' && !alreadyGrouped.has(l.id)
        && !l.isLocked && l.lockProfile === 'editable';
    });
    if (selected.length < 2) return;
    const selectedLayers = selected.map((id) => layers.find((layer) => layer.id === id)!).filter(Boolean);
    const groupCount = layers.filter((l) => l.type === 'group').length;
    const x = Math.min(...selectedLayers.map((layer) => layer.x));
    const y = Math.min(...selectedLayers.map((layer) => layer.y));
    const right = Math.max(...selectedLayers.map((layer) => layer.x + layer.width));
    const bottom = Math.max(...selectedLayers.map((layer) => layer.y + layer.height));
    const groupLayer: LayerData = {
      id: `group_${Date.now()}`,
      type: 'group',
      version: '1.0',
      name: `Group ${groupCount + 1}`,
      x, y, width: right - x, height: bottom - y, rotation: 0, scaleX: 1, scaleY: 1,
      isVisible: true, isLocked: false, lockProfile: 'editable',
      zIndex: Math.min(...selectedLayers.map((layer) => layer.zIndex)),
      opacity: 1,
      children: selected,
    };
    set((s) => ({
      // Keep the original child objects in the layer list. The group stores IDs only;
      // renderers draw each child once and ungroup can restore the exact transforms.
      layers: [...s.layers, groupLayer],
      selectedIds: [groupLayer.id],
    }));
  },
  ungroupLayer: (id) => {
    const { layers } = get();
    const group = layers.find((l) => l.id === id && l.type === 'group');
    if (!group) return;
    const existingChildIds = (group.children || []).filter((childId) =>
      layers.some((layer) => layer.id === childId && layer.type !== 'group'),
    );
    set((s) => ({
      layers: s.layers.filter((l) => l.id !== id),
      selectedIds: existingChildIds,
    }));
  },
  transformGroup: (id, transform) =>
    set((s) => {
      const group = s.layers.find((layer) => layer.id === id && layer.type === 'group');
      if (!group || group.isLocked || group.lockProfile !== 'editable') return {};
      const childIds = new Set(group.children || []);
      const children = s.layers.filter((layer) => childIds.has(layer.id) && layer.type !== 'group');
      if (children.length === 0) return {};
      const oldX = Math.min(...children.map((layer) => layer.x));
      const oldY = Math.min(...children.map((layer) => layer.y));
      const oldRight = Math.max(...children.map((layer) => layer.x + layer.width));
      const oldBottom = Math.max(...children.map((layer) => layer.y + layer.height));
      const scaleX = transform.width / Math.max(1, oldRight - oldX);
      const scaleY = transform.height / Math.max(1, oldBottom - oldY);
      return {
        layers: s.layers.map((layer) => {
          if (!childIds.has(layer.id) || layer.type === 'group') return layer;
          const next = {
            ...layer,
            x: transform.x + (layer.x - oldX) * scaleX,
            y: transform.y + (layer.y - oldY) * scaleY,
            width: Math.max(1, layer.width * scaleX),
            height: Math.max(1, layer.height * scaleY),
          };
          if (layer.type === 'text' && layer.fontSize) {
            next.fontSize = Math.max(1, layer.fontSize * Math.min(scaleX, scaleY));
          }
          return next;
        }).map((layer) => layer.id === id ? {
          ...layer,
          x: transform.x,
          y: transform.y,
          width: Math.max(1, transform.width),
          height: Math.max(1, transform.height),
        } : layer),
      };
    }),
  reorderLayers: (fromIndex, toIndex) =>
    set((s) => {
      const sorted = [...s.layers].sort((a, b) => a.zIndex - b.zIndex);
      const moved = sorted.splice(fromIndex, 1)[0];
      sorted.splice(toIndex, 0, moved);
      return { layers: sorted.map((l, i) => ({ ...l, zIndex: i })) };
    }),
}));
