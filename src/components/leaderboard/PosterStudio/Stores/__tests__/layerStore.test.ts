import assert from 'node:assert/strict';
import test from 'node:test';
import { useLayerStore, type LayerData } from '../layerStore';
import { getLayerGroupIssues, getRenderableLayers } from '../../Utils/layerTree';

const textLayer = (id: string, x: number, zIndex: number): LayerData => ({
  id,
  type: 'text',
  version: '1.0',
  name: id,
  x,
  y: 20,
  width: 100,
  height: 32,
  fontSize: 10,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  isVisible: true,
  isLocked: false,
  lockProfile: 'editable',
  zIndex,
  opacity: 1,
});

test('group and ungroup preserve child objects, IDs, transforms and z-order', () => {
  const first = textLayer('first', 12, 2);
  const second = textLayer('second', 154, 5);
  useLayerStore.setState({ layers: [first, second], selectedIds: ['first', 'second'] });

  useLayerStore.getState().groupSelected();
  const grouped = useLayerStore.getState();
  const group = grouped.layers.find((layer) => layer.type === 'group');
  assert.ok(group);
  assert.deepEqual(group.children, ['first', 'second']);
  assert.deepEqual(grouped.layers.filter((layer) => layer.type !== 'group'), [first, second]);
  assert.deepEqual(getRenderableLayers(grouped.layers).map((layer) => layer.id), ['first', 'second']);
  assert.deepEqual(getLayerGroupIssues(grouped.layers), []);

  useLayerStore.getState().ungroupLayer(group.id);
  const ungrouped = useLayerStore.getState().layers;
  assert.deepEqual(ungrouped, [first, second]);
});

test('reports old groups whose child data is missing instead of inventing layers', () => {
  const group: LayerData = {
    id: 'old-group', type: 'group', version: '1.0', name: 'Old group', x: 0, y: 0, width: 100, height: 100,
    rotation: 0, scaleX: 1, scaleY: 1, isVisible: true, isLocked: false,
    lockProfile: 'editable', zIndex: 1, opacity: 1, children: ['missing-child'],
  };
  assert.deepEqual(getLayerGroupIssues([group]), [{
    groupId: 'old-group', groupName: 'Old group', missingLayerIds: ['missing-child'],
  }]);
  assert.deepEqual(getRenderableLayers([group]), []);
});

test('group visibility, opacity and lock apply once to existing children', () => {
  const child = textLayer('child', 10, 2);
  const group: LayerData = {
    id: 'group', type: 'group', version: '1.0', name: 'Group', x: 0, y: 0, width: 100, height: 100,
    rotation: 0, scaleX: 1, scaleY: 1, isVisible: false, isLocked: true,
    lockProfile: 'fully-locked', zIndex: 1, opacity: 0.5, children: ['child'],
  };
  const renderable = getRenderableLayers([child, group]);
  assert.equal(renderable.length, 1);
  assert.equal(renderable[0].id, 'child');
  assert.equal(renderable[0].isVisible, false);
  assert.equal(renderable[0].isLocked, true);
  assert.equal(renderable[0].opacity, 0.5);
});

test('group transform moves and scales existing children without replacing IDs', () => {
  const first = textLayer('first', 12, 2);
  const second = textLayer('second', 154, 5);
  useLayerStore.setState({ layers: [first, second], selectedIds: ['first', 'second'] });
  useLayerStore.getState().groupSelected();
  const group = useLayerStore.getState().layers.find((layer) => layer.type === 'group');
  assert.ok(group);

  useLayerStore.getState().transformGroup(group.id, { x: 20, y: 30, width: 284, height: 64 });
  const transformed = useLayerStore.getState();
  const movedFirst = transformed.layers.find((layer) => layer.id === 'first');
  const movedSecond = transformed.layers.find((layer) => layer.id === 'second');
  const expectedScaleX = 284 / 242;
  assert.deepEqual({ x: movedFirst?.x, y: movedFirst?.y, width: movedFirst?.width, height: movedFirst?.height, fontSize: movedFirst?.fontSize }, {
    x: 20, y: 30, width: 100 * expectedScaleX, height: 64, fontSize: 10 * expectedScaleX,
  });
  assert.equal(movedSecond?.id, 'second');
  assert.equal(movedSecond?.x, 20 + 142 * expectedScaleX);
  assert.equal(transformed.layers.find((layer) => layer.id === group.id)?.width, 284);
});

test('deleting a grouped child removes its stale group reference', () => {
  const first = textLayer('first', 12, 2);
  const second = textLayer('second', 154, 5);
  useLayerStore.setState({ layers: [first, second], selectedIds: ['first', 'second'] });
  useLayerStore.getState().groupSelected();
  const group = useLayerStore.getState().layers.find((layer) => layer.type === 'group');
  assert.ok(group);

  useLayerStore.getState().removeLayer('first');

  const state = useLayerStore.getState();
  assert.deepEqual(state.layers.find((layer) => layer.id === group.id)?.children, ['second']);
  assert.deepEqual(getLayerGroupIssues(state.layers), []);
  assert.deepEqual(state.selectedIds, [group.id]);
});

test('deleting the last child removes its now-empty group', () => {
  const first = textLayer('first', 12, 2);
  const second = textLayer('second', 154, 5);
  useLayerStore.setState({ layers: [first, second], selectedIds: ['first', 'second'] });
  useLayerStore.getState().groupSelected();
  const group = useLayerStore.getState().layers.find((layer) => layer.type === 'group');
  assert.ok(group);

  useLayerStore.getState().removeLayer('first');
  useLayerStore.getState().removeLayer('second');

  const state = useLayerStore.getState();
  assert.equal(state.layers.some((layer) => layer.id === group.id), false);
  assert.deepEqual(getLayerGroupIssues(state.layers), []);
});
