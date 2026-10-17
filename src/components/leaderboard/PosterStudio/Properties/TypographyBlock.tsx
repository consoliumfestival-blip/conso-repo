import React from 'react';
import NumericField from './fields/NumericField';
import ColorField from './fields/ColorField';
import FontSelect from './fields/FontSelect';
import SliderField, { ToggleField } from './fields/SliderField';
import Accordion from './Accordion';
import { useLayerStore, LayerData } from '../Stores/layerStore';
import { useHistoryStore } from '../Stores/historyStore';
import { useTemplateStore } from '../Stores/templateStore';
import { resolveTemplateVariables } from '../Utils/resolver';

interface TypographyBlockProps {
  layer: LayerData;
}

function detectScript(text: string): 'ml' | 'en' {
  return /[\u0D00-\u0D7F]/.test(text) ? 'ml' : 'en';
}

export default function TypographyBlock({ layer }: TypographyBlockProps) {
  const { updateLayerLinked, layers } = useLayerStore();
  const history = useHistoryStore();

  if (!layer || layer.type !== 'text') return null;

  const commit = (patch: Partial<LayerData>) => {
    history.push(layers);
    updateLayerLinked(layer.id, patch);
  };

  const { variables } = useTemplateStore();
  const resolved = resolveTemplateVariables(layer.text, variables);
  const detectedScript = detectScript(resolved);
  const isBold = (layer.fontWeight ?? 600) >= 700;
  const isItalic = (layer.fontStyle ?? '').includes('italic');
  const isUnderline = (layer.textDecoration ?? '').includes('underline');

  return (
    <Accordion title="Typography">
      <FontSelect
        label="Font Family"
        value={layer.fontFamily || 'Poppins'}
        onChange={(v) => commit({ fontFamily: v })}
        script={detectedScript}
      />

      <div style={styles.row}>
        <NumericField label="Size" value={layer.fontSize ?? 32} onChange={(v) => commit({ fontSize: v })} min={8} max={200} unit="px" />
        <div>
          <label style={styles.smallLabel}>Weight</label>
          <select
            value={layer.fontWeight ?? 600}
            onChange={(e) => commit({ fontWeight: parseInt(e.target.value) as any })}
            style={styles.select}
          >
            {[100, 300, 400, 500, 700, 900].map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Style Toggles */}
      <div style={styles.toggleRow}>
        <ToggleField label="Bold" value={isBold} onChange={(v) => commit({ fontWeight: v ? 700 : 400 })} icon="B" />
        <ToggleField label="Italic" value={isItalic} onChange={(v) => commit({ fontStyle: v ? 'italic' : 'normal' })} icon="I" />
        <ToggleField label="Underline" value={isUnderline} onChange={(v) => commit({ textDecoration: v ? 'underline' : '' })} icon="U" />
      </div>

      {/* Alignment */}
      <div>
        <label style={styles.smallLabel}>Alignment</label>
        <div style={styles.alignRow}>
          {(['left', 'center', 'right', 'justify'] as const).map((a) => (
            <button
              key={a}
              onClick={() => commit({ align: a })}
              style={{
                ...styles.alignBtn,
                backgroundColor: layer.align === a ? '#0F766E' : '#1f1f1f',
                color: layer.align === a ? '#FFFFFF' : '#94A3B8',
              }}
            >
              {a === 'left' ? '⟵' : a === 'center' ? '⟷' : a === 'right' ? '⟶' : '≡'}
            </button>
          ))}
        </div>
      </div>

      <SliderField label="Line Height" value={layer.lineHeight ?? 1.2} onChange={(v) => commit({ lineHeight: v })} min={1} max={3} step={0.1} />
      <NumericField label="Letter Spacing" value={layer.letterSpacing ?? 0} onChange={(v) => commit({ letterSpacing: v })} min={-10} max={100} unit="px" />
      <ColorField label="Text Color" value={layer.fill || '#000000'} onChange={(v) => commit({ fill: v })} />
      <ColorField label="Background Fill" value={layer.backgroundFill || '#00000000'} onChange={(v) => commit({ backgroundFill: v })} />
      <SliderField label="Background Opacity" value={layer.backgroundOpacity ?? 0} onChange={(v) => commit({ backgroundOpacity: v })} min={0} max={1} step={0.01} />

      <div style={styles.row}>
        <div>
          <label style={styles.smallLabel}>Overflow</label>
          <select
            value={layer.overflowMode ?? 'auto-shrink'}
            onChange={(e) => commit({ overflowMode: e.target.value as any })}
            style={styles.select}
          >
            <option value="clip">Clip</option>
            <option value="ellipsis">Ellipsis</option>
            <option value="auto-shrink">Auto-Shrink</option>
          </select>
        </div>
        <NumericField label="Max Lines" value={layer.maxLines ?? 0} onChange={(v) => commit({ maxLines: v })} min={0} max={20} />
      </div>
    </Accordion>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  toggleRow: { display: 'flex', gap: 8 },
  alignRow: { display: 'flex', gap: 4, marginTop: 4 },
  alignBtn: { flex: 1, height: 32, borderRadius: 6, border: '1px solid #2a2a2a', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  smallLabel: { fontSize: 10, color: '#94A3B8', fontFamily: 'Inter, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 3 },
  select: { width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #2a2a2a', backgroundColor: '#171717', color: '#E2E8F0', fontSize: 12, fontFamily: 'Inter, sans-serif', outline: 'none' },
};
