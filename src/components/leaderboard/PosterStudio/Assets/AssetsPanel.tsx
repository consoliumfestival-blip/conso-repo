import React, { useRef, useState } from 'react';
import { useLayerStore, LayerData } from '../Stores/layerStore';
import { Square, Circle, Image as ImageIcon, Type } from 'lucide-react';
import { uploadService } from '../../../../services/storage/uploadService';

interface AssetsPanelProps {
  festivalId: string;
  tenantId: string;
}

export default function AssetsPanel({ festivalId, tenantId }: AssetsPanelProps) {
  const { addLayer, layers, setSelectedIds } = useLayerStore();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');

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
      shapeKind: isCircle ? 'circle' : 'rect',
    };
    addLayer(newLayer);
    setSelectedIds([newLayer.id]);
  };

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const extensionByType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const extension = extensionByType[file.type.toLowerCase()];
    if (!extension) {
      setImageUploadError('Choose a JPG, PNG, or WEBP image.');
      return;
    }

    setImageUploadError('');
    setIsUploadingImage(true);
    try {
      const bitmap = await createImageBitmap(file);
      const previewScale = Math.min(1, 300 / Math.max(bitmap.width, bitmap.height));
      const imageWidth = Math.max(1, Math.round(bitmap.width * previewScale));
      const imageHeight = Math.max(1, Math.round(bitmap.height * previewScale));
      bitmap.close();
      const metadata = await uploadService.uploadTemplate(file, festivalId, tenantId, 'graphics', extension);
      const timestamp = Date.now();
      const newLayer: LayerData = {
        id: `image_${timestamp}`,
        type: 'image',
        version: '1.0',
        name: file.name.replace(/\.[^.]+$/, '') || 'Image',
        x: 100,
        y: 100,
        width: imageWidth,
        height: imageHeight,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        isVisible: true,
        isLocked: false,
        lockProfile: 'editable',
        zIndex: Math.max(...layers.map((layer) => layer.zIndex), 0) + 1,
        opacity: 1,
        src: `r2://${metadata.object_key}`,
      };
      addLayer(newLayer);
      setSelectedIds([newLayer.id]);
    } catch (error) {
      setImageUploadError(error instanceof Error ? error.message : 'Image upload failed.');
    } finally {
      setIsUploadingImage(false);
    }
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
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleImageFileChange}
        style={{ display: 'none' }}
        aria-label="Choose an image to upload"
      />
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Basic Elements</h3>
        <div style={styles.grid}>
          <button style={styles.assetBtn} onClick={handleAddText}>
            <Type size={24} color="var(--ps-muted)" />
            <span style={styles.assetLabel}>Text</span>
          </button>
          <button style={styles.assetBtn} onClick={() => handleAddShape('rect')}>
            <Square size={24} color="var(--ps-muted)" />
            <span style={styles.assetLabel}>Rectangle</span>
          </button>
          <button style={styles.assetBtn} onClick={() => handleAddShape('circle')}>
            <Circle size={24} color="var(--ps-muted)" />
            <span style={styles.assetLabel}>Circle</span>
          </button>
          <button style={styles.assetBtn} onClick={() => imageInputRef.current?.click()} disabled={isUploadingImage} aria-busy={isUploadingImage}>
            <ImageIcon size={24} color="var(--ps-muted)" />
            <span style={styles.assetLabel}>{isUploadingImage ? 'Uploading…' : 'Upload image'}</span>
          </button>
        </div>
      </div>
      {imageUploadError && <p role="alert" style={styles.infoText}>{imageUploadError}</p>}
      
      <div style={styles.infoBox}>
        <p style={styles.infoText}>Uploaded images are saved to this festival and keep a stable storage reference in the design.</p>
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
    color: 'var(--ps-text)',
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
    backgroundColor: 'var(--ps-surface-muted)',
    border: '1px solid var(--ps-border)',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  assetLabel: {
    fontSize: 12,
    color: 'var(--ps-muted)',
    fontWeight: 500,
  },
  infoBox: {
    padding: '16px',
    backgroundColor: 'var(--ps-accent-soft)',
    border: '1px solid var(--ps-border)',
    borderRadius: 8,
  },
  infoText: {
    fontSize: 12,
    color: 'var(--ps-accent)',
    lineHeight: 1.5,
    textAlign: 'center',
  }
};
