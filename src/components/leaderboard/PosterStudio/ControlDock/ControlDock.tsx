import React from 'react';
import { useLayerStore } from '../Stores/layerStore';
import TransformBlock from '../Properties/TransformBlock';
import TypographyBlock from '../Properties/TypographyBlock';
import EffectsBlock from '../Properties/EffectsBlock';
import VariableBindingPanel from '../Variables/VariableBindingPanel';
import LayersPanel from '../Layers/LayersPanel';
import BackgroundBlock from '../Properties/BackgroundBlock';
import PublishedResultsPanel from '../Results/PublishedResultsPanel';
import TemplatesPanel from '../Templates/TemplatesPanel';
import AssetsPanel from '../Assets/AssetsPanel';

interface ControlDockProps {
  activePanel: 'templates' | 'text' | 'assets' | 'layers' | 'background' | 'results' | 'properties' | null;
  onClose: () => void;
  festivalId: string;
  tenantId: string;
  currentTemplateId: string;
  setCurrentTemplateId: (id: string) => void;
  setShowCreateModal: (show: boolean) => void;
}

export default function ControlDock({ 
  activePanel, onClose, festivalId, tenantId, currentTemplateId, setCurrentTemplateId, setShowCreateModal 
}: ControlDockProps) {
  const { selectedIds, layers } = useLayerStore();
  const selectedLayer = selectedIds.length === 1 ? layers.find(l => l.id === selectedIds[0]) : null;

  // If no panel is explicitly open via tool rail, and a layer is selected, 
  // we could potentially auto-open properties. But the user said:
  // "If the user intentionally closes the dock, selecting another layer must NOT automatically reopen it."
  // So the parent should manage `isDockOpen`.
  // We'll just render whatever `activePanel` tells us to.
  // We will build out the contents in subsequent phases.

  if (!activePanel) return null;

  return (
    <div style={styles.dockContainer}>
      <div style={styles.dockHeader}>
        <h3 style={styles.dockTitle}>{getPanelTitle(activePanel)}</h3>
        <button onClick={onClose} style={styles.closeBtn} title="Close Panel">×</button>
      </div>
      <div style={styles.dockContent}>
        {activePanel === 'text' && (
          <div style={{ padding: 16 }}>
            <button 
              onClick={() => {
                const { addLayer, layers: ls } = useLayerStore.getState();
                // Add text layer logic (simplified for now, full logic from index.tsx should be moved or called here)
                const newId = `layer_text_${Date.now()}`;
                addLayer({
                  id: newId, type: 'text', version: '1.0', name: 'New Text', text: 'New Text',
                  x: 540 - 100, y: 540 - 20, width: 200, height: 40, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
                  fontSize: 32, fontFamily: 'Poppins', fontWeight: 600, fill: '#000000', align: 'left', lineHeight: 1.2, letterSpacing: 0,
                  zIndex: ls.length > 0 ? Math.max(...ls.map(l => l.zIndex)) + 1 : 1, isVisible: true, isLocked: false, lockProfile: 'editable',
                });
                useLayerStore.getState().setSelectedIds([newId]);
              }} 
              style={styles.ctaBtn}
            >
              + Add a text box
            </button>
          </div>
        )}

        {activePanel === 'properties' && selectedLayer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {selectedLayer.type === 'text' && <TypographyBlock layer={selectedLayer} />}
            <TransformBlock layer={selectedLayer} />
            <EffectsBlock layer={selectedLayer} />
            {selectedLayer.type === 'text' && <VariableBindingPanel />}
          </div>
        )}

        {activePanel === 'properties' && !selectedLayer && (
          <div style={{ padding: 16, color: '#94A3B8', fontSize: 13 }}>
            Select an object on the canvas to view its properties.
          </div>
        )}

        {activePanel === 'layers' && <LayersPanel />}

        {activePanel === 'background' && (
          <div style={{ padding: 16 }}>
            <BackgroundBlock festivalId={festivalId} tenantId={tenantId} />
          </div>
        )}

        {activePanel === 'results' && (
          <PublishedResultsPanel festivalId={festivalId} tenantId={tenantId} />
        )}

        {activePanel === 'templates' && (
          <TemplatesPanel 
            festivalId={festivalId} 
            currentTemplateId={currentTemplateId} 
            onSelectTemplate={setCurrentTemplateId} 
            onCreateNew={() => setShowCreateModal(true)} 
          />
        )}

        {activePanel === 'assets' && (
          <AssetsPanel />
        )}
      </div>
    </div>
  );
}

function getPanelTitle(panel: string) {
  switch (panel) {
    case 'templates': return 'Templates';
    case 'text': return 'Text';
    case 'assets': return 'Elements & Assets';
    case 'layers': return 'Layers';
    case 'background': return 'Background';
    case 'results': return 'Results';
    case 'properties': return 'Properties';
    default: return 'Settings';
  }
}

const styles: Record<string, React.CSSProperties> = {
  dockContainer: {
    width: 340,
    flexShrink: 0,
    backgroundColor: '#171717',
    borderLeft: '1px solid #2a2a2a',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 30,
  },
  dockHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #2a2a2a',
  },
  dockTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#E2E8F0',
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#94A3B8',
    fontSize: 20,
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  dockContent: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  ctaBtn: { 
    padding: '12px 28px', 
    borderRadius: 6, 
    border: 'none', 
    backgroundColor: '#0F766E', 
    color: '#FFFFFF', 
    fontSize: 14, 
    fontWeight: 700, 
    cursor: 'pointer', 
    width: '100%' 
  }
};
