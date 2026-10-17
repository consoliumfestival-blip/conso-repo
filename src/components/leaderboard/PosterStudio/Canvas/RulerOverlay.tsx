import React, { useEffect, useRef } from 'react';
import { useCanvasStore } from '../Stores/canvasStore';

export default function RulerOverlay() {
  const { rulerVisible, zoomLevel, panX, panY, stageWidth, stageHeight } = useCanvasStore();
  const topRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!rulerVisible) return;
    
    const drawRuler = (canvas: HTMLCanvasElement, isHorizontal: boolean) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, width, height);
      
      ctx.beginPath();
      ctx.strokeStyle = '#94A3B8';
      ctx.fillStyle = '#475569';
      ctx.font = '10px sans-serif';
      ctx.textAlign = isHorizontal ? 'center' : 'right';
      ctx.textBaseline = isHorizontal ? 'bottom' : 'middle';

      const length = isHorizontal ? width : height;
      const pan = isHorizontal ? panX : panY;
      
      const step = 50 * zoomLevel;
      const offset = pan % step;
      
      for (let i = offset; i < length; i += step) {
        const value = Math.round((i - pan) / zoomLevel);
        if (value < 0) continue;
        
        if (isHorizontal) {
          ctx.moveTo(i, 16);
          ctx.lineTo(i, 24);
          ctx.fillText(value.toString(), i, 14);
        } else {
          ctx.moveTo(16, i);
          ctx.lineTo(24, i);
          ctx.fillText(value.toString(), 14, i);
        }
      }
      ctx.stroke();
    };

    if (topRef.current) drawRuler(topRef.current, true);
    if (leftRef.current) drawRuler(leftRef.current, false);
  }, [rulerVisible, zoomLevel, panX, panY, stageWidth, stageHeight]);

  if (!rulerVisible) return null;

  return (
    <>
      <canvas
        ref={topRef}
        width={stageWidth}
        height={24}
        style={{
          position: 'absolute',
          top: 0,
          left: 24,
          zIndex: 50,
          borderBottom: '1px solid #CBD5E1',
          pointerEvents: 'none',
        }}
      />
      <canvas
        ref={leftRef}
        width={24}
        height={stageHeight}
        style={{
          position: 'absolute',
          top: 24,
          left: 0,
          zIndex: 50,
          borderRight: '1px solid #CBD5E1',
          pointerEvents: 'none',
        }}
      />
      <div style={{
        position: 'absolute',
        top: 0, left: 0, width: 24, height: 24,
        backgroundColor: '#F1F5F9', zIndex: 51,
        borderRight: '1px solid #CBD5E1', borderBottom: '1px solid #CBD5E1'
      }} />
    </>
  );
}
