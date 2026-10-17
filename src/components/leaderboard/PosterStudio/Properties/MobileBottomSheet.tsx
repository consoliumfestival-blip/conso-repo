import React, { useState, useEffect, useRef, useCallback } from 'react';
import TransformBlock from './TransformBlock';
import TypographyBlock from './TypographyBlock';
import { LayerData } from '../Stores/layerStore';

interface MobileBottomSheetProps {
  selectedLayer: LayerData | null;
  onClose: () => void;
}

type Tab = 'transform' | 'typography' | 'style' | 'variable';

export default function MobileBottomSheet({ selectedLayer, onClose }: MobileBottomSheetProps) {
  const [activeTab, setActiveTab] = useState<Tab>('transform');
  const [sheetHeight, setSheetHeight] = useState(60); // vh
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startHeight, setStartHeight] = useState(60);
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedLayer) {
      setVisible(true);
      setSheetHeight(60);
    } else {
      setVisible(false);
    }
  }, [selectedLayer]);

  // Visual Viewport for keyboard avoidance
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;
    const handleResize = () => {
      const keyboardHeight = window.innerHeight - (vv.height + vv.offsetTop);
      if (sheetRef.current) {
        sheetRef.current.style.bottom = `${Math.max(0, keyboardHeight)}px`;
      }
    };
    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    setStartY(e.touches[0].clientY);
    setStartHeight(sheetHeight);
  }, [sheetHeight]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = startY - e.touches[0].clientY;
    const newHeight = Math.min(90, Math.max(20, startHeight + (delta / window.innerHeight) * 100));
    setSheetHeight(newHeight);
  }, [isDragging, startY, startHeight]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    if (sheetHeight < 30) {
      setVisible(false);
      onClose();
    }
  }, [sheetHeight, onClose]);

  if (!visible || !selectedLayer) return null;

  const tabs: Tab[] = ['transform', ...(selectedLayer.type === 'text' ? ['typography' as Tab] : []), 'variable'];

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9000, backgroundColor: 'transparent' }}
        onClick={() => { setVisible(false); onClose(); }}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          height: `${sheetHeight}vh`,
          zIndex: 9001,
          backgroundColor: '#FFFFFF',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
          transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag Handle */}
        <div style={styles.handle}>
          <div style={styles.handleBar} />
        </div>

        {/* Layer Name */}
        <div style={styles.headerRow}>
          <span style={styles.layerName}>{selectedLayer.name}</span>
          <button onClick={() => { setVisible(false); onClose(); }} style={styles.closeBtn}>✕</button>
        </div>

        {/* Tabs */}
        <div style={styles.tabRow}>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                ...styles.tab,
                borderBottom: activeTab === tab ? '2px solid #0F766E' : '2px solid transparent',
                color: activeTab === tab ? '#0F766E' : '#64748B',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={styles.content}>
          {activeTab === 'transform' && <TransformBlock layer={selectedLayer} />}
          {activeTab === 'typography' && selectedLayer.type === 'text' && <TypographyBlock layer={selectedLayer} />}
          {activeTab === 'variable' && (
            <div style={styles.variablePlaceholder}>
              <p style={styles.variablePlaceholderText}>Variable binding is available in the Variables panel.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  handle: { display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 6, cursor: 'grab' },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1' },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 8px' },
  layerName: { fontSize: 14, fontFamily: 'Inter, sans-serif', fontWeight: 700, color: '#0F172A' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748B', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tabRow: { display: 'flex', borderBottom: '1px solid #DDEAF1', paddingLeft: 8 },
  tab: { padding: '10px 14px', minHeight: 44, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'Inter, sans-serif', fontWeight: 600, transition: 'all 0.15s' },
  content: { flex: 1, overflowY: 'auto', padding: '12px 16px' },
  variablePlaceholder: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 },
  variablePlaceholderText: { color: '#94A3B8', fontFamily: 'Inter, sans-serif', fontSize: 13, textAlign: 'center' },
};
