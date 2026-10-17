import React, { useState, useMemo } from 'react';
import { useLayerStore } from '../Stores/layerStore';
import { useTemplateStore } from '../Stores/templateStore';

export default function VariableBindingPanel({ variables = {} }: { variables?: Record<string, string | undefined> }) {
  const layers = useLayerStore((s) => s.layers);
  const updateVariable = useTemplateStore((s) => s.updateVariable);
  const [mode, setMode] = useState<'template' | 'preview'>('template');

  // Extract all unique {tokens} from all text layers
  const uniqueTokens = useMemo(() => {
    const tokens = new Set<string>();
    layers.forEach(layer => {
      if (layer.type === 'text' && layer.text) {
        const matches = layer.text.match(/\{[^}]+\}/g);
        if (matches) matches.forEach(m => tokens.add(m.replace(/[{}]/g, '')));
      }
    });
    return Array.from(tokens);
  }, [layers]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Variable Bindings</h3>
        <div style={styles.modeToggle}>
          <button 
            style={{ ...styles.toggleBtn, ...(mode === 'template' ? styles.activeBtn : {}) }}
            onClick={() => setMode('template')}
          >
            Template
          </button>
          <button 
            style={{ ...styles.toggleBtn, ...(mode === 'preview' ? styles.activeBtn : {}) }}
            onClick={() => setMode('preview')}
          >
            Preview
          </button>
        </div>
      </div>

      {uniqueTokens.length === 0 ? (
        <div style={styles.empty}>No variables found in this template. Type {"{variable}"} in any text layer to create one.</div>
      ) : (
        <div style={styles.list}>
          {uniqueTokens.map(token => (
            <div key={token} style={styles.row}>
              <label style={styles.label}>{`{${token}}`}</label>
              {mode === 'preview' ? (
                <input
                  type="text"
                  value={variables[token] || ''}
                  onChange={(e) => updateVariable(token, e.target.value)}
                  placeholder="Preview value..."
                  style={styles.input}
                />
              ) : (
                <span style={styles.chip}>Bound to database field</span>
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
    backgroundColor: '#FFFFFF',
    borderTop: '1px solid #E2E8F0',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: '#0F172A',
  },
  modeToggle: {
    display: 'flex',
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    padding: 2,
  },
  toggleBtn: {
    border: 'none',
    background: 'none',
    padding: '4px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: '#64748B',
    cursor: 'pointer',
    borderRadius: 4,
  },
  activeBtn: {
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  empty: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    padding: '24px 0',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 600,
    color: '#0284C7',
  },
  input: {
    padding: '6px 8px',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'Inter, sans-serif',
  },
  chip: {
    fontSize: 11,
    color: '#475569',
    backgroundColor: '#F1F5F9',
    padding: '4px 8px',
    borderRadius: 4,
    display: 'inline-block',
    alignSelf: 'flex-start',
  }
};
