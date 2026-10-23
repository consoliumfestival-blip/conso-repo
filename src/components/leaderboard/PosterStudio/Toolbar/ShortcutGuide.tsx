import { coreColor, coreAlpha } from '@/constants/coreTheme';
import React from 'react';

interface ShortcutGuideProps {
  onClose: () => void;
}

export default function ShortcutGuide({ onClose }: ShortcutGuideProps) {
  const shortcuts = [
    { key: 'Ctrl+Z', action: 'Undo' },
    { key: 'Ctrl+Shift+Z', action: 'Redo' },
    { key: 'Arrows', action: 'Nudge layer ±1px' },
    { key: 'Shift+Arrows', action: 'Nudge layer ±10px' },
    { key: 'Delete', action: 'Delete selected layer' },
    { key: 'Ctrl+D', action: 'Duplicate layer' },
    { key: 'Ctrl+C', action: 'Copy' },
    { key: 'Ctrl+X', action: 'Cut' },
    { key: 'Ctrl+V', action: 'Paste' },
    { key: 'Ctrl+Shift+V', action: 'Paste in place' },
    { key: 'Ctrl+G', action: 'Group selected' },
    { key: 'Ctrl+Shift+G', action: 'Ungroup' },
    { key: 'Ctrl+L', action: 'Toggle lock' },
    { key: 'Ctrl+H', action: 'Toggle visibility' },
    { key: 'Ctrl+=', action: 'Zoom in' },
    { key: 'Ctrl+-', action: 'Zoom out' },
    { key: 'Ctrl+0', action: 'Fit canvas' },
    { key: 'Ctrl+Shift+E', action: 'Quick export' },
    { key: 'Ctrl+S', action: 'Manual save draft' },
    { key: 'Escape', action: 'Deselect all' },
  ];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Keyboard Shortcuts</h2>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        <div style={styles.grid}>
          {shortcuts.map((s, i) => (
            <div key={i} style={styles.row}>
              <span style={styles.keyBadge}>{s.key}</span>
              <span style={styles.action}>{s.action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: coreAlpha(coreColor('#0f172a', 'overlay'), 0.6),
    zIndex: 99999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
  },
  modal: {
    backgroundColor: coreColor('#FFFFFF', 'surface'),
    borderRadius: 12,
    padding: 24,
    width: 400,
    maxWidth: '90vw',
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: `1px solid ${coreColor('#E2E8F0', 'border')}`,
    paddingBottom: 12,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: coreColor('#0F172A', 'overlay'),
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 24,
    color: coreColor('#64748B', 'textMuted'),
    cursor: 'pointer',
    lineHeight: 1,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 12,
    maxHeight: '60vh',
    overflowY: 'auto',
    paddingRight: 8,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  keyBadge: {
    backgroundColor: coreColor('#F1F5F9', 'surface'),
    border: `1px solid ${coreColor('#CBD5E1', 'border')}`,
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 600,
    color: coreColor('#475569', 'text'),
  },
  action: {
    fontSize: 14,
    color: coreColor('#334155', 'text'),
  },
};
