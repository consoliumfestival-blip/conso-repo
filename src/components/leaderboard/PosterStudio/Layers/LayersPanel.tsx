import React, { useState } from 'react';
import { useLayerStore } from '../Stores/layerStore';
import { useHistoryStore } from '../Stores/historyStore';
import { GripVertical, Type, Image as ImageIcon, Square, Eye, EyeOff, Lock, Unlock } from 'lucide-react';

export default function LayersPanel() {
  const { layers, selectedIds, setSelectedIds, toggleVisibility, toggleLock, reorderLayers } = useLayerStore();
  const historyStore = useHistoryStore();

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Store expects reorderLayers(fromIndex, toIndex) based on ASCENDING zIndex.
  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires setting data to drag
    e.dataTransfer.setData('text/plain', id);
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
    if (dropTargetId !== id) {
      setDropTargetId(id);
    }
  };

  const handleDragLeave = () => {
    setDropTargetId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDropTargetId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      handleDragEnd();
      return;
    }

    const fromIndex = sortedLayers.findIndex((l) => l.id === draggedId);
    const toIndex = sortedLayers.findIndex((l) => l.id === targetId);

    if (fromIndex !== -1 && toIndex !== -1) {
      historyStore.push(layers); // Save history before reorder
      reorderLayers(fromIndex, toIndex);
    }
    handleDragEnd();
  };

  // We render descending (top layer first)
  const renderLayers = [...sortedLayers].reverse();

  return (
    <div style={styles.panelSection} onDragLeave={handleDragLeave}>
      {renderLayers.length === 0 && <p style={styles.emptyMsg}>No layers yet.</p>}
      {renderLayers.map((l) => {
        const isDragged = draggedId === l.id;
        const isDropTarget = dropTargetId === l.id;
        
        // Determine whether the drop indicator should be above or below
        // Since we render descending, if we drag an item "up" visually, we are dropping it at a higher zIndex.
        const fromIdx = sortedLayers.findIndex((sl) => sl.id === draggedId);
        const toIdx = sortedLayers.findIndex((sl) => sl.id === l.id);
        const dropIsAboveVisually = fromIdx < toIdx; // Dragging from lower zIndex to higher zIndex -> visually above

        return (
          <div
            key={l.id}
            draggable
            onDragStart={(e) => handleDragStart(e, l.id)}
            onDragOver={(e) => handleDragOver(e, l.id)}
            onDrop={(e) => handleDrop(e, l.id)}
            onDragEnd={handleDragEnd}
            onClick={() => setSelectedIds([l.id])}
            style={{
              ...styles.layerItem,
              backgroundColor: selectedIds.includes(l.id) ? '#2a2a2a' : 'transparent',
              borderColor: selectedIds.includes(l.id) ? '#38bdf8' : '#2a2a2a',
              opacity: isDragged ? 0.4 : l.isVisible ? 1 : 0.45,
              borderTop: isDropTarget && dropIsAboveVisually ? '2px solid #38bdf8' : '1px solid ' + (selectedIds.includes(l.id) ? '#38bdf8' : '#2a2a2a'),
              borderBottom: isDropTarget && !dropIsAboveVisually ? '2px solid #38bdf8' : '1px solid ' + (selectedIds.includes(l.id) ? '#38bdf8' : '#2a2a2a'),
            }}
          >
            <div style={styles.dragHandle}>
              <GripVertical size={14} />
            </div>
            <div style={styles.layerIcon}>
              {l.type === 'text' ? <Type size={14} /> : l.type === 'image' ? <ImageIcon size={14} /> : <Square size={14} />}
            </div>
            <span style={styles.layerName}>{l.name}</span>
            <div style={styles.layerActions}>
              <button
                onClick={(e) => { e.stopPropagation(); toggleVisibility(l.id); }}
                style={styles.miniBtn}
                title={l.isVisible ? 'Hide' : 'Show'}
              >
                {l.isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleLock(l.id); }}
                style={styles.miniBtn}
                title={l.isLocked ? 'Unlock' : 'Lock'}
              >
                {l.lockProfile === 'fully-locked' ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panelSection: { display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 16px 80px 16px', overflowY: 'auto', height: '100%' },
  emptyMsg: { fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '20px 0' },
  layerItem: { 
    display: 'flex', 
    alignItems: 'center', 
    gap: 8, 
    padding: '8px 10px', 
    borderRadius: 6, 
    cursor: 'pointer', 
    transition: 'background-color 0.15s',
    userSelect: 'none'
  },
  dragHandle: { display: 'flex', alignItems: 'center', color: '#64748B', cursor: 'grab' },
  layerIcon: { flexShrink: 0, width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' },
  layerName: { flex: 1, fontSize: 13, fontWeight: 500, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  layerActions: { display: 'flex', gap: 4 },
  miniBtn: { 
    background: 'none', 
    border: 'none', 
    cursor: 'pointer', 
    padding: '4px', 
    borderRadius: 4, 
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94A3B8',
    transition: 'color 0.1s, background-color 0.1s' 
  },
};
