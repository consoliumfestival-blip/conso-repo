import React, { useCallback, useState } from 'react';
import NumericField from './fields/NumericField';
import SliderField from './fields/SliderField';
import { ToggleField } from './fields/SliderField';
import Accordion from './Accordion';
import { useTemplateStore, BackgroundTransform } from '../Stores/templateStore';
import useImage from 'use-image';
import { useResolvedImageUrl } from '../../../../core/hooks/useResolvedImageUrl';
import { uploadService } from '../../../../services/storage/uploadService';
import { UploadCloud } from 'lucide-react';

interface BackgroundBlockProps {
  festivalId: string;
  tenantId: string;
}

export default function BackgroundBlock({ festivalId, tenantId }: BackgroundBlockProps) {
  const { activeTemplate, updateTemplateMeta } = useTemplateStore();
  const [isUploading, setIsUploading] = useState(false);
  
  const bgTransform = activeTemplate?.background_transform || { scale: 1, x: 0, y: 0, isDraggable: false };
  const resolvedBgUrl = useResolvedImageUrl(activeTemplate?.background_url);
  const [image] = useImage(resolvedBgUrl || '', 'anonymous');

  const commit = useCallback(
    (patch: Partial<BackgroundTransform>) => {
      updateTemplateMeta({ 
        background_transform: { ...bgTransform, ...patch }
      });
    },
    [updateTemplateMeta, bgTransform]
  );

  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = async (e: any) => {
      const file: File = e.target.files[0];
      if (!file) return;
      try {
        setIsUploading(true);
        // Dynamically import to avoid top-level issues if needed, or import at top
        const { compressImage } = await import('../Utils/imageCompressor');
        const compressedFile = await compressImage(file, 2048, 2048, 0.85);
        
        const metadata = await uploadService.uploadTemplate(
          compressedFile,
          festivalId,
          tenantId,
          'background',
          'jpg',
          () => {} // progress
        );
        updateTemplateMeta({ background_url: `r2://${metadata.object_key}` });
      } catch (err) {
        console.error("Upload failed", err);
      } finally {
        setIsUploading(false);
      }
    };
    input.click();
  };

  const handleFit = () => {
    if (!image || !activeTemplate) return;
    const scale = Math.min(activeTemplate.width / image.width, activeTemplate.height / image.height);
    const x = (activeTemplate.width - image.width * scale) / 2;
    const y = (activeTemplate.height - image.height * scale) / 2;
    commit({ scale, x, y });
  };

  const handleFill = () => {
    if (!image || !activeTemplate) return;
    const scale = Math.max(activeTemplate.width / image.width, activeTemplate.height / image.height);
    const x = (activeTemplate.width - image.width * scale) / 2;
    const y = (activeTemplate.height - image.height * scale) / 2;
    commit({ scale, x, y });
  };

  const handleCenter = () => {
    if (!image || !activeTemplate) return;
    const x = (activeTemplate.width - image.width * bgTransform.scale) / 2;
    const y = (activeTemplate.height - image.height * bgTransform.scale) / 2;
    commit({ x, y });
  };

  const handleReset = () => {
    commit({ scale: 1, x: 0, y: 0 });
  };

  const UploadButton = () => (
    <button onClick={handleUpload} disabled={isUploading} style={styles.uploadBtn}>
      <UploadCloud size={16} />
      {isUploading ? 'Uploading...' : 'Change Background'}
    </button>
  );

  if (!activeTemplate?.background_url) {
    return (
      <Accordion title="Background Image">
        <p style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12 }}>No background image uploaded.</p>
        <UploadButton />
      </Accordion>
    );
  }

  return (
    <Accordion title="BACKGROUND IMAGE">
      <div style={{ marginBottom: 16 }}>
        <UploadButton />
      </div>

      <div style={styles.grid}>
        <NumericField label="X Pos" value={Math.round(bgTransform.x)} onChange={(v) => commit({ x: v })} min={-4000} max={4000} />
        <NumericField label="Y Pos" value={Math.round(bgTransform.y)} onChange={(v) => commit({ y: v })} min={-4000} max={4000} />
      </div>

      <div style={{ marginTop: 12 }}>
        <SliderField 
          label="Scale (Zoom)" 
          value={bgTransform.scale} 
          onChange={(v) => commit({ scale: v })} 
          min={0.1} 
          max={10} 
          step={0.01} 
        />
      </div>

      <div style={styles.actionsGrid}>
        <button onClick={handleFit} style={styles.actionBtn}>Fit</button>
        <button onClick={handleFill} style={styles.actionBtn}>Fill</button>
        <button onClick={handleCenter} style={styles.actionBtn}>Center</button>
        <button onClick={handleReset} style={styles.actionBtn}>Reset</button>
      </div>

      <div style={{ marginTop: 16 }}>
        <ToggleField 
          label="Enable Visual Dragging (Disables Multi-select)" 
          value={bgTransform.isDraggable || false} 
          onChange={(v) => commit({ isDraggable: v })} 
        />
      </div>
    </Accordion>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  actionsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 12 },
  actionBtn: { 
    padding: '6px 0', 
    borderRadius: 6, 
    border: '1px solid #1E293B', 
    background: '#0F172A', 
    color: '#E2E8F0', 
    fontSize: 11, 
    fontWeight: 600, 
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  uploadBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    padding: '8px 0',
    borderRadius: 6,
    border: '1px dashed #38BDF8',
    background: 'rgba(56, 189, 248, 0.1)',
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s',
  }
};
