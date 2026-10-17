import React from 'react';
import Accordion from './Accordion';
import SliderField from './fields/SliderField';
import ColorField from './fields/ColorField';
import NumericField from './fields/NumericField';
import { LayerData } from '../Stores/layerStore';
import { useLayerStore } from '../Stores/layerStore';
import { useHistoryStore } from '../Stores/historyStore';

interface EffectsBlockProps {
  layer: LayerData;
}

export default function EffectsBlock({ layer }: EffectsBlockProps) {
  const { updateLayer, layers } = useLayerStore();
  const history = useHistoryStore();

  if (!layer) return null;

  const commit = (patch: Partial<LayerData>) => {
    history.push(layers);
    updateLayer(layer.id, patch);
  };

  return (
    <Accordion title="Effects" defaultOpen={false}>
      {/* Opacity */}
      <SliderField
        label="Opacity"
        value={layer.opacity ?? 1}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => commit({ opacity: v })}
      />

      <div style={styles.divider} />

      {/* Stroke */}
      <span style={styles.sectionTitle}>Stroke</span>
      <ColorField
        label="Stroke Color"
        value={layer.stroke || '#000000'}
        onChange={(v) => commit({ stroke: v })}
      />
      <SliderField
        label="Stroke Width"
        value={layer.strokeWidth || 0}
        min={0}
        max={20}
        step={1}
        onChange={(v) => commit({ strokeWidth: v })}
      />

      <div style={styles.divider} />

      {/* Shadow */}
      <span style={styles.sectionTitle}>Shadow</span>
      <ColorField
        label="Shadow Color"
        value={layer.shadowColor || '#000000'}
        onChange={(v) => commit({ shadowColor: v })}
      />
      <SliderField
        label="Shadow Blur"
        value={layer.shadowBlur || 0}
        min={0}
        max={100}
        step={1}
        onChange={(v) => commit({ shadowBlur: v })}
      />
      <div style={styles.row}>
        <NumericField
          label="X Offset"
          value={layer.shadowOffsetX || 0}
          min={-100}
          max={100}
          onChange={(v) => commit({ shadowOffsetX: v })}
        />
        <NumericField
          label="Y Offset"
          value={layer.shadowOffsetY || 0}
          min={-100}
          max={100}
          onChange={(v) => commit({ shadowOffsetY: v })}
        />
      </div>
    </Accordion>
  );
}

const styles: Record<string, React.CSSProperties> = {
  divider: { height: 1, backgroundColor: '#2a2a2a', margin: '8px 0' },
  sectionTitle: { fontSize: 10, fontWeight: 700, color: '#E2E8F0', textTransform: 'uppercase', letterSpacing: '0.05em' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
};
