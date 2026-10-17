import React, { useEffect, useRef } from 'react';
import { useCanvasStore, ExportPreset } from '../Stores/canvasStore';

import { useTemplateStore } from '../Stores/templateStore';

const SAFE_ZONES: Record<string, { safe: { top: number; right: number; bottom: number; left: number }; bleed: number }> = {
  '1:1':     { safe: { top: 40, right: 40, bottom: 40, left: 40 }, bleed: 0 },
  '4:5':     { safe: { top: 80, right: 60, bottom: 80, left: 60 }, bleed: 0 },
  '9:16':    { safe: { top: 120, right: 60, bottom: 120, left: 60 }, bleed: 0 },
  '16:9':    { safe: { top: 60, right: 120, bottom: 60, left: 120 }, bleed: 0 },
  'A4':      { safe: { top: 100, right: 100, bottom: 100, left: 100 }, bleed: 15 },
  // Fallbacks
  instagram: { safe: { top: 40, right: 40, bottom: 40, left: 40 }, bleed: 0 },
  story:     { safe: { top: 80, right: 40, bottom: 80, left: 40 }, bleed: 0 },
  whatsapp:  { safe: { top: 20, right: 20, bottom: 20, left: 20 }, bleed: 0 },
  a4:        { safe: { top: 57, right: 57, bottom: 57, left: 57 }, bleed: 9 },
  youtube:   { safe: { top: 80, right: 160, bottom: 80, left: 160 }, bleed: 0 },
  facebook:  { safe: { top: 30, right: 30, bottom: 30, left: 30 }, bleed: 0 },
};

interface SafeZoneOverlayProps {
  canvasWidth: number;
  canvasHeight: number;
  zoomLevel: number;
  offsetX?: number;
  offsetY?: number;
}

export default function SafeZoneOverlay({ canvasWidth, canvasHeight, zoomLevel, offsetX = 0, offsetY = 0 }: SafeZoneOverlayProps) {
  const { safeZoneVisible, activeExportPreset } = useCanvasStore();
  const { activeTemplate } = useTemplateStore();
  
  if (!safeZoneVisible) return null;

  const currentRatio = activeTemplate?.aspect_ratio || '1:1';
  const preset = SAFE_ZONES[currentRatio] || SAFE_ZONES[activeExportPreset] || SAFE_ZONES['1:1'];
  const { safe, bleed } = preset;

  const scaledCanvasW = canvasWidth * zoomLevel;
  const scaledCanvasH = canvasHeight * zoomLevel;

  const safeRect = {
    left: offsetX + safe.left * zoomLevel,
    top: offsetY + safe.top * zoomLevel,
    width: scaledCanvasW - (safe.left + safe.right) * zoomLevel,
    height: scaledCanvasH - (safe.top + safe.bottom) * zoomLevel,
  };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 100 }}>
      {/* Safe zone — green dashed */}
      <div
        style={{
          position: 'absolute',
          left: safeRect.left,
          top: safeRect.top,
          width: safeRect.width,
          height: safeRect.height,
          border: '1.5px dashed rgba(34, 197, 94, 0.7)',
          boxSizing: 'border-box',
        }}
      />
      {/* Bleed zone — red dashed (slightly outside canvas edge) */}
      {bleed > 0 && (
        <div
          style={{
            position: 'absolute',
            left: offsetX - bleed * zoomLevel,
            top: offsetY - bleed * zoomLevel,
            width: scaledCanvasW + bleed * 2 * zoomLevel,
            height: scaledCanvasH + bleed * 2 * zoomLevel,
            border: '1.5px dashed rgba(239, 68, 68, 0.6)',
            boxSizing: 'border-box',
          }}
        />
      )}
      {/* Label */}
      <div style={{
        position: 'absolute',
        top: safeRect.top + 4,
        left: safeRect.left + 4,
        fontSize: 9,
        fontFamily: 'Inter, monospace',
        fontWeight: 700,
        color: 'rgba(34, 197, 94, 0.8)',
        letterSpacing: '0.5px',
        userSelect: 'none',
      }}>
        SAFE ZONE
      </div>
    </div>
  );
}

export { SAFE_ZONES };
