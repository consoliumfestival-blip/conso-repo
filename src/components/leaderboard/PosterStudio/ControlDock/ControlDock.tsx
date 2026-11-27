import { coreColor } from '@/constants/coreTheme';
import React from 'react';
import { useLayerStore } from '../Stores/layerStore';
import { useTemplateStore } from '../Stores/templateStore';
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
  mobile?: boolean;
}

export default function ControlDock({ 
  activePanel, onClose, festivalId, tenantId, currentTemplateId, setCurrentTemplateId, setShowCreateModal, mobile = false
}: ControlDockProps) {
  const { selectedIds, layers } = useLayerStore();
  const { variables } = useTemplateStore();
  const selectedLayer = selectedIds.length === 1 ? layers.find(l => l.id === selectedIds[0]) : null;
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!mobile || typeof document === 'undefined') return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => previousFocus?.focus();
  }, [mobile]);

  // If no panel is explicitly open via tool rail, and a layer is selected, 
  // we could potentially auto-open properties. But the user said:
  // "If the user intentionally closes the dock, selecting another layer must NOT automatically reopen it."
  // So the parent should manage `isDockOpen`.
  // We'll just render whatever `activePanel` tells us to.
  // We will build out the contents in subsequent phases.

  if (!activePanel) return null;

  return (
    <div
      style={{ ...styles.dockContainer, ...(mobile ? styles.mobileDockContainer : {}) }}
      role={mobile ? 'dialog' : undefined}
      aria-modal={mobile ? false : undefined}
      aria-labelledby={mobile ? 'poster-studio-mobile-panel-title' : undefined}
    >
      <div style={styles.dockHeader}>
        <h3 id={mobile ? 'poster-studio-mobile-panel-title' : undefined} style={styles.dockTitle}>{getPanelTitle(activePanel)}</h3>
        <button ref={closeButtonRef} onClick={onClose} style={styles.closeBtn} title="Close Panel" aria-label="Close panel">×</button>
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
                  fontSize: 32, fontFamily: "Outfit_400Regular", fontWeight: 600, fill: '#000000', align: 'left', lineHeight: 1.2, letterSpacing: 0,
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
            {selectedLayer.type === 'text' && <VariableBindingPanel variables={variables} />}
          </div>
        )}

        {activePanel === 'properties' && !selectedLayer && (
          <div style={{ padding: 16, color: coreColor('#94A3B8', 'textSubtle'), fontSize: 13 }}>
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
          <AssetsPanel festivalId={festivalId} tenantId={tenantId} />
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
    backgroundColor: coreColor('#171717', 'surfaceStrong'),
    borderLeft: `1px solid ${coreColor('#2a2a2a', 'border')}`,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 30,
  },
  dockHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: `1px solid ${coreColor('#2a2a2a', 'border')}`,
  },
  dockTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: coreColor('#E2E8F0', 'text'),
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: coreColor('#94A3B8', 'textSubtle'),
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
  mobileDockContainer: {
    width: '100%',
    height: '100%',
    minHeight: 0,
    borderLeft: 'none',
    border: '1px solid var(--ps-border)',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: 'var(--ps-shadow)',
  },
  ctaBtn: { 
    padding: '12px 28px', 
    borderRadius: 6, 
    border: 'none', 
    backgroundColor: coreColor('#0F766E', 'primary'),
    color: coreColor('#FFFFFF', 'onPrimary'),
    fontSize: 14, 
    fontWeight: 700, 
    cursor: 'pointer', 
    width: '100%' 
  }
};
