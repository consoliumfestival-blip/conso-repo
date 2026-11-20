export interface HierarchyNode {
  id: string;
  name: string;
  org_type: string;
  parent_id: string | null;
}

export interface HierarchyRow<T extends HierarchyNode> {
  item: T;
  depth: number;
  path: string;
  contextOnly: boolean;
}

/** Build a parent-first, scoped list while keeping ancestors of filtered matches visible. */
export function buildHierarchyRows<T extends HierarchyNode>(
  items: T[],
  options: { query?: string; type?: string; rootId?: string | null; searchText?: (item: T) => string; include?: (item: T) => boolean } = {},
): HierarchyRow<T>[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const children = new Map<string, T[]>();
  for (const item of items) {
    if (item.parent_id && byId.has(item.parent_id)) {
      const list = children.get(item.parent_id) ?? [];
      list.push(item);
      children.set(item.parent_id, list);
    }
  }
  for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const scoped = new Set<string>();
  const addDescendants = (id: string, trail = new Set<string>()) => {
    if (trail.has(id) || scoped.has(id)) return;
    const item = byId.get(id);
    if (!item) return;
    scoped.add(id);
    const nextTrail = new Set(trail).add(id);
    for (const child of children.get(id) ?? []) addDescendants(child.id, nextTrail);
  };
  if (options.rootId && byId.has(options.rootId)) addDescendants(options.rootId);
  else for (const item of items) scoped.add(item.id);

  const q = options.query?.trim().toLocaleLowerCase() ?? '';
  const matched = new Set<string>();
  for (const item of items) {
    if (!scoped.has(item.id)) continue;
    const text = `${item.name} ${item.org_type} ${options.searchText?.(item) ?? ''}`.toLocaleLowerCase();
    if ((!q || text.includes(q)) && (!options.type || item.org_type === options.type) && (options.include?.(item) ?? true)) matched.add(item.id);
  }

  const visible = new Set(matched);
  for (const id of matched) {
    let parentId = byId.get(id)?.parent_id ?? null;
    const seen = new Set<string>([id]);
    while (parentId && scoped.has(parentId) && !seen.has(parentId)) {
      visible.add(parentId);
      seen.add(parentId);
      parentId = byId.get(parentId)?.parent_id ?? null;
    }
  }

  const roots = options.rootId && byId.has(options.rootId)
    ? [byId.get(options.rootId)!]
    : items.filter((item) => !item.parent_id || !scoped.has(item.parent_id));
  roots.sort((a, b) => a.name.localeCompare(b.name));

  const rows: HierarchyRow<T>[] = [];
  const visited = new Set<string>();
  const visit = (item: T, depth: number, parentPath: string) => {
    if (visited.has(item.id) || !scoped.has(item.id) || !visible.has(item.id)) return;
    visited.add(item.id);
    const path = parentPath ? `${parentPath} › ${item.name}` : item.name;
    rows.push({ item, depth, path, contextOnly: !matched.has(item.id) });
    for (const child of children.get(item.id) ?? []) visit(child, depth + 1, path);
  };
  for (const root of roots) visit(root, 0, '');

  // Keep malformed legacy/cyclic records visible instead of silently dropping them.
  for (const item of items) if (scoped.has(item.id) && visible.has(item.id) && !visited.has(item.id)) visit(item, 0, '');
  return rows;
}

export function getHierarchyRoots<T extends HierarchyNode>(items: T[]): T[] {
  const ids = new Set(items.map((item) => item.id));
  return items.filter((item) => !item.parent_id || !ids.has(item.parent_id)).sort((a, b) => a.name.localeCompare(b.name));
}
