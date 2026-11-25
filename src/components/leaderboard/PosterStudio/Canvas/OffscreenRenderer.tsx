import React, { useEffect, useRef } from 'react';
import { Stage, Layer, Text, Image as KonvaImage, Rect } from 'react-konva';
import useImage from 'use-image';
import { useResolvedImageUrl } from '../../../../core/hooks/useResolvedImageUrl';
import { computeAutoShrinkFontSize, loadFont, ML_FONTS, EN_FONTS } from '../Utils/fontLoader';
import { resolveLayerText } from '../Utils/resolver';

function BackgroundImage({ src, width, height, transform }: { src: string; width: number; height: number; transform?: any }) {
  const [image] = useImage(src, 'anonymous');
  return image ? (
    <KonvaImage
      image={image}
      width={width}
      height={height}
      x={transform?.x ?? 0}
      y={transform?.y ?? 0}
      scaleX={transform?.scale ?? 1}
      scaleY={transform?.scale ?? 1}
    />
  ) : null;
}

export interface OffscreenRendererProps {
  layers: any[];
  variables: Record<string, string | undefined>;
  onReady: (captureFunc: (ratio?: number) => string) => void;
  width?: number;
  height?: number;
  backgroundUrl?: string;
  backgroundTransform?: any;
}

export default function OffscreenRenderer({
  layers,
  variables,
  onReady,
  width = 1080,
  height = 1080,
  backgroundUrl,
  backgroundTransform,
}: OffscreenRendererProps) {
  const stageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const resolvedBgUrl = useResolvedImageUrl(backgroundUrl);
  const [, bgStatus] = useImage(resolvedBgUrl || '', 'anonymous');

  useEffect(() => {
    let isMounted = true;

    // Wait for background URL resolution and image load if a background URL is configured
    if (backgroundUrl) {
      if (!resolvedBgUrl) {
        return; // still resolving r2:// presigned URL
      }
      if (bgStatus !== 'loaded') {
        if (bgStatus === 'failed') {
          console.warn('[OffscreenRenderer] BG image failed, continuing anyway');
        } else {
          return; // still loading
        }
      }
    }

    const run = async () => {
      if (!isMounted) return;

      // ── STEP 1: Collect all unique fonts used in this template ──
      const usedFamilies = Array.from(
        new Set(
          layers
            .filter((l) => l.type === 'text' && l.fontFamily)
            .map((l) => l.fontFamily as string)
        )
      );

      // ── STEP 2: Preload known fonts via loadFont() so stylesheets & FontFace are registered ──
      const knownFonts = [...ML_FONTS, ...EN_FONTS];
      await Promise.allSettled(
        usedFamilies.map((family) => {
          const def = knownFonts.find((f) => f.family === family);
          return def ? loadFont(def) : Promise.resolve('loaded');
        })
      );

      try { await document.fonts.ready; } catch (_) {}

      // ── STEP 3: Explicitly request each weight variant via document.fonts.load ──
      const weights = ['400', '700', '900', '300', '600', '800'];
      const fontLoadPromises = usedFamilies.flatMap((family) =>
        weights.map((w) =>
          document.fonts.load(`${w} 32px "${family}"`).catch(() => {})
        )
      );
      await Promise.allSettled(fontLoadPromises);

      // ── STEP 4: Force Konva stage redraw with loaded fonts ──
      if (isMounted && stageRef.current && layerRef.current) {
        layerRef.current.batchDraw();
      }

      // ── STEP 5: Wait for paint settle, then capture ──
      setTimeout(() => {
        if (!isMounted || !stageRef.current) return;

        if (layerRef.current) layerRef.current.batchDraw();

        const capture = (ratio?: number) => {
          const maxDim = Math.max(width, height, 1);
          const maxSafeRatio = 4096 / maxDim;
          const requestedRatio = ratio ?? Math.min(2, maxSafeRatio);
          const effectiveRatio = Math.max(0.25, Math.min(requestedRatio, maxSafeRatio));
          const dataUrl = stageRef.current.toDataURL({
            pixelRatio: effectiveRatio,
            mimeType: 'image/jpeg',
            quality: 0.95,
          });
          return dataUrl;
        };
        onReadyRef.current(capture);
      }, 450);
    };

    run();
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, variables, backgroundUrl, resolvedBgUrl, bgStatus, width, height]);

  const sortedLayers = [...layers].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  return (
    <div
      style={{
        position: 'absolute',
        left: '-99999px',
        top: '-99999px',
        opacity: 0,
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      <Stage width={width} height={height} ref={stageRef}>
        <Layer ref={layerRef}>
          {/* Base white canvas matching StudioCanvas */}
          <Rect width={width} height={height} fill="#FFFFFF" listening={false} />

          {/* Background image */}
          {resolvedBgUrl && (
            <BackgroundImage
              src={resolvedBgUrl}
              width={width}
              height={height}
              transform={backgroundTransform}
            />
          )}

          {/* Sorted Layers */}
          {sortedLayers.map((layer) => {
            if (layer.isVisible === false) return null;

            if (layer.type === 'background') {
              return (
                <BackgroundImage
                  key={layer.id}
                  src={layer.src}
                  width={width}
                  height={height}
                />
              );
            }

            if (layer.type === 'text') {
              const resolvedText = resolveLayerText(layer, variables);

              // Mirror exact fontStyle string used by StudioCanvas
              const weight = layer.fontWeight ? String(layer.fontWeight) : '600';
              const italic = String(layer.fontStyle || '').includes('italic');
              let konvaFontStyle = weight;
              if (italic) konvaFontStyle = `${weight} italic`;
              if (weight === '400' && !italic) konvaFontStyle = 'normal';

              const fontFamily = `"${layer.fontFamily || 'Poppins'}", "Noto Sans Malayalam", "Inter", sans-serif`;
              const baseFontSize = layer.fontSize || 24;
              const effectiveOverflow =
                layer.overflowMode ||
                (layer.dynamicBinding || layer.text?.includes('{') ? 'auto-shrink' : undefined);

              const displayFontSize =
                effectiveOverflow === 'auto-shrink' && layer.width
                  ? computeAutoShrinkFontSize({
                      text: resolvedText,
                      fontFamily,
                      baseFontSize,
                      fontWeight: layer.fontWeight || 600,
                      maxWidth: layer.width,
                      maxHeight: layer.height,
                      maxLines: layer.maxLines,
                      lineHeight: layer.lineHeight || 1.2,
                    })
                  : baseFontSize;

              return (
                <Text
                  key={layer.id}
                  x={layer.x}
                  y={layer.y}
                  width={layer.width || undefined}
                  height={layer.height || undefined}
                  text={resolvedText}
                  fontSize={displayFontSize}
                  fontFamily={fontFamily}
                  fontStyle={konvaFontStyle}
                  fill={layer.fill || '#000000'}
                  stroke={layer.stroke || undefined}
                  strokeWidth={layer.strokeWidth || 0}
                  shadowColor={layer.shadowColor || undefined}
                  shadowBlur={layer.shadowBlur || 0}
                  shadowOffsetX={layer.shadowOffsetX || 0}
                  shadowOffsetY={layer.shadowOffsetY || 0}
                  align={layer.align || 'left'}
                  verticalAlign={layer.verticalAlign || 'top'}
                  lineHeight={layer.lineHeight || 1.2}
                  letterSpacing={layer.letterSpacing || 0}
                  textDecoration={layer.textDecoration || ''}
                  wrap={effectiveOverflow === 'clip' ? 'none' : 'word'}
                  ellipsis={effectiveOverflow === 'ellipsis'}
                  opacity={layer.opacity ?? 1}
                  rotation={layer.rotation ?? 0}
                  scaleX={layer.scaleX ?? 1}
                  scaleY={layer.scaleY ?? 1}
                />
              );
            }

            return null;
          })}
        </Layer>
      </Stage>
    </div>
  );
}
