import { create } from 'zustand';
import { LayerData } from './layerStore';

interface HistorySnapshot {
  layers: LayerData[];
  timestamp: number;
}

interface HistoryStore {
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  maxHistory: number;

  push: (layers: LayerData[]) => void;
  undo: (currentLayers: LayerData[]) => LayerData[] | null;
  redo: (currentLayers: LayerData[]) => LayerData[] | null;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  past: [],
  future: [],
  maxHistory: 50,

  push: (layers) =>
    set((s) => {
      const snapshot: HistorySnapshot = { layers: JSON.parse(JSON.stringify(layers)), timestamp: Date.now() };
      const newPast = [...s.past, snapshot].slice(-s.maxHistory);
      return { past: newPast, future: [] };
    }),

  undo: (currentLayers) => {
    const { past, future } = get();
    if (past.length === 0) return null;
    const previous = past[past.length - 1];
    const currentSnapshot: HistorySnapshot = { layers: JSON.parse(JSON.stringify(currentLayers)), timestamp: Date.now() };
    set({ past: past.slice(0, -1), future: [currentSnapshot, ...future] });
    return previous.layers;
  },

  redo: (currentLayers) => {
    const { past, future } = get();
    if (future.length === 0) return null;
    const next = future[0];
    const currentSnapshot: HistorySnapshot = { layers: JSON.parse(JSON.stringify(currentLayers)), timestamp: Date.now() };
    set({ past: [...past, currentSnapshot], future: future.slice(1) });
    return next.layers;
  },

  clear: () => set({ past: [], future: [] }),
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));
