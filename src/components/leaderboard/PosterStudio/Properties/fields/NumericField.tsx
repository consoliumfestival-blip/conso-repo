import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDebounce } from '../../Hooks/useDebounce';

interface NumericFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: 'px' | '%';
  step?: number;
}

export default function NumericField({
  label,
  value,
  onChange,
  min = -9999,
  max = 9999,
  unit = 'px',
  step = 1,
}: NumericFieldProps) {
  const [localValue, setLocalValue] = useState(String(value));
  const [localUnit, setLocalUnit] = useState<'px' | '%'>(unit);
  const debounced = useDebounce(localValue, 150);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => setLocalValue(String(value)), [value]);

  // Propagate debounced value
  useEffect(() => {
    const num = parseFloat(debounced);
    if (!isNaN(num)) onChange(Math.min(max, Math.max(min, num)));
  }, [debounced]);

  const clampAndCommit = useCallback(() => {
    const num = parseFloat(localValue);
    if (!isNaN(num)) {
      const clamped = Math.min(max, Math.max(min, num));
      setLocalValue(String(clamped));
      onChange(clamped);
    } else {
      setLocalValue(String(value));
    }
  }, [localValue, min, max, onChange, value]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? step : -step;
      const newVal = Math.min(max, Math.max(min, (parseFloat(localValue) || 0) + delta));
      setLocalValue(String(newVal));
      onChange(newVal);
    },
    [localValue, min, max, step, onChange]
  );

  const handleUnitSwitch = () => {
    const newUnit = localUnit === 'px' ? '%' : 'px';
    setLocalUnit(newUnit);
    // Notify parent — caller decides what to do with unit context
  };

  return (
    <div style={styles.container}>
      <label style={styles.label}>{label}</label>
      <div style={styles.inputRow}>
        <input
          ref={inputRef}
          type="number"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={clampAndCommit}
          onWheel={handleWheel}
          step={step}
          style={styles.input}
        />
        <button onClick={handleUnitSwitch} style={styles.unitBtn}>
          {localUnit}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 10, color: '#94A3B8', fontFamily: 'Inter, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  inputRow: { display: 'flex', border: '1px solid #2a2a2a', borderRadius: 8, overflow: 'hidden', height: 42 },
  input: { flex: 1, padding: '0 8px', fontSize: 13, fontFamily: 'Inter, sans-serif', border: 'none', outline: 'none', color: '#E2E8F0', backgroundColor: '#171717', minWidth: 60 },
  unitBtn: { padding: '0 10px', fontSize: 11, fontFamily: 'Inter, sans-serif', fontWeight: 700, backgroundColor: '#1f1f1f', border: 'none', borderLeft: '1px solid #2a2a2a', cursor: 'pointer', color: '#38bdf8' },
};
