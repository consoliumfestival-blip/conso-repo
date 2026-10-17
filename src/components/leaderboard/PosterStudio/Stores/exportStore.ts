import { create } from 'zustand';
import { LayerData } from './layerStore';

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export interface ExportJob {
  id: string;
  templateId: string;
  variableSnapshot: Record<string, string>;
  format: ExportFormat;
  pixelRatio: number;
  status: 'queued' | 'rendering' | 'done' | 'failed';
  progress: number;
  resultUrl?: string;
  errorMessage?: string;
  createdAt: string;
  // Metadata tracking
  templateVersion: number;
  exportPreset: string;
  renderDuration?: number;
  fontPack?: string;
  exportResolution?: string;
  renderingMode?: string;
}

interface ExportStore {
  queue: ExportJob[];
  isExporting: boolean;
  workerReady: boolean;

  enqueueJob: (job: Omit<ExportJob, 'id' | 'status' | 'progress' | 'createdAt'>) => string;
  updateJob: (id: string, patch: Partial<ExportJob>) => void;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
  setWorkerReady: (v: boolean) => void;
  setIsExporting: (v: boolean) => void;
}

export const useExportStore = create<ExportStore>((set) => ({
  queue: [],
  isExporting: false,
  workerReady: false,

  enqueueJob: (job) => {
    const id = `export_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const newJob: ExportJob = { ...job, id, status: 'queued', progress: 0, createdAt: new Date().toISOString() };
    set((s) => ({ queue: [...s.queue, newJob] }));
    return id;
  },
  updateJob: (id, patch) =>
    set((s) => ({ queue: s.queue.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),
  removeJob: (id) => set((s) => ({ queue: s.queue.filter((j) => j.id !== id) })),
  clearCompleted: () => set((s) => ({ queue: s.queue.filter((j) => j.status !== 'done') })),
  setWorkerReady: (workerReady) => set({ workerReady }),
  setIsExporting: (isExporting) => set({ isExporting }),
}));
