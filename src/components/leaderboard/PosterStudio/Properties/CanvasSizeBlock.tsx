import React from 'react';
import { useTemplateStore } from '../Stores/templateStore';
import { useLayerStore } from '../Stores/layerStore';
import { useHistoryStore } from '../Stores/historyStore';
import { Monitor, Smartphone, Square, FileText, Image as ImageIcon } from 'lucide-react-native';

const SIZES = [
  { id: '1:1', label: '1:1 Square', width: 1080, height: 1080, icon: Square },
  { id: '4:5', label: '4:5 Portrait', width: 1080, height: 1350, icon: Smartphone },
  { id: '9:16', label: '9:16 Story', width: 1080, height: 1920, icon: Smartphone },
  { id: '16:9', label: '16:9 Landscape', width: 1920, height: 1080, icon: Monitor },
  { id: 'A4', label: 'A4 Print', width: 2480, height: 3508, icon: FileText },
];

export default function CanvasSizeBlock() {
  const { activeTemplate, updateTemplateMeta } = useTemplateStore();
  const { layers, setLayers } = useLayerStore();
  const pushHistory = useHistoryStore(state => state.push);

  const currentRatio = activeTemplate?.aspect_ratio || '1:1';
  const currentWidth = activeTemplate?.width || 1080;
  const currentHeight = activeTemplate?.height || 1080;

  const handleResize = (newSize: typeof SIZES[0]) => {
    if (currentWidth === newSize.width && currentHeight === newSize.height) return;

    pushHistory(layers);

    const scaleX = newSize.width / currentWidth;
    const scaleY = newSize.height / currentHeight;
    const minScale = Math.min(scaleX, scaleY);
    const maxScale = Math.max(scaleX, scaleY);

    // Smart Scale Layers
    const newLayers = layers.map(layer => {
      const newLayer = { ...layer };
      
      // Proportional positioning
      newLayer.x = Math.round(layer.x * scaleX);
      newLayer.y = Math.round(layer.y * scaleY);
      
      if (layer.type === 'text') {
        newLayer.width = Math.round(layer.width * scaleX);
        if (layer.height) newLayer.height = Math.round(layer.height * scaleY);
        newLayer.fontSize = Math.round((layer.fontSize || 24) * minScale);
        if (layer.letterSpacing) newLayer.letterSpacing = layer.letterSpacing * minScale;
      } else {
        newLayer.width = Math.round(layer.width * scaleX);
        newLayer.height = Math.round(layer.height * scaleY);
      }
      return newLayer;
    });

    setLayers(newLayers);

    // Background Image smart scaling (Fill mode by default)
    let newBgTransform = activeTemplate?.background_transform || { scale: 1, x: 0, y: 0 };
    newBgTransform = {
      ...newBgTransform,
      scale: newBgTransform.scale * maxScale,
      x: newBgTransform.x * scaleX,
      y: newBgTransform.y * scaleY
    };

    updateTemplateMeta({
      width: newSize.width,
      height: newSize.height,
      aspect_ratio: newSize.id,
      background_transform: newBgTransform
    });
  };

  return (
    <div style={{ padding: '16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <ImageIcon size={18} color="#64748B" />
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', margin: 0 }}>CANVAS SIZE</h3>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {SIZES.map(size => {
          const isActive = currentRatio === size.id;
          const Icon = size.icon;
          return (
            <button
              key={size.id}
              onClick={() => handleResize(size)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '12px 8px',
                background: isActive ? '#EFF6FF' : '#FFFFFF',
                border: isActive ? '1.5px solid #3B82F6' : '1px solid #CBD5E1',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                color: isActive ? '#2563EB' : '#475569'
              }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
              <div style={{ fontSize: '12px', fontWeight: isActive ? 600 : 500 }}>{size.label}</div>
              <div style={{ fontSize: '10px', color: isActive ? '#3B82F6' : '#94A3B8' }}>
                {size.width} × {size.height}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
