import React from 'react';

interface ToggleFieldProps {
  label: string;
  value: boolean;
  onChange: (val: boolean) => void;
  icon?: string;
}

export default function ToggleField({ label, value, onChange, icon }: ToggleFieldProps) {
  return (
    <div style={styles.container} title={label}>
      <button
        style={{
          ...styles.button,
          backgroundColor: value ? '#E0F2FE' : 'transparent',
          borderColor: value ? '#0284C7' : '#E2E8F0',
          color: value ? '#0284C7' : '#64748B',
        }}
        onClick={() => onChange(!value)}
      >
        {icon ? (
          <span style={styles.icon}>{icon}</span>
        ) : (
          <span style={styles.text}>{label}</span>
        )}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'inline-flex',
  },
  button: {
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '32px',
    height: '32px',
    transition: 'all 0.2s',
  },
  icon: {
    fontSize: '14px',
    fontWeight: 'bold',
  },
  text: {
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
  },
};
