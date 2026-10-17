import React from 'react';
import { useTemplateStore } from '../Stores/templateStore';
import { useLayerStore } from '../Stores/layerStore';
import { useHistoryStore } from '../Stores/historyStore';
import { resolveTemplateVariables } from '../Utils/resolver';

const MAX_RANKS = 5;

const AVAILABLE_VARIABLES: { key: string; label: string }[] = [
  { key: 'event_name', label: '🏆 Event Name' },
  { key: 'category_name', label: '🏷 Category Name' },
  { key: 'category_name_ml', label: '🏷 Category Name (Malayalam)' },
  { key: 'result_no', label: '🔢 Result No' },
];

for (let i = 1; i <= MAX_RANKS; i++) {
  AVAILABLE_VARIABLES.push({ key: `name_${i}`, label: `👤 Name-${i}` });
  AVAILABLE_VARIABLES.push({ key: `unit_${i}`, label: `🏢 Unit-${i}` });
  AVAILABLE_VARIABLES.push({ key: `grade_${i}`, label: `📝 Grade-${i}` });
  AVAILABLE_VARIABLES.push({ key: `points_${i}`, label: `⭐ Points-${i}` });
}

export function VariablePreview({ layerId, variables = {} }: { layerId: string, variables?: Record<string, string | undefined> }) {
  const layer = useLayerStore((s) => s.layers.find(l => l.id === layerId));
  const { updateLayer, layers } = useLayerStore();
  const history = useHistoryStore();

  const updateVariable = useTemplateStore((s) => s.updateVariable);

  if (!layer || layer.type !== 'text') return null;

  const resolvedText = resolveTemplateVariables(layer.text, variables);
  const currentBinding = layer.dynamicBinding || '';

  // Handle manual text changes
  const handleTextChange = (newVal: string) => {
    if (layer.dynamicBinding) {
      // Dynamic layer -> edit the preview value of the bound variable
      updateVariable(layer.dynamicBinding, newVal);
    } else {
      // Static layer -> edit the layer text directly
      updateLayer(layer.id, { text: newVal });
    }
  };

  // Commit text change to history on blur
  const handleTextBlur = (val: string) => {
    if (!layer.dynamicBinding && val !== layer.text) {
      history.push(layers);
      updateLayer(layer.id, { text: val });
    }
  };

  // Handle dynamic source binding selector
  const handleBindingChange = (newBinding: string) => {
    history.push(layers);
    if (!newBinding) {
      // Unbind -> switch to manual static text using currently resolved text
      updateLayer(layer.id, {
        dynamicBinding: undefined,
        text: resolvedText,
        manualOverride: true
      });
    } else {
      // Bind to template variable
      updateLayer(layer.id, {
        dynamicBinding: newBinding,
        text: `{${newBinding}}`,
        manualOverride: undefined
      });
      // Ensure the variable has at least a fallback preview value if empty
      if (variables[newBinding] === undefined) {
        updateVariable(newBinding, 'PREVIEW TEXT');
      }
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h4 style={styles.title}>Data Binding & Text</h4>
        {currentBinding ? (
          <span style={styles.activeBadge}>Dynamic</span>
        ) : (
          <span style={styles.staticBadge}>Static</span>
        )}
      </div>

      {/* 1. Text Content Input */}
      <div style={styles.fieldGroup}>
        <label style={styles.smallLabel}>Text Content</label>
        <textarea
          value={resolvedText}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={(e) => handleTextBlur(e.target.value)}
          placeholder="Type static text or edit preview..."
          rows={2}
          style={styles.textarea}
        />
        {currentBinding && (
          <span style={styles.helperText}>
            💡 Editing this updates the live preview value for variable <b>{`{${currentBinding}}`}</b>.
          </span>
        )}
      </div>

      {/* 2. Dynamic Source Selector */}
      <div style={styles.fieldGroup}>
        <label style={styles.smallLabel}>Dynamic Source</label>
        <select
          value={currentBinding}
          onChange={(e) => handleBindingChange(e.target.value)}
          style={styles.select}
        >
          <option value="">Static / Manual Text</option>
          {AVAILABLE_VARIABLES.map((v) => (
            <option key={v.key} value={v.key}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* 3. Variable Preview Table (If bound) */}
      {currentBinding && (
        <div style={styles.variableCard}>
          <div style={styles.varRow}>
            <span style={styles.varLabel}>Token</span>
            <span style={styles.varCode}>{`{${currentBinding}}`}</span>
          </div>
          <div style={styles.varRow}>
            <span style={styles.varLabel}>Value</span>
            <span style={styles.varValue}>{variables[currentBinding] || '(empty)'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    border: '1px solid #E2E8F0',
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 11,
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: 0,
  },
  activeBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: '#0D9488',
    backgroundColor: '#CCFBF1',
    padding: '2px 8px',
    borderRadius: 20,
    textTransform: 'uppercase',
  },
  staticBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    padding: '2px 8px',
    borderRadius: 20,
    textTransform: 'uppercase',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  smallLabel: {
    fontSize: 10,
    color: '#64748B',
    fontFamily: 'Inter, sans-serif',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  textarea: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #CBD5E1',
    fontSize: 13,
    fontFamily: 'Inter, sans-serif',
    outline: 'none',
    resize: 'none',
    boxSizing: 'border-box',
    color: '#0F172A',
  },
  select: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #CBD5E1',
    fontSize: 13,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#FFFFFF',
    outline: 'none',
    boxSizing: 'border-box',
    color: '#0F172A',
  },
  helperText: {
    fontSize: 10,
    color: '#0D9488',
    marginTop: 2,
  },
  variableCard: {
    padding: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    border: '1px solid #E2E8F0',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  varRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 11,
  },
  varLabel: {
    color: '#64748B',
    fontWeight: 500,
  },
  varCode: {
    fontFamily: 'monospace',
    color: '#0284C7',
    backgroundColor: '#E0F2FE',
    padding: '1px 4px',
    borderRadius: 4,
    fontWeight: 600,
  },
  varValue: {
    fontWeight: 600,
    color: '#0F172A',
  },
};
