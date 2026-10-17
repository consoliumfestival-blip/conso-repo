import React from 'react';
import { useLayerStore } from '../Stores/layerStore';
import { useHistoryStore } from '../Stores/historyStore';
import { useTemplateStore } from '../Stores/templateStore';

interface StudioContextMenuProps {
  x: number;
  y: number;
  targetId: string | null;
  targetType: 'layer' | 'canvas' | null;
  onClose: () => void;
  onOpenProperties?: () => void;
}

export default function StudioContextMenu({ x, y, targetId, targetType, onClose, onOpenProperties }: StudioContextMenuProps) {
  const { layers, duplicateLayer, removeLayer, toggleLock, toggleVisibility, setLayers } = useLayerStore();
  const history = useHistoryStore();
  
  if (!targetId || targetType !== 'layer') return null; // Canvas context menu not fully implemented yet

  const layer = layers.find(l => l.id === targetId);
  if (!layer) return null;

  const commit = () => {
    history.push(layers);
  };

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const moveLayer = (direction: 'up' | 'down' | 'top' | 'bottom') => {
    commit();
    let newLayers = [...layers];
    const index = newLayers.findIndex(l => l.id === layer.id);
    if (index === -1) return;

    const [item] = newLayers.splice(index, 1);

    if (direction === 'up') {
      newLayers.splice(Math.min(index + 1, newLayers.length), 0, item);
    } else if (direction === 'down') {
      newLayers.splice(Math.max(index - 1, 0), 0, item);
    } else if (direction === 'top') {
      newLayers.push(item);
    } else if (direction === 'bottom') {
      newLayers.unshift(item);
    }

    // Reassign zIndex based on array order
    newLayers = newLayers.map((l, i) => ({ ...l, zIndex: i + 1 }));
    setLayers(newLayers);
    onClose();
  };

  return (
    <div 
      style={{
        ...styles.menuContainer,
        left: x,
        top: y,
      }}
      onMouseDown={(e) => e.stopPropagation()} // Prevent clicking inside from closing it immediately
    >
      <div style={styles.menuHeader}>
        <span style={styles.menuTitle}>{layer.name}</span>
        <span style={styles.menuType}>{layer.type}</span>
      </div>
      
      <button style={styles.menuItem} onClick={() => handleAction(() => {
        commit();
        duplicateLayer(layer.id);
      })}>
        <span style={styles.icon}>⎘</span> Duplicate
      </button>

      <button style={styles.menuItem} onClick={() => handleAction(() => {
        commit();
        removeLayer(layer.id);
      })}>
        <span style={{...styles.icon, color: '#F87171'}}>🗑</span> <span style={{color: '#F87171'}}>Delete</span>
      </button>

      <div style={styles.divider} />

      <button style={styles.menuItem} onClick={() => handleAction(() => moveLayer('up'))}>
        <span style={styles.icon}>⇧</span> Bring Forward
      </button>
      
      <button style={styles.menuItem} onClick={() => handleAction(() => moveLayer('down'))}>
        <span style={styles.icon}>⇩</span> Send Backward
      </button>

      <div style={styles.divider} />

      <button style={styles.menuItem} onClick={() => handleAction(() => toggleLock(layer.id))}>
        <span style={styles.icon}>{layer.lockProfile === 'fully-locked' ? '🔓' : '🔒'}</span> 
        {layer.lockProfile === 'fully-locked' ? 'Unlock' : 'Lock'}
      </button>

      <button style={styles.menuItem} onClick={() => handleAction(() => toggleVisibility(layer.id))}>
        <span style={styles.icon}>{layer.isVisible ? '🙈' : '👁'}</span> 
        {layer.isVisible ? 'Hide' : 'Show'}
      </button>

      {onOpenProperties && (
        <>
          <div style={styles.divider} />
          <button style={styles.menuItem} onClick={() => handleAction(() => onOpenProperties())}>
            <span style={styles.icon}>⚙</span> Advanced Properties
          </button>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  menuContainer: {
    position: 'fixed',
    backgroundColor: '#1E1E1E',
    border: '1px solid #333',
    borderRadius: 8,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    width: 200,
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
    padding: '6px 0',
  },
  menuHeader: {
    padding: '4px 12px 8px 12px',
    borderBottom: '1px solid #333',
    marginBottom: 4,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#E2E8F0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 120,
  },
  menuType: {
    fontSize: 10,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  menuItem: {
    padding: '8px 12px',
    background: 'transparent',
    border: 'none',
    color: '#CBD5E1',
    fontSize: 13,
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'background-color 0.1s',
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    margin: '4px 0',
  },
  icon: {
    width: 16,
    textAlign: 'center',
    fontSize: 14,
    color: '#94A3B8',
  }
};
