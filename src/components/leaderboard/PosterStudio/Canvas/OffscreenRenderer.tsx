import React, { useEffect, useRef } from 'react';
import { Stage, Layer, Text, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';

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
  onReady: (captureFunc: () => string) => void;
  width?: number;
  height?: number;
  backgroundUrl?: string;
  backgroundTransform?: any;
}

const resolveVariables = (text: string, vars: Record<string, string | undefined>) => {
  return text.replace(/\{([^}]+)\}/g, (_match, key) => {
    const val = vars[key];
    return val !== undefined && val !== null ? val : '';
  });
};

import { useResolvedImageUrl } from '../../../../core/hooks/useResolvedImageUrl';

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
  const [bgImage, bgStatus] = useImage(resolvedBgUrl || '', 'anonymous');

  useEffect(() => {
    let isMounted = true;

    // Wait for background image (using the original backgroundUrl for presence check, but waiting on status)
    if (backgroundUrl && bgStatus !== 'loaded') {
      if (bgStatus === 'failed') {
        console.warn('[OffscreenRenderer] BG image failed, continuing anyway');
      } else {
        return; // still loading
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

      console.info('[OffscreenRenderer] Loading fonts:', usedFamilies);

      // ── STEP 2: Wait for document.fonts.ready (fonts editor already loaded) ──
      try { await document.fonts.ready; } catch (_) {}

      // ── STEP 3: Explicitly request each weight variant via document.fonts.load ──
      // This is instant for already-cached fonts (editor already loaded them)
      const weights = ['400', '700', '900', '300', '600', '800'];
      const fontLoadPromises = usedFamilies.flatMap((family) =>
        weights.map((w) =>
          document.fonts.load(`${w} 32px "${family}"`).catch(() => {})
        )
      );
      await Promise.allSettled(fontLoadPromises);
      console.info('[OffscreenRenderer] Font loading complete for:', usedFamilies);

      // ── STEP 5: Force Konva stage redraw with loaded fonts ──
      if (isMounted && stageRef.current && layerRef.current) {
        layerRef.current.batchDraw();
      }

      // ── STEP 6: Wait for paint settle, then capture ──
      setTimeout(() => {
        if (!isMounted || !stageRef.current) return;

        // Force another redraw right before capture
        if (layerRef.current) layerRef.current.batchDraw();

        console.info('[OffscreenRenderer] All fonts ready — capturing stage');
        const capture = () => {
          const dataUrl = stageRef.current.toDataURL({
            pixelRatio: 4,
            mimeType: 'image/jpeg',
            quality: 0.95,
          });
          console.info('[OffscreenRenderer] Captured dataURL length:', dataUrl?.length ?? 0);
          return dataUrl;
        };
        onReadyRef.current(capture);
      }, 800); // short settle after batchDraw
    };

    run();
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, variables, backgroundUrl, bgStatus]);

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
          {/* Background image */}
          {backgroundUrl && (
            <BackgroundImage
              src={resolvedBgUrl || ''}
              width={width}
              height={height}
              transform={backgroundTransform}
            />
          )}

          {/* Layers */}
          {layers.map((layer) => {
            if (!layer.isVisible && layer.isVisible !== undefined) return null;

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
              const resolvedText = resolveVariables(layer.text || '', variables);

              // Mirror exact fontStyle string used by StudioCanvas
              const weight = layer.fontWeight ? String(layer.fontWeight) : '400';
              const italic = String(layer.fontStyle || '').includes('italic');
              let konvaFontStyle = weight;
              if (italic) konvaFontStyle = `${weight} italic`;
              if (weight === '400' && !italic) konvaFontStyle = 'normal';

              // Mirror exact fontFamily fallback chain used by StudioCanvas
              const fontFamily = `"${layer.fontFamily || 'Poppins'}", "Noto Sans Malayalam", "Inter", sans-serif`;

              return (
                <Text
                  key={layer.id}
                  x={layer.x}
                  y={layer.y}
                  width={layer.width}
                  height={layer.height}
                  text={resolvedText}
                  fontSize={layer.fontSize || 24}
                  fontFamily={fontFamily}
                  fontStyle={konvaFontStyle}
                  fill={layer.fill || '#000000'}
                  align={layer.align || 'left'}
                  verticalAlign={layer.verticalAlign || 'top'}
                  lineHeight={layer.lineHeight || 1.2}
                  letterSpacing={layer.letterSpacing || 0}
                  textDecoration={layer.textDecoration || ''}
                  opacity={layer.opacity ?? 1}
                  rotation={layer.rotation ?? 0}
                  scaleX={layer.scaleX ?? 1}
                  scaleY={layer.scaleY ?? 1}
                  wrap="word"
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
