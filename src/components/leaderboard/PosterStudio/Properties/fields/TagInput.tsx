import React, { useState, useRef, useEffect, useCallback } from 'react';

interface TagInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  availableVariables: string[];
}

const VARIABLE_PATTERN = /\{([^}]+)\}/g;

function parseToSegments(text: string): Array<{ type: 'text' | 'variable'; content: string }> {
  const segments: Array<{ type: 'text' | 'variable'; content: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(VARIABLE_PATTERN.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    segments.push({ type: 'variable', content: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) segments.push({ type: 'text', content: text.slice(lastIndex) });
  return segments;
}

export default function TagInput({ label, value, onChange, availableVariables }: TagInputProps) {
  const [draft, setDraft] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filterText, setFilterText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(value), [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === '{') {
        setShowDropdown(true);
        setFilterText('');
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
      }
    },
    []
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setDraft(v);
      onChange(v);
      // Update filter
      const lastBrace = v.lastIndexOf('{');
      if (lastBrace !== -1 && lastBrace < v.length) {
        setFilterText(v.slice(lastBrace + 1));
        setShowDropdown(true);
      } else {
        setShowDropdown(false);
      }
    },
    [onChange]
  );

  const insertVariable = (varName: string) => {
    const lastBrace = draft.lastIndexOf('{');
    const newValue = (lastBrace !== -1 ? draft.slice(0, lastBrace) : draft) + `{${varName}}`;
    setDraft(newValue);
    onChange(newValue);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const filtered = availableVariables.filter((v) =>
    v.toLowerCase().includes(filterText.toLowerCase())
  );

  const segments = parseToSegments(draft);

  return (
    <div style={styles.container}>
      <label style={styles.label}>{label}</label>
      <div style={styles.previewBox}>
        {segments.map((seg, i) =>
          seg.type === 'variable' ? (
            <span key={i} style={styles.chip}>{seg.content}</span>
          ) : (
            <span key={i}>{seg.content}</span>
          )
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder='Type { to insert a variable...'
          style={styles.input}
        />
        {showDropdown && filtered.length > 0 && (
          <div style={styles.dropdown}>
            {filtered.map((v) => (
              <button key={v} onClick={() => insertVariable(v)} style={styles.dropdownItem}>
                {`{${v}}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 10, color: '#64748B', fontFamily: 'Inter, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
  previewBox: { minHeight: 28, padding: '4px 8px', border: '1px solid #DDEAF1', borderRadius: 8, backgroundColor: '#F3F8FB', fontSize: 12, fontFamily: 'Inter, sans-serif', color: '#0F172A', wordBreak: 'break-word' },
  chip: { display: 'inline-block', backgroundColor: '#DBEAFE', color: '#1D4ED8', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700, fontFamily: 'monospace', margin: '0 2px' },
  input: { width: '100%', padding: '6px 8px', border: '1px solid #DDEAF1', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, backgroundColor: '#FFFFFF', border: '1px solid #DDEAF1', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 160, overflowY: 'auto' },
  dropdownItem: { display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'monospace', color: '#0F172A', transition: 'background 0.1s' },
};
