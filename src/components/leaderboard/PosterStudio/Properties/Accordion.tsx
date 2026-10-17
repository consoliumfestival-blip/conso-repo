import React, { useState, ReactNode } from 'react';

interface AccordionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export default function Accordion({ title, children, defaultOpen = true }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div style={styles.container}>
      <button 
        style={styles.header} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={styles.title}>{title}</span>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: 10, color: '#64748B' }}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div style={styles.content}>
          {children}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#171717',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  header: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    backgroundColor: '#1f1f1f',
    borderBottom: '1px solid #2a2a2a',
    cursor: 'pointer',
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    outline: 'none',
  },
  title: {
    fontSize: 12,
    fontWeight: 700,
    color: '#E2E8F0',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  content: {
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  }
};
