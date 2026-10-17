import { create } from 'zustand';
import { LayerData } from './layerStore';

interface ClipboardStore {
  copiedLayers: LayerData[] | null;
  isCut: boolean;
  copy: (layers: LayerData[]) => void;
  cut: (layers: LayerData[]) => void;
  clear: () => void;
}

export const useClipboardStore = create<ClipboardStore>((set) => ({
  copiedLayers: null,
  isCut: false,
  copy: (copiedLayers) => set({ copiedLayers: JSON.parse(JSON.stringify(copiedLayers)), isCut: false }),
  cut: (copiedLayers) => set({ copiedLayers: JSON.parse(JSON.stringify(copiedLayers)), isCut: true }),
  clear: () => set({ copiedLayers: null, isCut: false }),
}));

// ---- Offline Store ----
export interface MutationRecord {
  id: string;
  type: 'save_draft' | 'save_version' | 'publish' | 'upload';
  payload: any;
  createdAt: string;
  attempts: number;
}

interface OfflineStore {
  isOnline: boolean;
  mutationQueue: MutationRecord[];
  setIsOnline: (v: boolean) => void;
  enqueue: (mutation: Omit<MutationRecord, 'id' | 'createdAt' | 'attempts'>) => void;
  dequeue: () => MutationRecord | undefined;
  incrementAttempts: (id: string) => void;
  clearQueue: () => void;
}

export const useOfflineStore = create<OfflineStore>((set, get) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  mutationQueue: [],

  setIsOnline: (isOnline) => set({ isOnline }),
  enqueue: (mutation) =>
    set((s) => ({
      mutationQueue: [
        ...s.mutationQueue,
        { ...mutation, id: `mut_${Date.now()}`, createdAt: new Date().toISOString(), attempts: 0 },
      ],
    })),
  dequeue: () => {
    const { mutationQueue } = get();
    const [first, ...rest] = mutationQueue;
    set({ mutationQueue: rest });
    return first;
  },
  incrementAttempts: (id) =>
    set((s) => ({
      mutationQueue: s.mutationQueue.map((m) =>
        m.id === id ? { ...m, attempts: m.attempts + 1 } : m
      ),
    })),
  clearQueue: () => set({ mutationQueue: [] }),
}));
