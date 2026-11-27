import type { LayerData } from '../Stores/layerStore';

export interface MissingGroupChildrenIssue {
  groupId: string;
  groupName: string;
  missingLayerIds: string[];
}

export function getGroupChildren(group: LayerData, layers: readonly LayerData[]): LayerData[] {
  if (group.type !== 'group') return [];
  const byId = new Map(layers.filter((layer) => layer.type !== 'group').map((layer) => [layer.id, layer]));
  return (group.children || []).flatMap((id) => {
    const child = byId.get(id);
    return child ? [child] : [];
  });
}

export function getLayerGroupIssues(layers: readonly LayerData[]): MissingGroupChildrenIssue[] {
  return layers
    .filter((layer) => layer.type === 'group')
    .flatMap((group) => {
      const found = new Set(getGroupChildren(group, layers).map((child) => child.id));
      const missingLayerIds = (group.children || []).filter((id) => !found.has(id));
      return missingLayerIds.length > 0
        ? [{ groupId: group.id, groupName: group.name, missingLayerIds }]
        : [];
    });
}

/** Resolve group visibility, opacity and locking without duplicating child nodes. */
export function getRenderableLayers(layers: readonly LayerData[]): LayerData[] {
  const parentGroups = new Map<string, LayerData[]>();
  for (const group of layers) {
    if (group.type !== 'group') continue;
    for (const childId of group.children || []) {
      const parents = parentGroups.get(childId) || [];
      parents.push(group);
      parentGroups.set(childId, parents);
    }
  }

  return layers
    .filter((layer) => layer.type !== 'group')
    .map((layer) => {
      const groups = parentGroups.get(layer.id) || [];
      if (groups.length === 0) return layer;
      return {
        ...layer,
        isVisible: layer.isVisible !== false && groups.every((group) => group.isVisible !== false),
        isLocked: layer.isLocked === true || groups.some((group) => group.isLocked || group.lockProfile !== 'editable'),
        lockProfile: groups.some((group) => group.lockProfile === 'fully-locked') ? 'fully-locked' : layer.lockProfile,
        opacity: (layer.opacity ?? 1) * groups.reduce((opacity, group) => opacity * (group.opacity ?? 1), 1),
      };
    })
    .sort((a, b) => a.zIndex - b.zIndex);
}

export function getGroupBounds(group: LayerData, layers: readonly LayerData[]) {
  const children = getGroupChildren(group, layers);
  if (children.length === 0) return null;
  const x = Math.min(...children.map((child) => child.x));
  const y = Math.min(...children.map((child) => child.y));
  const right = Math.max(...children.map((child) => child.x + child.width));
  const bottom = Math.max(...children.map((child) => child.y + child.height));
  return { x, y, width: right - x, height: bottom - y };
}
