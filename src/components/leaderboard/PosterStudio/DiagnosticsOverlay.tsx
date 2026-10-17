import React, { useEffect, useState } from 'react';
import { useLayerStore } from './Stores/layerStore';
import { useCanvasStore } from './Stores/canvasStore';
import { useExportStore } from './Stores/exportStore';

export default function DiagnosticsOverlay() {
  const [fps, setFps] = useState(0);
  const [memory, setMemory] = useState<number | null>(null);
  
  const layers = useLayerStore((s) => s.layers);
  const canvasStore = useCanvasStore();
  const exportQueue = useExportStore((s) => s.queue);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationFrameId: number;

    const loop = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastTime)));
        frameCount = 0;
        lastTime = now;
        
        if (performance && (performance as any).memory) {
          setMemory(Math.round((performance as any).memory.usedJSHeapSize / 1048576));
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.header}>Debug Diagnostics</div>
      <div style={styles.statRow}><span>FPS:</span> <span style={{ color: fps < 30 ? '#EF4444' : '#22C55E' }}>{fps}</span></div>
      {memory !== null && <div style={styles.statRow}><span>Memory:</span> <span>{memory} MB</span></div>}
      <div style={styles.statRow}><span>Layers:</span> <span>{layers.length} ({layers.filter(l => l.type === 'text').length} text)</span></div>
      <div style={styles.statRow}><span>Device Tier:</span> <span>{canvasStore.deviceQuality}</span></div>
      <div style={styles.statRow}><span>Render Mode:</span> <span>{canvasStore.renderMode}</span></div>
      <div style={styles.statRow}><span>Export Queue:</span> <span>{exportQueue.length} jobs</span></div>
      <div style={styles.statRow}><span>Zoom:</span> <span>{(canvasStore.zoomLevel * 100).toFixed(0)}%</span></div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    color: '#38BDF8',
    padding: 12,
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: 11,
    zIndex: 9999,
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    pointerEvents: 'none',
    width: 200,
  },
  header: {
    fontWeight: 700,
    color: '#FFFFFF',
    borderBottom: '1px solid rgba(255,255,255,0.2)',
    paddingBottom: 4,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '2px 0',
  },
};
