import { useEffect, useState } from 'react';
import { useLayerStore } from '../Stores/layerStore';

export function useMemoryBudget() {
  const layers = useLayerStore((s) => s.layers);
  const [memoryWarn, setMemoryWarn] = useState<boolean>(false);
  const [memoryCrit, setMemoryCrit] = useState<boolean>(false);

  useEffect(() => {
    const checkMemory = () => {
      let jsHeap = 0;
      if (performance && (performance as any).memory) {
        jsHeap = (performance as any).memory.usedJSHeapSize / (1024 * 1024);
      }

      // Estimate image asset sizes (width * height * 4 bytes for RGBA)
      let estimatedImageMemory = 0;
      layers.forEach((l) => {
        if (l.type === 'image' && l.width && l.height) {
          estimatedImageMemory += (l.width * l.height * 4) / (1024 * 1024);
        }
      });

      const totalEstimated = jsHeap + estimatedImageMemory;

      if (totalEstimated > 512) {
        setMemoryCrit(true);
        setMemoryWarn(false);
      } else if (totalEstimated > 400) {
        setMemoryWarn(true);
        setMemoryCrit(false);
      } else {
        setMemoryWarn(false);
        setMemoryCrit(false);
      }
    };

    const interval = setInterval(checkMemory, 5000);
    checkMemory();
    return () => clearInterval(interval);
  }, [layers]);

  return { memoryWarn, memoryCrit };
}
