import React, { useState, useCallback } from 'react';
import NumericField from './fields/NumericField';
import Accordion from './Accordion';
import { LayerData, LockProfile } from '../Stores/layerStore';
import { useLayerStore } from '../Stores/layerStore';
import { useHistoryStore } from '../Stores/historyStore';

interface TransformBlockProps {
  layer: LayerData;
}

export default function TransformBlock({ layer }: TransformBlockProps) {
  const { updateLayer, layers } = useLayerStore();
  const history = useHistoryStore();
  const [aspectLocked, setAspectLocked] = useState(false);

  if (!layer) return null;

  const isFullyLocked = layer.lockProfile === 'fully-locked';
  const isSemiLocked = layer.lockProfile === 'semi-locked';

  const commit = useCallback(
    (patch: Partial<LayerData>) => {
      history.push(layers);
      updateLayer(layer.id, patch);
    },
    [history, layers, updateLayer, layer.id]
  );

  const handleWidthChange = (w: number) => {
    if (aspectLocked && layer.width > 0) {
      const ratio = layer.height / layer.width;
      commit({ width: w, height: Math.round(w * ratio) });
    } else {
      commit({ width: w });
    }
  };

  const handleHeightChange = (h: number) => {
    if (aspectLocked && layer.height > 0) {
      const ratio = layer.width / layer.height;
      commit({ width: Math.round(h * ratio), height: h });
    } else {
      commit({ height: h });
    }
  };

  const LockedDisplay = ({ label, value }: { label: string; value: number }) => (
    <div style={locked.container}>
      <span style={locked.label}>{label}</span>
      <div style={locked.valueRow}>
        <span style={locked.value}>{value}</span>
        <span style={locked.icon}>🔒</span>
      </div>
    </div>
  );

  if (isFullyLocked) {
    return (
      <Accordion title="Transform (Fully Locked)">
        <div style={styles.grid}>
          <LockedDisplay label="X" value={layer.x} />
          <LockedDisplay label="Y" value={layer.y} />
          <LockedDisplay label="W" value={layer.width} />
          <LockedDisplay label="H" value={layer.height} />
          <LockedDisplay label="°" value={layer.rotation ?? 0} />
        </div>
      </Accordion>
    );
  }

  return (
    <Accordion title="Transform">
      <div style={styles.grid}>
        {isSemiLocked ? (
          <>
            <LockedDisplay label="X" value={layer.x} />
            <LockedDisplay label="Y" value={layer.y} />
          </>
        ) : (
          <>
            <NumericField label="X" value={layer.x} onChange={(v) => commit({ x: v })} />
            <NumericField label="Y" value={layer.y} onChange={(v) => commit({ y: v })} />
          </>
        )}
        <NumericField label="Width" value={layer.width} onChange={handleWidthChange} min={10} max={4000} />
        <div style={styles.heightRow}>
          <NumericField label="Height" value={layer.height} onChange={handleHeightChange} min={10} max={4000} />
          <button
            onClick={() => setAspectLocked((v) => !v)}
            style={{ ...styles.lockBtn, color: aspectLocked ? '#0F766E' : '#94A3B8' }}
            title={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
          >
            {aspectLocked ? '🔗' : '⛓️'}
          </button>
        </div>
        <NumericField label="Rotation" value={layer.rotation ?? 0} onChange={(v) => commit({ rotation: v })} min={0} max={360} />
        <div style={styles.resetRow}>
          <button onClick={() => commit({ rotation: 0 })} style={styles.resetBtn}>↺ Reset</button>
        </div>
      </div>

      {/* Flip Controls */}
      <div style={styles.flipRow}>
        <button
          onClick={() => commit({ scaleX: (layer.scaleX ?? 1) * -1 })}
          style={styles.flipBtn}
          title="Flip Horizontal"
        >⇄ Flip H</button>
        <button
          onClick={() => commit({ scaleY: (layer.scaleY ?? 1) * -1 })}
          style={styles.flipBtn}
          title="Flip Vertical"
        >⇅ Flip V</button>
      </div>
    </Accordion>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  heightRow: { display: 'flex', alignItems: 'flex-end', gap: 4 },
  lockBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 4px', paddingBottom: 4 },
  resetRow: { display: 'flex', justifyContent: 'flex-end' },
  resetBtn: { fontSize: 10, padding: '4px 8px', borderRadius: 6, border: '1px solid #2a2a2a', background: '#1f1f1f', cursor: 'pointer', fontFamily: 'Inter, sans-serif', color: '#94A3B8' },
  flipRow: { display: 'flex', gap: 6, marginTop: 8 },
  flipBtn: { flex: 1, padding: '6px 0', borderRadius: 8, border: '1px solid #2a2a2a', backgroundColor: '#171717', cursor: 'pointer', fontSize: 11, fontFamily: 'Inter, sans-serif', fontWeight: 600, color: '#E2E8F0' },
};

const locked: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 2 },
  label: { fontSize: 10, color: '#94A3B8', fontFamily: 'Inter, sans-serif', fontWeight: 600, textTransform: 'uppercase' },
  valueRow: { display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px', backgroundColor: '#1f1f1f', borderRadius: 8, border: '1px solid #2a2a2a' },
  value: { fontSize: 12, fontFamily: 'Inter, sans-serif', color: '#E2E8F0', flex: 1 },
  icon: { fontSize: 10 },
};
