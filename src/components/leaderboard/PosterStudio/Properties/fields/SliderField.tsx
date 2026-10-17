import React, { useState, useEffect } from 'react';
import { useDebounce } from '../../Hooks/useDebounce';

interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

export default function SliderField({ label, value, onChange, min, max, step = 1, unit }: SliderFieldProps) {
  const [localValue, setLocalValue] = useState(value);
  const [inputValue, setInputValue] = useState(String(value));
  const debounced = useDebounce(inputValue, 150);

  useEffect(() => { setLocalValue(value); setInputValue(String(value)); }, [value]);
  useEffect(() => {
    const num = parseFloat(debounced);
    if (!isNaN(num)) onChange(Math.min(max, Math.max(min, num)));
  }, [debounced]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <label style={styles.label}>{label}</label>
        <div style={styles.inputRow}>
          <input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={() => {
              const num = parseFloat(inputValue);
              if (!isNaN(num)) {
                const c = Math.min(max, Math.max(min, num));
                setInputValue(String(c));
                onChange(c);
              } else { setInputValue(String(value)); }
            }}
            style={styles.numInput}
            step={step}
          />
          {unit && <span style={styles.unit}>{unit}</span>}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={localValue}
        onChange={(e) => setLocalValue(parseFloat(e.target.value))}
        onMouseUp={(e) => onChange(parseFloat((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onChange(parseFloat((e.target as HTMLInputElement).value))}
        className="custom-range-slider"
        style={styles.slider}
      />
      <style>{`
        .custom-range-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 4px;
          border-radius: 999px;
          background: #2a2a2a;
          outline: none;
          margin-top: 8px;
        }
        .custom-range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #0F766E;
          cursor: pointer;
          transition: transform 0.1s;
        }
        .custom-range-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
        .custom-range-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #0F766E;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 6 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 10, color: '#94A3B8', fontFamily: 'Inter, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  inputRow: { display: 'flex', alignItems: 'center', gap: 4 },
  numInput: { width: 56, height: 36, padding: '0 8px', fontSize: 12, border: '1px solid #2a2a2a', borderRadius: 6, outline: 'none', fontFamily: 'Inter, sans-serif', textAlign: 'right', transition: 'border-color 0.15s', backgroundColor: '#171717', color: '#E2E8F0' },
  unit: { fontSize: 11, color: '#94A3B8', fontFamily: 'Inter, sans-serif', fontWeight: 500 },
  slider: { width: '100%' },
};

// ToggleField
interface ToggleFieldProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: string;
}

export function ToggleField({ label, value, onChange, icon }: ToggleFieldProps) {
  return (
    <button
      onClick={() => onChange(!value)}
      title={label}
      style={{
        ...toggleStyles.btn,
        backgroundColor: value ? '#0f766e' : '#1f1f1f',
        color: value ? '#ccfbf1' : '#94A3B8',
        border: `1px solid ${value ? '#0d9488' : '#2a2a2a'}`,
        touchAction: 'manipulation',
      }}
    >
      {icon || label}
    </button>
  );
}

const toggleStyles: Record<string, React.CSSProperties> = {
  btn: { flex: 1, minHeight: 36, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' },
};
