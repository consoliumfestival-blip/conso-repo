import { create } from 'zustand';

export interface MutationRecord {
  id: string;
  type: 'update_template' | 'save_draft' | 'publish' | 'upload_r2';
  payload: any;
  timestamp: number;
  retryCount: number;
}

interface OfflineStore {
  isOnline: boolean;
  mutationQueue: MutationRecord[];
  
  setIsOnline: (status: boolean) => void;
  enqueue: (mutation: Omit<MutationRecord, 'id' | 'timestamp' | 'retryCount'>) => void;
  dequeue: () => MutationRecord | undefined;
  removeMutation: (id: string) => void;
  incrementRetry: (id: string) => void;
  clearQueue: () => void;
}

export const useOfflineStore = create<OfflineStore>((set, get) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  mutationQueue: [],

  setIsOnline: (isOnline) => set({ isOnline }),

  enqueue: (mutation) => {
    const fullMutation: MutationRecord = {
      ...mutation,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      retryCount: 0,
    };
    set((s) => ({ mutationQueue: [...s.mutationQueue, fullMutation] }));
  },

  dequeue: () => {
    const { mutationQueue } = get();
    if (mutationQueue.length === 0) return undefined;
    const first = mutationQueue[0];
    return first;
  },

  removeMutation: (id) => set((s) => ({
    mutationQueue: s.mutationQueue.filter(m => m.id !== id)
  })),

  incrementRetry: (id) => set((s) => ({
    mutationQueue: s.mutationQueue.map(m => 
      m.id === id ? { ...m, retryCount: m.retryCount + 1 } : m
    )
  })),

  clearQueue: () => set({ mutationQueue: [] }),
}));
