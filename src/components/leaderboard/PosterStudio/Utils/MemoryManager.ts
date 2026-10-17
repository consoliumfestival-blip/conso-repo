export const MemoryManager = {
  /**
   * Clears temporary object URLs created during export or asset loading
   */
  revokeUrls: (urls: string[]) => {
    if (typeof URL === 'undefined') return;
    urls.forEach((url) => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
  },

  /**
   * Force garbage collection on temporary offscreen canvas instances
   */
  destroyOffscreenCanvas: (canvas: HTMLCanvasElement | OffscreenCanvas | null) => {
    if (!canvas) return;
    
    // Set dimensions to 0 to free graphics memory immediately
    canvas.width = 0;
    canvas.height = 0;

    const ctx = (canvas as HTMLCanvasElement).getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 0, 0);
    }
  },

  /**
   * Prepares export cleanup for workers
   */
  cleanupWorker: (worker: Worker | null) => {
    if (worker) {
      worker.terminate();
    }
  },
};
