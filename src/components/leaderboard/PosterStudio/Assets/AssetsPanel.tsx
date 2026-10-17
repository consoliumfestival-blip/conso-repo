import React from 'react';
import { useLayerStore, LayerData } from '../Stores/layerStore';
import { Square, Circle, Image as ImageIcon, Type } from 'lucide-react';

export default function AssetsPanel() {
  const { addLayer, layers, setSelectedIds } = useLayerStore();

  const handleAddShape = (type: 'rect' | 'circle') => {
    const isCircle = type === 'circle';
    const timestamp = Date.now();
    const newLayer: LayerData = {
      id: `shape_${timestamp}`,
      type: 'shape',
      version: '1.0',
      name: isCircle ? 'Circle' : 'Rectangle',
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      isVisible: true,
      isLocked: false,
      lockProfile: 'editable',
      zIndex: Math.max(...layers.map((l) => l.zIndex), 0) + 1,
      opacity: 1,
      fill: '#CBD5E1',
      cornerRadius: isCircle ? 100 : 0,
    };
    addLayer(newLayer);
    setSelectedIds([newLayer.id]);
  };

  const handleAddImagePlaceholder = () => {
    const timestamp = Date.now();
    const newLayer: LayerData = {
      id: `image_${timestamp}`,
      type: 'image',
      version: '1.0',
      name: 'Image Placeholder',
      x: 100,
      y: 100,
      width: 300,
      height: 300,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      isVisible: true,
      isLocked: false,
      lockProfile: 'editable',
      zIndex: Math.max(...layers.map((l) => l.zIndex), 0) + 1,
      opacity: 1,
      src: 'https://via.placeholder.com/300x300?text=Image',
    };
    addLayer(newLayer);
    setSelectedIds([newLayer.id]);
  };

  const handleAddText = () => {
    const timestamp = Date.now();
    const newLayer: LayerData = {
      id: `text_${timestamp}`,
      type: 'text',
      version: '1.0',
      name: 'Text Layer',
      x: 100,
      y: 100,
      width: 400,
      height: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      isVisible: true,
      isLocked: false,
      lockProfile: 'editable',
      zIndex: Math.max(...layers.map((l) => l.zIndex), 0) + 1,
      opacity: 1,
      text: 'Double click to edit',
      fontFamily: 'Inter',
      fontSize: 48,
      fontWeight: 700,
      fill: '#1f2937',
      align: 'center',
    };
    addLayer(newLayer);
    setSelectedIds([newLayer.id]);
  };

  return (
    <div style={styles.root}>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Basic Elements</h3>
        <div style={styles.grid}>
          <button style={styles.assetBtn} onClick={handleAddText}>
            <Type size={24} color="#94A3B8" />
            <span style={styles.assetLabel}>Text</span>
          </button>
          <button style={styles.assetBtn} onClick={() => handleAddShape('rect')}>
            <Square size={24} color="#94A3B8" />
            <span style={styles.assetLabel}>Rectangle</span>
          </button>
          <button style={styles.assetBtn} onClick={() => handleAddShape('circle')}>
            <Circle size={24} color="#94A3B8" />
            <span style={styles.assetLabel}>Circle</span>
          </button>
          <button style={styles.assetBtn} onClick={handleAddImagePlaceholder}>
            <ImageIcon size={24} color="#94A3B8" />
            <span style={styles.assetLabel}>Image</span>
          </button>
        </div>
      </div>
      
      <div style={styles.infoBox}>
        <p style={styles.infoText}>
          Additional assets and elements can be added here once an asset library or upload system is connected.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#E2E8F0',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
  },
  assetBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '24px 12px',
    backgroundColor: '#1f1f1f',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  assetLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: 500,
  },
  infoBox: {
    padding: '16px',
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
    border: '1px solid rgba(56, 189, 248, 0.1)',
    borderRadius: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#38bdf8',
    lineHeight: 1.5,
    textAlign: 'center',
  }
};
