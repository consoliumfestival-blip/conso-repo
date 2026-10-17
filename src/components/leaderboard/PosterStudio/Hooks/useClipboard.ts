import { useCallback } from 'react';
import { useClipboardStore } from '../Stores/clipboardStore';
import { LayerData, useLayerStore } from '../Stores/layerStore';

function cloneLayer(layer: LayerData, index: number, inPlace: boolean, zIndex: number): LayerData {
  return {
    ...JSON.parse(JSON.stringify(layer)),
    id: `layer_${Date.now()}_${index}_${Math.random().toString(36).slice(2)}`,
    x: inPlace ? layer.x : layer.x + 16,
    y: inPlace ? layer.y : layer.y + 16,
    name: `${layer.name} (paste)`,
    zIndex,
  };
}

export function useClipboard() {
  const { layers, selectedIds, addLayer, removeLayer, setSelectedIds } = useLayerStore();
  const { copiedLayers, isCut, copy, cut, clear } = useClipboardStore();

  const getEditableSelection = useCallback(
    () => layers.filter((layer) => selectedIds.includes(layer.id) && layer.lockProfile !== 'fully-locked'),
    [layers, selectedIds]
  );

  const copySelected = useCallback(() => {
    const selected = getEditableSelection();
    if (selected.length > 0) copy(selected);
  }, [copy, getEditableSelection]);

  const cutSelected = useCallback(() => {
    const selected = getEditableSelection();
    if (selected.length === 0) return;
    cut(selected);
    selected.forEach((layer) => removeLayer(layer.id));
  }, [cut, getEditableSelection, removeLayer]);

  const paste = useCallback(
    (inPlace = false) => {
      if (!copiedLayers?.length) return;
      const baseZ = Math.max(...layers.map((layer) => layer.zIndex), 0);
      const clones = copiedLayers.map((layer, index) => cloneLayer(layer, index, inPlace, baseZ + index + 1));
      clones.forEach(addLayer);
      setSelectedIds(clones.map((layer) => layer.id));
      if (isCut) clear();
    },
    [addLayer, clear, copiedLayers, isCut, layers, setSelectedIds]
  );

  return { copySelected, cutSelected, paste };
}
