import React, { useEffect, useRef } from 'react';
import { useCanvasStore } from '../Stores/canvasStore';

export default function CanvasSkeleton() {
  const { hydrationComplete } = useCanvasStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hydrationComplete && ref.current) {
      ref.current.style.opacity = '0';
      const timer = setTimeout(() => {
        if (ref.current) ref.current.style.display = 'none';
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [hydrationComplete]);

  if (hydrationComplete) return null;

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#F3F8FB',
        borderRadius: 12,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        transition: 'opacity 0.3s ease',
        zIndex: 10,
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: -600px 0; }
          100% { background-position: 600px 0; }
        }
        .ps-shimmer {
          background: linear-gradient(90deg, #E2E8F0 25%, #F1F5F9 50%, #E2E8F0 75%);
          background-size: 600px 100%;
          animation: shimmer 1.4s infinite linear;
          border-radius: 8px;
        }
      `}</style>
      {/* Header shimmer */}
      <div className="ps-shimmer" style={{ height: 60, width: '100%' }} />
      {/* Two content blocks */}
      <div style={{ display: 'flex', gap: 16, flex: 1 }}>
        <div className="ps-shimmer" style={{ flex: 1, height: '100%', minHeight: 200 }} />
        <div className="ps-shimmer" style={{ flex: 1, height: '100%' }} />
      </div>
      {/* Footer */}
      <div className="ps-shimmer" style={{ height: 44, width: '60%', alignSelf: 'center' }} />
    </div>
  );
}
