import React from 'react';
import { useLayerStore } from '../Stores/layerStore';
import { useHistoryStore } from '../Stores/historyStore';

interface AlignAction {
  label: string;
  icon: string;
  action: () => void;
}

interface MultiSelectToolbarProps {
  canvasWidth: number;
  canvasHeight: number;
}

export default function MultiSelectToolbar({ canvasWidth, canvasHeight }: MultiSelectToolbarProps) {
  const { layers, selectedIds, updateLayer, removeLayer, duplicateLayer, groupSelected } = useLayerStore();
  const history = useHistoryStore();

  const selected = layers.filter((l) => selectedIds.includes(l.id));
  if (selected.length < 2) return null;

  const editableSelected = selected.filter((l) => l.lockProfile !== 'fully-locked');

  const getBox = (l: typeof selected[0]) => ({
    left: l.x,
    right: l.x + l.width,
    top: l.y,
    bottom: l.y + l.height,
    centerX: l.x + l.width / 2,
    centerY: l.y + l.height / 2,
  });

  const alignActions: AlignAction[] = [
    {
      label: 'Left',
      icon: '⟵',
      action: () => {
        const minLeft = Math.min(...editableSelected.map((l) => l.x));
        history.push(layers);
        editableSelected.forEach((l) => updateLayer(l.id, { x: minLeft }));
      },
    },
    {
      label: 'Center H',
      icon: '⟷',
      action: () => {
        const avgCX = editableSelected.reduce((sum, l) => sum + l.x + l.width / 2, 0) / editableSelected.length;
        history.push(layers);
        editableSelected.forEach((l) => updateLayer(l.id, { x: avgCX - l.width / 2 }));
      },
    },
    {
      label: 'Right',
      icon: '⟶',
      action: () => {
        const maxRight = Math.max(...editableSelected.map((l) => l.x + l.width));
        history.push(layers);
        editableSelected.forEach((l) => updateLayer(l.id, { x: maxRight - l.width }));
      },
    },
    {
      label: 'Top',
      icon: '⬆',
      action: () => {
        const minTop = Math.min(...editableSelected.map((l) => l.y));
        history.push(layers);
        editableSelected.forEach((l) => updateLayer(l.id, { y: minTop }));
      },
    },
    {
      label: 'Center V',
      icon: '↕',
      action: () => {
        const avgCY = editableSelected.reduce((sum, l) => sum + l.y + l.height / 2, 0) / editableSelected.length;
        history.push(layers);
        editableSelected.forEach((l) => updateLayer(l.id, { y: avgCY - l.height / 2 }));
      },
    },
    {
      label: 'Bottom',
      icon: '⬇',
      action: () => {
        const maxBottom = Math.max(...editableSelected.map((l) => l.y + l.height));
        history.push(layers);
        editableSelected.forEach((l) => updateLayer(l.id, { y: maxBottom - l.height }));
      },
    },
  ];

  const distributeH = () => {
    if (editableSelected.length < 3) return;
    const sorted = [...editableSelected].sort((a, b) => a.x - b.x);
    const totalWidth = sorted.reduce((sum, l) => sum + l.width, 0);
    const totalSpan = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width - sorted[0].x;
    const gap = (totalSpan - totalWidth) / (sorted.length - 1);
    history.push(layers);
    let cursor = sorted[0].x + sorted[0].width + gap;
    sorted.slice(1, -1).forEach((l) => {
      updateLayer(l.id, { x: cursor });
      cursor += l.width + gap;
    });
  };

  const distributeV = () => {
    if (editableSelected.length < 3) return;
    const sorted = [...editableSelected].sort((a, b) => a.y - b.y);
    const totalHeight = sorted.reduce((sum, l) => sum + l.height, 0);
    const totalSpan = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height - sorted[0].y;
    const gap = (totalSpan - totalHeight) / (sorted.length - 1);
    history.push(layers);
    let cursor = sorted[0].y + sorted[0].height + gap;
    sorted.slice(1, -1).forEach((l) => {
      updateLayer(l.id, { y: cursor });
      cursor += l.height + gap;
    });
  };

  return (
    <div style={styles.toolbar}>
      <span style={styles.label}>{selected.length} selected</span>
      <div style={styles.divider} />
      {/* Align */}
      {alignActions.map((a) => (
        <button key={a.label} onClick={a.action} style={styles.btn} title={a.label}>
          {a.icon}
        </button>
      ))}
      <div style={styles.divider} />
      {/* Distribute */}
      <button onClick={distributeH} style={styles.btn} title="Distribute Horizontally">⊣⊢</button>
      <button onClick={distributeV} style={styles.btn} title="Distribute Vertically">⊤⊥</button>
      <div style={styles.divider} />
      {/* Group */}
      <button onClick={groupSelected} style={styles.btn} title="Group (Ctrl+G)">⊞</button>
      {/* Delete */}
      <button
        onClick={() => {
          history.push(layers);
          editableSelected.forEach((l) => removeLayer(l.id));
        }}
        style={{ ...styles.btn, color: '#EF4444' }}
        title="Delete selected"
      >
        🗑
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    position: 'absolute',
    top: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#0B1F3A',
    borderRadius: 10,
    padding: '8px 12px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
    zIndex: 1000,
    userSelect: 'none',
  },
  label: { fontSize: 12, fontWeight: 600, color: '#94A3B8', fontFamily: 'Inter, sans-serif', marginRight: 8, letterSpacing: '0.05em' },
  btn: { width: 36, height: 36, borderRadius: 8, border: 'none', backgroundColor: 'rgba(255,255,255,0.1)', cursor: 'pointer', color: '#FFFFFF', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.15s' },
  divider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.15)', margin: '0 8px' },
};
