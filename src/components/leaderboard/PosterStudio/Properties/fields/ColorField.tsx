import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDebounce } from '../../Hooks/useDebounce';

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}

const RECENT_COLORS_KEY = 'ps_recent_colors';
const SSF_PALETTE = ["#000000", "#FFFFFF", "#0F766E", "#F59E0B", "#6B7280", "#EF4444"];

function getRecentColors(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) || '[]');
  } catch { return []; }
}

function addRecentColor(hex: string) {
  try {
    const recent = getRecentColors().filter((c) => c !== hex);
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify([hex, ...recent].slice(0, 8)));
  } catch {}
}

function isValidHex(hex: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

export default function ColorField({ label, value, onChange }: ColorFieldProps) {
  const [localHex, setLocalHex] = useState(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const debounced = useDebounce(localHex, 150);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLocalHex(value); }, [value]);
  useEffect(() => { setRecentColors(getRecentColors()); }, [pickerOpen]);

  useEffect(() => {
    if (isValidHex(debounced)) {
      onChange(debounced);
      addRecentColor(debounced);
    }
  }, [debounced]);

  const handleEyeDropper = async () => {
    if (!('EyeDropper' in window)) return;
    try {
      const eyeDropper = new (window as any).EyeDropper();
      const result = await eyeDropper.open();
      setLocalHex(result.sRGBHex);
      onChange(result.sRGBHex);
      addRecentColor(result.sRGBHex);
    } catch {}
  };

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  return (
    <div style={styles.container}>
      <label style={styles.label}>{label}</label>
      <div style={styles.row}>
        {/* Color Swatch */}
        <button
          onClick={() => setPickerOpen((v) => !v)}
          style={{ ...styles.swatch, backgroundColor: isValidHex(localHex) ? localHex : '#000000' }}
          title="Open color picker"
        />
        {/* Hex Input */}
        <input
          type="text"
          value={localHex}
          onChange={(e) => setLocalHex(e.target.value)}
          onBlur={() => { if (!isValidHex(localHex)) setLocalHex(value); }}
          maxLength={7}
          style={styles.hexInput}
        />
        {/* EyeDropper (conditional) */}
        {'EyeDropper' in window && (
          <button onClick={handleEyeDropper} style={styles.eyeBtn} title="Pick from screen">
            🎨
          </button>
        )}
      </div>

      {pickerOpen && (
        <div ref={pickerRef} style={styles.picker}>
          {/* Native Color Input as Hue Picker */}
          <input
            type="color"
            value={isValidHex(localHex) ? localHex : '#000000'}
            onChange={(e) => { setLocalHex(e.target.value); onChange(e.target.value); addRecentColor(e.target.value); }}
            style={styles.nativePicker}
          />
          {/* SSF Brand Palette */}
          <div style={styles.paletteSection}>
            <span style={styles.paletteLabel}>Brand</span>
            <div style={styles.paletteRow}>
              {SSF_PALETTE.map((c) => (
                <button
                  key={c}
                  style={{ ...styles.chip, backgroundColor: c, border: c === localHex ? '2px solid #38bdf8' : '1px solid #2a2a2a' }}
                  onClick={() => { setLocalHex(c); onChange(c); addRecentColor(c); }}
                />
              ))}
            </div>
          </div>
          {/* Recent Colors */}
          {recentColors.length > 0 && (
            <div style={styles.paletteSection}>
              <span style={styles.paletteLabel}>Recent</span>
              <div style={styles.paletteRow}>
                {recentColors.map((c) => (
                  <button
                    key={c}
                    style={{ ...styles.chip, backgroundColor: c, border: c === localHex ? '2px solid #38bdf8' : '1px solid #2a2a2a' }}
                    onClick={() => { setLocalHex(c); onChange(c); }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' },
  label: { fontSize: 10, color: '#94A3B8', fontFamily: 'Inter, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  row: { display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #2a2a2a', borderRadius: 8, padding: '0 8px', height: 36, backgroundColor: '#171717' },
  swatch: { width: 20, height: 20, borderRadius: 4, border: '1px solid #2a2a2a', cursor: 'pointer', flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' },
  hexInput: { flex: 1, fontFamily: 'monospace', fontSize: 12, border: 'none', outline: 'none', color: '#E2E8F0', background: 'transparent', letterSpacing: '0.05em' },
  eyeBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, color: '#94A3B8' },
  picker: { position: 'absolute', top: '100%', left: 0, zIndex: 9999, backgroundColor: '#1f1f1f', border: '1px solid #2a2a2a', borderRadius: 12, padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', marginTop: 4, minWidth: 200 },
  nativePicker: { width: '100%', height: 120, borderRadius: 8, border: 'none', cursor: 'pointer', marginBottom: 8, backgroundColor: 'transparent' },
  paletteSection: { marginBottom: 8 },
  paletteLabel: { fontSize: 9, fontFamily: 'Inter, sans-serif', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 },
  paletteRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  chip: { width: 24, height: 24, borderRadius: 6, cursor: 'pointer', padding: 0 },
};
