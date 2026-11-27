import type { LayerData } from '../Stores/layerStore';
import { computeAutoShrinkFontSize } from './fontLoader';
import { resolveLayerText } from './resolver';

export function getTextLayerBackgroundRenderProps(layer: LayerData) {
  const fill = layer.backgroundFill;
  const backgroundOpacity = Math.min(1, Math.max(0, layer.backgroundOpacity ?? 0));
  if (!fill || backgroundOpacity === 0 || layer.width <= 0 || layer.height <= 0) return null;

  return {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    fill,
    opacity: (layer.opacity ?? 1) * backgroundOpacity,
    rotation: layer.rotation || 0,
    scaleX: layer.scaleX || 1,
    scaleY: layer.scaleY || 1,
    cornerRadius: Math.min(Math.max(0, layer.cornerRadius || 0), layer.width / 2, layer.height / 2),
    visible: layer.isVisible !== false,
    listening: false,
  };
}

export function getTextLayerRenderProps(
  layer: LayerData,
  variables: Record<string, string | undefined>,
  fontsReady: boolean,
) {
  const text = resolveLayerText(layer, variables);
  const baseFontSize = layer.fontSize || 24;
  const overflowMode = layer.overflowMode || (layer.dynamicBinding || layer.text?.includes('{') ? 'auto-shrink' : undefined);
  const fontFamily = `"${layer.fontFamily || 'Poppins'}", "Noto Sans Malayalam", "Inter", sans-serif`;
  const fontSize = overflowMode === 'auto-shrink' && layer.width && fontsReady
    ? computeAutoShrinkFontSize({
        text,
        fontFamily,
        baseFontSize,
        fontWeight: layer.fontWeight || 600,
        maxWidth: layer.width,
        maxHeight: layer.height,
        maxLines: layer.maxLines,
        lineHeight: layer.lineHeight || 1.2,
      })
    : baseFontSize;

  return {
    text,
    width: layer.width || undefined,
    height: layer.height || undefined,
    fontSize,
    fontFamily,
    fontStyle: `${layer.fontWeight || 600} ${layer.fontStyle || 'normal'}`,
    textDecoration: layer.textDecoration || '',
    fill: layer.fill || '#000000',
    stroke: layer.stroke || undefined,
    strokeWidth: layer.strokeWidth || 0,
    shadowColor: layer.shadowColor || undefined,
    shadowBlur: layer.shadowBlur || 0,
    shadowOffsetX: layer.shadowOffsetX || 0,
    shadowOffsetY: layer.shadowOffsetY || 0,
    align: layer.align || 'left',
    lineHeight: layer.lineHeight || 1.2,
    letterSpacing: layer.letterSpacing || 0,
    wrap: overflowMode === 'clip' ? 'none' as const : 'word' as const,
    ellipsis: overflowMode === 'ellipsis',
    rotation: layer.rotation || 0,
    scaleX: layer.scaleX || 1,
    scaleY: layer.scaleY || 1,
    opacity: layer.opacity ?? 1,
    visible: layer.isVisible !== false,
  };
}
