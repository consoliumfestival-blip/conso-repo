import React, { useState, useRef } from 'react';
import { fontService, FontMetadata } from '../../../../services/fontService';
import { useAuthStore } from '../../../../core/store/authStore';
import { useLocalSearchParams } from 'expo-router';

interface FontManagerPanelProps {
  onClose: () => void;
  onUploadSuccess: () => void;
}

export default function FontManagerPanel({ onClose, onUploadSuccess }: FontManagerPanelProps) {
  const { tenant_id } = useAuthStore();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const festivalId = Array.isArray(id) ? id[0] : id;

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenant_id) return;

    // Optional: Basic validation for font extension
    const nameParts = file.name.split('.');
    const ext = nameParts.pop()?.toLowerCase();
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext || '')) {
      setError('Only TTF, OTF, WOFF, and WOFF2 files are supported.');
      return;
    }

    const baseName = nameParts.join('.');
    const scope = 'tenant';

    try {
      setUploading(true);
      setError(null);

      const metadata: FontMetadata = {
        family: baseName, // Basic derived family name
        category: 'English', // Default, maybe allow user selection later
        scope: scope,
      };

      await fontService.uploadFont(
        file,
        festivalId || '',
        tenant_id,
        ext!,
        metadata
      );
      
      onUploadSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 style={styles.title}>Font Manager</h3>
        <p style={styles.subtitle}>Upload custom TTF, OTF, WOFF, or WOFF2 fonts.</p>
        
        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.uploadBox}>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleUpload} 
            accept=".ttf,.otf,.woff,.woff2" 
            style={{ display: 'none' }} 
            disabled={uploading}
          />
          <button 
            style={styles.uploadBtn} 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Browse Font File'}
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
  backdrop: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { backgroundColor: '#171717', border: '1px solid #2a2a2a', borderRadius: 12, padding: 24, width: 400, maxWidth: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', fontFamily: 'Inter, sans-serif' },
  title: { fontSize: 16, fontWeight: 700, color: '#E2E8F0', margin: '0 0 4px 0' },
  subtitle: { fontSize: 13, color: '#94A3B8', margin: '0 0 20px 0' },
  error: { backgroundColor: '#451a1a', color: '#fca5a5', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 16, border: '1px solid #7f1d1d' },
  uploadBox: { border: '1px dashed #2a2a2a', borderRadius: 8, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  uploadBtn: { padding: '8px 16px', backgroundColor: '#38bdf8', color: '#0f172a', fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  hint: { fontSize: 11, color: '#64748b', textAlign: 'center' },
  actions: { display: 'flex', justifyContent: 'flex-end', marginTop: 20 },
  closeBtn: { padding: '8px 16px', backgroundColor: 'transparent', color: '#94A3B8', fontWeight: 600, border: '1px solid #2a2a2a', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
};
