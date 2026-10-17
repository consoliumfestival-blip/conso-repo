import { useEffect, useCallback } from 'react';
import { useLayerStore } from '../Stores/layerStore';
import { useHistoryStore } from '../Stores/historyStore';
import { useClipboardStore } from '../Stores/clipboardStore';
import { useCanvasStore } from '../Stores/canvasStore';
import { useTemplateStore } from '../Stores/templateStore';

function isEditorFocused(): boolean {
  const tag = document.activeElement?.tagName;
  const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
  return tag === 'INPUT' || tag === 'TEXTAREA' || isEditable;
}

export function useClipboard() {
  const { layers, selectedIds, removeLayer, addLayer, duplicateLayer } = useLayerStore();
  const { copy, cut, copiedLayers, isCut } = useClipboardStore();

  const copySelected = useCallback(() => {
    const selected = layers.filter((l) => selectedIds.includes(l.id));
    if (selected.length > 0) copy(selected);
  }, [layers, selectedIds, copy]);

  const cutSelected = useCallback(() => {
    const selected = layers.filter((l) => selectedIds.includes(l.id) && l.lockProfile !== 'fully-locked');
    if (selected.length > 0) cut(selected);
  }, [layers, selectedIds, cut]);

  const paste = useCallback(
    (inPlace = false) => {
      if (!copiedLayers) return;
      const timestamp = Date.now();
      copiedLayers.forEach((l, i) => {
        const newLayer = {
          ...l,
          id: `layer_${timestamp}_${i}`,
          x: inPlace ? l.x : l.x + 16,
          y: inPlace ? l.y : l.y + 16,
          name: `${l.name} (paste)`,
          zIndex: Math.max(...layers.map((ll) => ll.zIndex), 0) + i + 1,
        };
        addLayer(newLayer);
      });
    },
    [copiedLayers, layers, addLayer]
  );

  return { copySelected, cutSelected, paste };
}

// ---- Keyboard Shortcuts Hook ----
export function useKeyboardShortcuts() {
  const historyStore = useHistoryStore();
  const { layers, selectedIds, removeLayer, duplicateLayer, toggleLock, toggleVisibility, clearSelection, setSelectedIds, groupSelected, ungroupLayer } = useLayerStore();
  const canvasStore = useCanvasStore();
  const { copySelected, cutSelected, paste } = useClipboard();
  const { saveDraft } = useTemplateStore();

  const nudge = useCallback(
    (dx: number, dy: number) => {
      selectedIds.forEach((id) => {
        const layer = layers.find((l) => l.id === id);
        if (layer && layer.lockProfile !== 'fully-locked' && layer.lockProfile !== 'semi-locked') {
          const { updateLayer } = useLayerStore.getState();
          updateLayer(id, { x: layer.x + dx, y: layer.y + dy });
        }
      });
    },
    [selectedIds, layers]
  );

  const handler = useCallback(
    (e: KeyboardEvent) => {
      if (isEditorFocused()) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key = e.key;

      if (ctrl && key === 'z' && !shift) { e.preventDefault(); const prev = historyStore.undo(layers); if (prev) useLayerStore.getState().setLayers(prev); return; }
      if ((ctrl && key === 'y') || (ctrl && shift && key === 'z')) { e.preventDefault(); const next = historyStore.redo(layers); if (next) useLayerStore.getState().setLayers(next); return; }
      if (ctrl && key === 'c') { e.preventDefault(); copySelected(); return; }
      if (ctrl && key === 'x') { e.preventDefault(); cutSelected(); selectedIds.filter((id) => layers.find((l) => l.id === id)?.lockProfile !== 'fully-locked').forEach(removeLayer); return; }
      if (ctrl && key === 'v' && !shift) { e.preventDefault(); paste(false); return; }
      if (ctrl && shift && key === 'V') { e.preventDefault(); paste(true); return; }
      if (ctrl && key === 'd') { e.preventDefault(); historyStore.push(layers); selectedIds.forEach(duplicateLayer); return; }
      if (ctrl && key === 'g' && !shift) { e.preventDefault(); historyStore.push(layers); groupSelected(); return; }
      if (ctrl && shift && key === 'G') { e.preventDefault(); if (selectedIds.length === 1) { historyStore.push(layers); ungroupLayer(selectedIds[0]); } return; }
      if (ctrl && key === 'l') { e.preventDefault(); selectedIds.forEach(toggleLock); return; }
      if (ctrl && key === 'h') { e.preventDefault(); selectedIds.forEach(toggleVisibility); return; }
      if (ctrl && key === '=') { e.preventDefault(); canvasStore.setZoom(canvasStore.zoomLevel + 0.1); return; }
      if (ctrl && key === '-') { e.preventDefault(); canvasStore.setZoom(canvasStore.zoomLevel - 0.1); return; }
      if (ctrl && key === '0') { e.preventDefault(); canvasStore.fitToViewport(); return; }
      if (ctrl && key === 's') { e.preventDefault(); saveDraft(); return; }
      if (key === '?') { e.preventDefault(); window.dispatchEvent(new Event('poster-studio:show-shortcuts')); return; }
      if (key === 'Delete' || key === 'Backspace') { e.preventDefault(); historyStore.push(layers); selectedIds.filter((id) => layers.find((l) => l.id === id)?.lockProfile !== 'fully-locked').forEach(removeLayer); return; }
      if (key === 'Escape') { clearSelection(); return; }

      // Arrow nudge
      const step = shift ? 10 : 1;
      if (key === 'ArrowUp') { e.preventDefault(); nudge(0, -step); }
      if (key === 'ArrowDown') { e.preventDefault(); nudge(0, step); }
      if (key === 'ArrowLeft') { e.preventDefault(); nudge(-step, 0); }
      if (key === 'ArrowRight') { e.preventDefault(); nudge(step, 0); }
    },
    [layers, selectedIds, historyStore, copySelected, cutSelected, paste, duplicateLayer, removeLayer, groupSelected, ungroupLayer, toggleLock, toggleVisibility, clearSelection, canvasStore, saveDraft, nudge]
  );

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}
