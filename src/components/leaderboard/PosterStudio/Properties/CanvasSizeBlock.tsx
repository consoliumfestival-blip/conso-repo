import { coreColor } from '@/constants/coreTheme';
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
    <div style={{ padding: '16px', background: coreColor('#F8FAFC', 'surfaceStrong'), borderBottom: `1px solid ${coreColor('#E2E8F0', 'border')}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <ImageIcon size={18} color={coreColor("#64748B", 'textMuted')} />
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: coreColor('#1E293B', 'text'), margin: 0 }}>CANVAS SIZE</h3>
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
                background: isActive ? coreColor('#EFF6FF', 'surfaceStrong') : coreColor('#FFFFFF', 'surfaceStrong'),
                border: isActive ? `1.5px solid ${coreColor('#3B82F6', 'border')}` : `1px solid ${coreColor('#CBD5E1', 'border')}`,
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                color: isActive ? coreColor('#2563EB', 'info') : coreColor('#475569', 'text')
              }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
              <div style={{ fontSize: '12px', fontWeight: isActive ? 600 : 500 }}>{size.label}</div>
              <div style={{ fontSize: '10px', color: isActive ? coreColor('#3B82F6', 'info') : coreColor('#94A3B8', 'textSubtle') }}>
                {size.width} × {size.height}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
