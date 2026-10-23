import { coreColor } from '@/constants/coreTheme';
import React, { useState } from 'react';
import { useTemplateStore } from '../Stores/templateStore';
import { useLayerStore } from '../Stores/layerStore';

export default function VersionHistory() {
  const { versionHistory, activeTemplate, setActiveTemplate } = useTemplateStore();
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  const handleRestore = (versionId: string) => {
    const version = versionHistory.find((v) => v.id === versionId);
    if (!version || !activeTemplate) return;

    if (window.confirm(`Restore template to version ${version.version_number}? Unsaved changes will be lost.`)) {
      const restoredTemplate = { ...activeTemplate, layers: version.content };
      setActiveTemplate(restoredTemplate);
      // BUGFIX: also sync the canvas layer store so the canvas redraws
      useLayerStore.getState().setLayers(version.content);
      alert('✓ Version restored — canvas updated.');
    }
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Version History</h3>
      
      {versionHistory.length === 0 ? (
        <div style={styles.empty}>No saved versions yet.</div>
      ) : (
        <div style={styles.list}>
          {versionHistory.map((v) => (
            <div 
              key={v.id} 
              style={{
                ...styles.versionCard,
                borderColor: selectedVersion === v.id ? coreColor('#0284C7', 'border') : coreColor('#E2E8F0', 'border'),
                backgroundColor: selectedVersion === v.id ? coreColor('#F0F9FF', 'infoSoft') : coreColor('#FFFFFF', 'surface'),
              }}
              onClick={() => setSelectedVersion(v.id)}
            >
              <div style={styles.vHeader}>
                <span style={styles.vNum}>v{v.version_number}</span>
                <span style={styles.vDate}>{new Date(v.created_at).toLocaleString()}</span>
              </div>
              {v.label && <div style={styles.vLabel}>{v.label}</div>}
              
              {selectedVersion === v.id && (
                <button style={styles.restoreBtn} onClick={(e) => { e.stopPropagation(); handleRestore(v.id); }}>
                  Restore this version
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 16,
    backgroundColor: coreColor('#F8FAFC', 'surface'),
    borderTop: `1px solid ${coreColor('#E2E8F0', 'border')}`,
    maxHeight: 300,
    overflowY: 'auto',
  },
  title: { margin: '0 0 12px 0', fontSize: 14, fontWeight: 700, color: coreColor('#0F172A', 'overlay') },
  empty: { fontSize: 12, color: coreColor('#64748B', 'textMuted'), textAlign: 'center', padding: '12px 0' },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  versionCard: {
    padding: 12,
    borderRadius: 8,
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  vHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 },
  vNum: { fontSize: 12, fontWeight: 700, color: coreColor('#0F172A', 'overlay') },
  vDate: { fontSize: 10, color: coreColor('#64748B', 'textMuted') },
  vLabel: { fontSize: 11, color: coreColor('#475569', 'text'), fontStyle: 'italic', marginBottom: 8 },
  restoreBtn: {
    width: '100%',
    padding: '6px',
    backgroundColor: coreColor('#0284C7', 'infoAction'),
    color: coreColor('#FFFFFF', 'text'),
    border: 'none',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  }
};
