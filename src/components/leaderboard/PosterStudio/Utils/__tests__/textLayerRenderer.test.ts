import assert from 'node:assert/strict';
import test from 'node:test';
import type { LayerData } from '../../Stores/layerStore';
import { getTextLayerBackgroundRenderProps } from '../textLayerRenderer';

const textLayer: LayerData = {
  id: 'title',
  type: 'text',
  version: '1.0',
  name: 'Title',
  x: 24,
  y: 36,
  width: 120,
  height: 40,
  rotation: 15,
  scaleX: 1.2,
  scaleY: 0.8,
  isVisible: true,
  isLocked: false,
  lockProfile: 'editable',
  zIndex: 1,
  opacity: 0.7,
  backgroundFill: '#123456',
  backgroundOpacity: 0.5,
  cornerRadius: 50,
};

test('text background uses the layer geometry and combines opacity safely', () => {
  assert.deepEqual(getTextLayerBackgroundRenderProps(textLayer), {
    x: 24,
    y: 36,
    width: 120,
    height: 40,
    fill: '#123456',
    opacity: 0.35,
    rotation: 15,
    scaleX: 1.2,
    scaleY: 0.8,
    cornerRadius: 20,
    visible: true,
    listening: false,
  });
});

test('text background is omitted when absent or fully transparent', () => {
  assert.equal(getTextLayerBackgroundRenderProps({ ...textLayer, backgroundFill: undefined }), null);
  assert.equal(getTextLayerBackgroundRenderProps({ ...textLayer, backgroundOpacity: 0 }), null);
  assert.equal(getTextLayerBackgroundRenderProps({ ...textLayer, backgroundOpacity: -1 }), null);
});
