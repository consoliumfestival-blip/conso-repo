import React from 'react';
import { useLayerStore, LayerData } from '../Stores/layerStore';
import { useHistoryStore } from '../Stores/historyStore';
import FontSelect from '../Properties/fields/FontSelect';
import { useTemplateStore } from '../Stores/templateStore';
import { resolveTemplateVariables } from '../Utils/resolver';

function detectScript(text: string): 'ml' | 'en' {
  return /[\u0D00-\u0D7F]/.test(text) ? 'ml' : 'en';
}

const PRESET_COLORS = ["#000000", "#FFFFFF", "#E11D48", "#2563EB", "#16A34A", "#F59E0B"];

interface TextToolbarProps {
  onOpenProperties?: () => void;
}

export default function TextToolbar({ onOpenProperties }: TextToolbarProps = {}) {
  const { layers, selectedIds, updateLayerLinked } = useLayerStore();
  const history = useHistoryStore();
  const { variables } = useTemplateStore();
  
  if (selectedIds.length !== 1) return null;
  const layer = layers.find(l => l.id === selectedIds[0]);
  if (!layer || layer.type !== 'text') return null;

  const commit = (patch: Partial<LayerData>) => {
    history.push(layers);
    updateLayerLinked(layer.id, patch);
  };

  const resolved = resolveTemplateVariables(layer.text, variables);
  const detectedScript = detectScript(resolved);
  
  return (
    <div style={styles.toolbar}>
      {/* 1. Font Family */}
      <div style={{ width: 140 }}>
        <FontSelect
          label=""
          value={layer.fontFamily || 'Poppins'}
          onChange={(v) => commit({ fontFamily: v })}
          script={detectedScript}
        />
      </div>

      <div style={styles.divider} />

      {/* 2. Font Size (- 30 +) */}
      <div style={styles.numberControl}>
        <button 
          style={styles.iconBtn} 
          onClick={() => commit({ fontSize: Math.max(8, (layer.fontSize || 30) - 2) })}
        >-</button>
        <input 
          style={styles.numberInput} 
          value={layer.fontSize || 30} 
          onChange={(e) => {
            const v = parseInt(e.target.value);
            if (!isNaN(v)) commit({ fontSize: v });
          }} 
        />
        <button 
          style={styles.iconBtn} 
          onClick={() => commit({ fontSize: Math.min(400, (layer.fontSize || 30) + 2) })}
        >+</button>
      </div>

      <div style={styles.divider} />

      {/* 3. Text Color (Native Color Picker hidden behind a colored circle) */}
      <div style={{ position: 'relative', width: 24, height: 24, borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)' }}>
         <input 
           type="color" 
           value={layer.fill || '#000000'} 
           onChange={(e) => commit({ fill: e.target.value })}
           style={{ width: 40, height: 40, position: 'absolute', top: -5, left: -5, cursor: 'pointer', padding: 0, border: 'none' }} 
         />
      </div>

      <div style={styles.divider} />

      {/* 4. Font Weight (Bold toggle simulation) */}
      <button 
        style={{...styles.iconBtn, backgroundColor: layer.fontWeight === 700 ? 'rgba(255,255,255,0.1)' : 'transparent'}}
        onClick={() => commit({ fontWeight: layer.fontWeight === 700 ? 400 : 700 })}
        title="Bold"
      >
        <strong style={{ fontFamily: 'serif', fontSize: 16 }}>B</strong>
      </button>

      {/* 5. Alignment Cycle */}
      <button 
        style={styles.iconBtn}
        onClick={() => {
          const nextAlign = layer.align === 'left' ? 'center' : layer.align === 'center' ? 'right' : 'left';
          commit({ align: nextAlign });
        }}
        title="Alignment"
      >
        {layer.align === 'center' ? '≡' : layer.align === 'right' ? '⇶' : '⇶'}
      </button>

      {/* 6. Spacing */}
      <button 
        style={styles.textBtn}
        onClick={() => {
          // In a real app this opens a popover, for now we just cycle line height
          commit({ lineHeight: layer.lineHeight === 1.4 ? 1.0 : layer.lineHeight === 1.0 ? 1.8 : 1.4 });
        }}
        title="Cycle Line Height"
      >
        Spacing
      </button>

      <div style={styles.divider} />

      {/* 7. Delete */}
      <button 
        style={styles.iconBtn}
        onClick={() => {
           history.push(layers);
           useLayerStore.getState().removeLayer(layer.id);
        }}
        title="Delete"
      >
        🗑
      </button>
      
      {/* 8. More */}
      <button style={styles.iconBtn} onClick={onOpenProperties} title="Advanced Properties">
        ...
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 40,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    margin: '0 8px',
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 4,
    border: 'none',
    backgroundColor: 'transparent',
    color: '#E2E8F0',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    transition: 'background-color 0.15s',
  },
  textBtn: {
    padding: '0 12px',
    height: 32,
    borderRadius: 4,
    border: 'none',
    backgroundColor: 'transparent',
    color: '#E2E8F0',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    transition: 'background-color 0.15s',
  },
  numberControl: {
    display: 'flex',
    alignItems: 'center',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    overflow: 'hidden',
    height: 32,
  },
  numberInput: {
    width: 36,
    height: '100%',
    backgroundColor: 'transparent',
    border: 'none',
    borderLeft: '1px solid rgba(255,255,255,0.2)',
    borderRight: '1px solid rgba(255,255,255,0.2)',
    color: '#E2E8F0',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: 600,
    outline: 'none',
  }
};
