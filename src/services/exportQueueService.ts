import { create } from 'zustand';
import { supabase } from '@/core/config/supabase';
import { storageService } from '@/services/storage/storageService';

export type ExportResolution = 'thumb' | 'share' | 'standard' | 'hd' | 'print';
export type ExportStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface ExportJobPayload {
  tenantId: string;
  festivalId: string;
  eventId?: string;
  resultId?: string;
  templateId: string;
  renderHash: string;
  variables: Record<string, string>;
  layers: any[]; // The template layers state
  backgroundUrl?: string;
  backgroundTransform?: any;
}

export interface ExportJob {
  id: string;
  tenant_id: string;
  festival_id: string;
  payload: ExportJobPayload;
  status: ExportStatus;
  progress: number;
  retry_count: number;
  error_message?: string;
  created_by?: string;
  created_at: string;
}

interface ExportQueueStore {
  jobs: ExportJob[];
  currentJob: ExportJob | null;
  isProcessing: boolean;
  
  // Actions
  fetchQueue: (festivalId: string) => Promise<void>;
  enqueueJob: (payload: ExportJobPayload) => Promise<void>;
  startProcessingNextJob: () => void;
  markJobCompleted: (jobId: string, assets: any[]) => Promise<void>;
  markJobFailed: (jobId: string, error: string) => Promise<void>;
}

export const useExportQueueStore = create<ExportQueueStore>((set, get) => ({
  jobs: [],
  currentJob: null,
  isProcessing: false,

  fetchQueue: async (festivalId: string) => {
    try {
      // 1. Recover stale processing jobs (older than 5 minutes)
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await supabase
        .from('export_jobs')
        .update({ status: 'queued', updated_at: new Date().toISOString() })
        .eq('status', 'processing')
        .lt('updated_at', fiveMinsAgo);

      // 2. Fetch active queue
      const { data, error } = await supabase
        .from('export_jobs')
        .select('*')
        .eq('festival_id', festivalId)
        .in('status', ['queued', 'processing'])
        .order('created_at', { ascending: true });

      if (error) throw error;
      set({ jobs: data as ExportJob[] });
      
      // Auto-start if not processing
      if (!get().isProcessing && data.length > 0) {
        get().startProcessingNextJob();
      }
    } catch (err) {
      console.error('Failed to fetch export queue:', err);
    }
  },

  enqueueJob: async (payload: ExportJobPayload) => {
    try {
      // 1. Insert into export_jobs table
      const { data, error } = await supabase
        .from('export_jobs')
        .insert({
          tenant_id: payload.tenantId,
          festival_id: payload.festivalId,
          payload,
          status: 'queued',
        })
        .select()
        .single();

      if (error) throw error;

      // 2. Add to local state
      set((state) => ({ jobs: [...state.jobs, data as ExportJob] }));

      // 3. Trigger processing if idle
      if (!get().isProcessing) {
        get().startProcessingNextJob();
      }
    } catch (err) {
      console.error('Failed to enqueue job:', err);
    }
  },

  startProcessingNextJob: async () => {
    const { jobs, isProcessing } = get();
    if (isProcessing || jobs.length === 0) return;

    // Get the next job
    const nextJob = jobs.find((j) => j.status === 'queued') || jobs[0];
    if (!nextJob) return;

    set({ isProcessing: true, currentJob: nextJob });

    // Mark as processing in DB
    await supabase
      .from('export_jobs')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', nextJob.id);
      
    // The actual rendering will be picked up by the <BackgroundExportEngine /> React component
    // which listens to `currentJob`.
  },

  markJobCompleted: async (jobId: string, generatedAssets: any[]) => {
    try {
      // Insert into generated_assets table
      const { error: insertError } = await supabase
        .from('generated_assets')
        .insert(generatedAssets);

      if (insertError) throw insertError;

      // Mark job as completed
      await supabase
        .from('export_jobs')
        .update({ status: 'completed', progress: 100, updated_at: new Date().toISOString() })
        .eq('id', jobId);

      set((state) => ({
        currentJob: null,
        isProcessing: false,
        jobs: state.jobs.filter((j) => j.id !== jobId),
      }));

      // Trigger next
      get().startProcessingNextJob();
    } catch (err) {
      console.error('Failed to complete job:', err);
      await get().markJobFailed(jobId, String(err));
    }
  },

  markJobFailed: async (jobId: string, errorMsg: string) => {
    try {
      // Ideally check retry_count and decide if we requeue or fail permanently
      const job = get().jobs.find((j) => j.id === jobId);
      const retries = (job?.retry_count || 0) + 1;
      
      const newStatus = retries >= 3 ? 'failed' : 'queued';

      await supabase
        .from('export_jobs')
        .update({ 
          status: newStatus, 
          error_message: errorMsg,
          retry_count: retries,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      set((state) => ({
        currentJob: null,
        isProcessing: false,
        jobs: newStatus === 'failed' 
          ? state.jobs.filter((j) => j.id !== jobId) 
          : state.jobs.map((j) => j.id === jobId ? { ...j, status: 'queued', retry_count: retries } : j)
      }));

      // Next
      get().startProcessingNextJob();
    } catch (err) {
      console.error('Failed to mark job as failed:', err);
      set({ isProcessing: false, currentJob: null });
    }
  }
}));
