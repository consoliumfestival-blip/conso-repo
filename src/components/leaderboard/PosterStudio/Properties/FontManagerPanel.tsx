import { coreColor, coreAlpha } from '@/constants/coreTheme';
import React, { useState, useRef } from 'react';
import { fontService, FontMetadata } from '../../../../services/fontService';
import { FILE_LIMITS } from '../../../../services/storage/uploadService';
import { useAuthStore } from '../../../../core/store/authStore';
import { useFestival } from '../../../../core/hooks/useFestival';
import { useLocalSearchParams } from 'expo-router';

interface FontManagerPanelProps {
  onClose: () => void;
  onUploadSuccess: () => void;
}

export default function FontManagerPanel({ onClose, onUploadSuccess }: FontManagerPanelProps) {
  const { tenant_id } = useAuthStore();
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const paramFestivalId = Array.isArray(id) ? id[0] : id;
  const festivalId = activeFestival?.id || paramFestivalId || '';

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFontFile = async (file: File, family: string) => {
    if (typeof FontFace === 'undefined') return;
    const localUrl = URL.createObjectURL(file);
    try {
      await new FontFace(family, `url("${localUrl}")`).load();
    } catch {
      throw new Error('The file content is not a valid font that this browser can load.');
    } finally {
      URL.revokeObjectURL(localUrl);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !tenant_id) return;

    try {
      setUploading(true);
      setError(null);
      setUploadSummary('');
      setUploadStatus('');
      setUploadProgress(0);
      const failures: string[] = [];
      let uploaded = 0;

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const nameParts = file.name.split('.');
        const ext = nameParts.pop()?.toLowerCase();
        if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext || '')) {
          failures.push(`${file.name}: unsupported font format.`);
          continue;
        }
        if (!file.size || file.size > FILE_LIMITS.font) {
          failures.push(`${file.name}: font files must not exceed ${FILE_LIMITS.font / 1024 / 1024} MB.`);
          continue;
        }

        const metadata: FontMetadata = {
          family: nameParts.join('.').trim() || file.name,
          category: 'English',
          scope: 'tenant',
        };

        try {
          setUploadStatus(`Validating ${index + 1}/${files.length}: ${file.name}`);
          await validateFontFile(file, metadata.family);
          setUploadStatus(`Uploading ${index + 1}/${files.length}: ${file.name}`);
          await fontService.uploadFont(
            file,
            festivalId || '',
            tenant_id,
            ext!,
            metadata,
            (progress) => {
              setUploadProgress(Math.round(((index + progress / 100) / files.length) * 100));
              setUploadStatus(`Uploading ${index + 1}/${files.length}: ${file.name}`);
            },
          );
          uploaded += 1;
        } catch (fileError) {
          failures.push(`${file.name}: ${fileError instanceof Error ? fileError.message : 'upload failed.'}`);
        }
      }

      if (uploaded > 0) onUploadSuccess();
      setUploadSummary(`${uploaded} of ${files.length} font${files.length === 1 ? '' : 's'} uploaded.`);
      if (failures.length > 0) setError(failures.join(' '));
    } finally {
      setUploading(false);
      setUploadStatus('');
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 style={styles.title}>Font Manager</h3>
        <p style={styles.subtitle}>Choose one or more TTF, OTF, WOFF, or WOFF2 files from this computer.</p>
        
        {error && <div style={styles.error}>{error}</div>}
        {uploadSummary && <div role="status" style={styles.success}>{uploadSummary}</div>}

        <div style={styles.uploadBox}>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleUpload} 
            accept=".ttf,.otf,.woff,.woff2" 
            multiple
            style={{ display: 'none' }} 
            disabled={uploading}
          />
          <button 
            style={styles.uploadBtn} 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading
              ? uploadStatus.startsWith('Uploading')
                ? `${uploadStatus} ${uploadProgress ?? 0}%`
                : uploadStatus || 'Preparing font upload…'
              : 'Browse Font Files'}
          </button>
          <span style={styles.hint}>
            Fonts uploaded here are available to all festivals in this organization.
          </span>
        </div>

        <div style={styles.actions}>
          <button style={styles.closeBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, backgroundColor: coreAlpha(coreColor('#000000', 'surface'), 0.8), zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { backgroundColor: coreColor('#171717', 'surfaceStrong'), border: `1px solid ${coreColor('#2a2a2a', 'border')}`, borderRadius: 12, padding: 24, width: 400, maxWidth: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', fontFamily: "Outfit_400Regular" },
  title: { fontSize: 16, fontWeight: 700, color: coreColor('#E2E8F0', 'text'), margin: '0 0 4px 0' },
  subtitle: { fontSize: 13, color: coreColor('#94A3B8', 'textSubtle'), margin: '0 0 20px 0' },
  error: { backgroundColor: coreColor('#451a1a', 'surfaceStrong'), color: coreColor('#fca5a5', 'danger'), padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 16, border: `1px solid ${coreColor('#7f1d1d', 'border')}` },
  success: { backgroundColor: coreColor('#ecfdf5', 'successSoft'), color: coreColor('#047857', 'success'), padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 16 },
  uploadBox: { border: `1px dashed ${coreColor('#2a2a2a', 'border')}`, borderRadius: 8, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  uploadBtn: { padding: '8px 16px', backgroundColor: coreColor('#38bdf8', 'infoAction'), color: coreColor('#0f172a', 'overlay'), fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  hint: { fontSize: 11, color: coreColor('#64748b', 'textMuted'), textAlign: 'center' },
  actions: { display: 'flex', justifyContent: 'flex-end', marginTop: 20 },
  closeBtn: { padding: '8px 16px', backgroundColor: 'transparent', color: coreColor('#94A3B8', 'textSubtle'), fontWeight: 600, border: `1px solid ${coreColor('#2a2a2a', 'border')}`, borderRadius: 6, cursor: 'pointer', fontSize: 13 },
};
