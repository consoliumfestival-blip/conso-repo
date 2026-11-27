import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Group, Text, Image as KonvaImage, Rect } from 'react-konva';
import useImage from 'use-image';
import { resolveImageUrl } from '../../../../core/hooks/useResolvedImageUrl';
import { storageService } from '../../../../services/storage/storageService';
import { loadFont, ML_FONTS, EN_FONTS } from '../Utils/fontLoader';
import { resolveLayerText } from '../Utils/resolver';
import { getTextLayerBackgroundRenderProps, getTextLayerRenderProps } from '../Utils/textLayerRenderer';
import { getLayerGroupIssues, getRenderableLayers } from '../Utils/layerTree';
import type { LayerData } from '../Stores/layerStore';
import type { PosterAssetReference } from '../Database/posterDesignSnapshot';
import { EditableVisualNode } from './EditableVisualNode';

const READINESS_TIMEOUT_MS = 30_000;

type AssetStatus = 'loading' | 'loaded' | 'failed';
type RenderStatus = 'preparing' | 'ready' | 'error';

interface AssetSpec {
  id: string;
  label: string;
  url?: string;
}

interface BackgroundImageProps {
  src: string;
  width: number;
  height: number;
  transform?: any;
  assetId: string;
  onAssetStatus: (id: string, status: AssetStatus) => void;
}

function BackgroundImage({ src, width, height, transform, assetId, onAssetStatus }: BackgroundImageProps) {
  const [image, status] = useImage(src, 'anonymous');

  useEffect(() => {
    onAssetStatus(assetId, status === 'loaded' ? 'loaded' : status === 'failed' ? 'failed' : 'loading');
  }, [assetId, onAssetStatus, status]);

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

function decodeImageSource(source: string, label: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      image.src = '';
      reject(new DOMException('Image preparation was cancelled.', 'AbortError'));
    };
    image.crossOrigin = 'anonymous';
    image.onload = async () => {
      try {
        if (typeof image.decode === 'function') await image.decode();
        if (image.naturalWidth < 1 || image.naturalHeight < 1) throw new Error('Image has no decoded pixels.');
        cleanup();
        resolve();
      } catch (error) {
        cleanup();
        reject(new Error(`${label} could not be decoded: ${error instanceof Error ? error.message : 'unknown image error'}`));
      }
    };
    image.onerror = () => {
      cleanup();
      reject(new Error(`${label} could not be loaded. Check the connection and media access, then retry.`));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    image.src = source;
  });
}

async function withReadinessTimeout<T>(work: Promise<T>, remainingMs: number): Promise<T> {
  if (remainingMs <= 0) throw new Error('Poster assets and fonts did not finish loading within 30 seconds. Retry after reconnecting.');
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error('Poster assets and fonts did not finish loading within 30 seconds. Retry after reconnecting.')),
          remainingMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

function getFontContentType(reference: PosterAssetReference): string {
  if (reference.contentType) return reference.contentType;
  const extension = reference.assetKey.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
  if (extension === 'woff2') return 'font/woff2';
  if (extension === 'woff') return 'font/woff';
  if (extension === 'otf') return 'font/otf';
  return 'font/ttf';
}

async function resolveFontUrl(reference: PosterAssetReference): Promise<string> {
  if (/^(https?:|blob:|data:)/i.test(reference.assetKey)) return reference.assetKey;
  const objectKey = reference.assetKey.replace(/^r2:\/\//, '');
  return storageService.getPresignedUrl(objectKey, getFontContentType(reference), 'download');
}

async function prepareFonts(layers: readonly LayerData[], variables: Record<string, string | undefined>, references: PosterAssetReference[]) {
  const textLayers = layers.filter((layer) => layer.type === 'text' && layer.isVisible !== false);
  const fontFamilies = new Set(textLayers.map((layer) => layer.fontFamily || 'Poppins'));
  const resolvedText = textLayers.map((layer) => resolveLayerText(layer, variables)).join(' ');
  if (/[\u0D00-\u0D7F]/.test(resolvedText)) fontFamilies.add('Noto Sans Malayalam');

  const customByFamily = new Map(references.filter((reference) => reference.fontFamily).map((reference) => [reference.fontFamily!, reference]));
  const knownFonts = [...ML_FONTS, ...EN_FONTS];
  await Promise.all([...fontFamilies].map(async (family) => {
    const customReference = customByFamily.get(family);
    if (customReference) {
      const url = await resolveFontUrl(customReference);
      const status = await loadFont({ family, url, category: 'Custom Fonts' });
      if (status !== 'loaded') throw new Error(`Font "${family}" could not be loaded. Reconnect to media storage and retry.`);
      return;
    }

    const definition = knownFonts.find((font) => font.family === family);
    if (definition) {
      const status = await loadFont(definition);
      if (status !== 'loaded') throw new Error(`Font "${family}" could not be loaded. Check the connection and retry.`);
    }
  }));

  await document.fonts.ready;
  const fontRequests = textLayers.map((layer) => {
    const family = layer.fontFamily || 'Poppins';
    const weight = layer.fontWeight || 600;
    const size = layer.fontSize || 24;
    return document.fonts.load(`${weight} ${size}px "${family}"`, resolveLayerText(layer, variables));
  });
  if (/[\u0D00-\u0D7F]/.test(resolvedText)) {
    fontRequests.push(document.fonts.load('400 24px "Noto Sans Malayalam"', resolvedText));
  }
  await Promise.all(fontRequests);
}

export interface OffscreenRendererProps {
  layers: any[];
  variables: Record<string, string | undefined>;
  onReady?: (captureFunc: (ratio?: number) => string) => void;
  onError?: (error: Error) => void;
  onStatus?: (status: RenderStatus, message?: string) => void;
  width?: number;
  height?: number;
  backgroundUrl?: string;
  backgroundTransform?: any;
  customFontReferences?: PosterAssetReference[];
  /** Set for a small, visible batch thumbnail. Capture remains disabled in this mode. */
  previewScale?: number;
  renderKey?: string;
}

export default function OffscreenRenderer({
  layers,
  variables,
  onReady,
  onError,
  onStatus,
  width = 1080,
  height = 1080,
  backgroundUrl,
  backgroundTransform,
  customFontReferences = [],
  previewScale,
  renderKey,
}: OffscreenRendererProps) {
  const stageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onStatusRef = useRef(onStatus);
  const renderStartedRef = useRef<string | null>(null);
  const errorReportedRef = useRef<string | null>(null);
  const mountedSignatureRef = useRef('');
  const renderStartedAtRef = useRef(Date.now());
  onReadyRef.current = onReady;
  onErrorRef.current = onError;
  onStatusRef.current = onStatus;

  const legacyBackgroundLayers = useMemo(() => layers.filter((layer: any) => layer.type === 'background'), [layers]);
  const renderableLayers = useMemo(
    () => getRenderableLayers(layers.filter((layer: any) => layer.type !== 'background') as LayerData[]),
    [layers],
  );
  const sortedLayers = useMemo(
    () => [...legacyBackgroundLayers, ...renderableLayers].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    [legacyBackgroundLayers, renderableLayers],
  );
  const groupIssues = useMemo(() => getLayerGroupIssues(layers as LayerData[]), [layers]);
  const assetSpecs = useMemo<AssetSpec[]>(() => {
    const specs: AssetSpec[] = [];
    if (backgroundUrl) specs.push({ id: '__template_background__', label: 'Template background', url: backgroundUrl });
    renderableLayers.filter((layer) => layer.type === 'image').forEach((layer) => {
      specs.push({ id: layer.id, label: `Image "${layer.name}"`, url: layer.src });
    });
    legacyBackgroundLayers.forEach((layer: any) => {
      specs.push({ id: `__legacy_background__${layer.id}`, label: `Background layer "${layer.name || layer.id}"`, url: layer.src });
    });
    return specs;
  }, [backgroundUrl, legacyBackgroundLayers, renderableLayers]);
  const renderSignature = useMemo(() => JSON.stringify({
    renderKey,
    layers,
    variables,
    width,
    height,
    backgroundUrl,
    backgroundTransform,
    customFontReferences,
  }), [renderKey, layers, variables, width, height, backgroundUrl, backgroundTransform, customFontReferences]);

  const [assetState, setAssetState] = useState<{ signature: string; status: RenderStatus; sources: Record<string, string>; error: string }>({
    signature: '', status: 'preparing', sources: {}, error: '',
  });
  const [renderedAssetStatuses, setRenderedAssetStatuses] = useState<Record<string, AssetStatus>>({});
  const [fullyReadySignature, setFullyReadySignature] = useState('');

  const reportRenderError = useCallback((error: Error) => {
    setAssetState({ signature: renderSignature, status: 'error', sources: {}, error: error.message });
    onStatusRef.current?.('error', error.message);
    if (errorReportedRef.current !== renderSignature) {
      errorReportedRef.current = renderSignature;
      onErrorRef.current?.(error);
    }
  }, [renderSignature]);

  const reportAssetStatus = useCallback((id: string, status: AssetStatus) => {
    setRenderedAssetStatuses((previous) => previous[id] === status ? previous : { ...previous, [id]: status });
  }, []);

  useEffect(() => {
    mountedSignatureRef.current = renderSignature;
    renderStartedAtRef.current = Date.now();
    renderStartedRef.current = null;
    errorReportedRef.current = null;
    setRenderedAssetStatuses({});
    setFullyReadySignature('');
    setAssetState({ signature: renderSignature, status: 'preparing', sources: {}, error: '' });
    onStatusRef.current?.('preparing');

    const controller = new AbortController();
    const deadline = Date.now() + READINESS_TIMEOUT_MS;
    let cancelled = false;
    const prepare = async () => {
      try {
        if (groupIssues.length > 0) {
          const firstIssue = groupIssues[0];
          throw new Error(`Group "${firstIssue.groupName}" is missing ${firstIssue.missingLayerIds.length} layer(s). Repair the design before generating.`);
        }
        const sources = await withReadinessTimeout(Promise.all(assetSpecs.map(async (asset) => {
          if (!asset.url) throw new Error(`${asset.label} has no source image. Reopen the design and add the missing asset.`);
          const source = await resolveImageUrl(asset.url);
          if (!source) throw new Error(`${asset.label} could not be resolved. Reconnect to media storage and retry.`);
          await decodeImageSource(source, asset.label, controller.signal);
          return [asset.id, source] as const;
        })), deadline - Date.now());
        if (cancelled) return;
        setAssetState({ signature: renderSignature, status: 'ready', sources: Object.fromEntries(sources), error: '' });
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return;
        controller.abort();
        reportRenderError(error instanceof Error ? error : new Error('Poster assets could not be prepared. Retry the export.'));
      }
    };

    void prepare();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [assetSpecs, groupIssues, renderSignature, reportRenderError]);

  useEffect(() => {
    if (assetState.signature !== renderSignature || assetState.status !== 'ready') return;
    const requiredIds = assetSpecs.map((asset) => asset.id);
    const failedId = requiredIds.find((id) => renderedAssetStatuses[id] === 'failed');
    if (failedId) {
      const failedAsset = assetSpecs.find((asset) => asset.id === failedId);
      reportRenderError(new Error(`${failedAsset?.label || 'Poster image'} failed inside the canvas renderer. Check media access and retry.`));
      return;
    }
    if (requiredIds.some((id) => renderedAssetStatuses[id] !== 'loaded')) return;
    if (renderStartedRef.current === renderSignature) return;
    renderStartedRef.current = renderSignature;

    let cancelled = false;
    const prepare = async () => {
      try {
        const remainingMs = READINESS_TIMEOUT_MS - (Date.now() - renderStartedAtRef.current);
        await withReadinessTimeout(prepareFonts(renderableLayers, variables, customFontReferences), remainingMs);
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
        if (cancelled || mountedSignatureRef.current !== renderSignature) return;
        layerRef.current?.batchDraw();
        await new Promise<void>((resolve) => window.setTimeout(resolve, 30));
        if (cancelled || mountedSignatureRef.current !== renderSignature) return;

        const capture = (ratio?: number) => {
          if (!stageRef.current) throw new Error('Poster renderer is no longer available. Reopen the canvas and retry.');
          const maxDim = Math.max(width, height, 1);
          const maxSafeRatio = 4096 / maxDim;
          const requestedRatio = ratio ?? Math.min(2, maxSafeRatio);
          const effectiveRatio = Math.max(Number.EPSILON, Math.min(requestedRatio, maxSafeRatio));
          return stageRef.current.toDataURL({ pixelRatio: effectiveRatio, mimeType: 'image/jpeg', quality: 0.95 });
        };
        if (onReadyRef.current) onReadyRef.current(capture);
        setFullyReadySignature(renderSignature);
        onStatusRef.current?.('ready');
      } catch (error) {
        if (cancelled || mountedSignatureRef.current !== renderSignature) return;
        reportRenderError(error instanceof Error ? error : new Error('Poster fonts could not be prepared. Retry the export.'));
      }
    };

    void prepare();
    return () => { cancelled = true; };
  }, [assetSpecs, assetState, customFontReferences, renderSignature, renderableLayers, renderedAssetStatuses, reportRenderError, variables, width, height]);

  const isPreview = Number.isFinite(previewScale) && (previewScale || 0) > 0;
  const scale = isPreview ? previewScale! : 1;
  const stageWidth = isPreview ? Math.max(1, Math.round(width * scale)) : width;
  const stageHeight = isPreview ? Math.max(1, Math.round(height * scale)) : height;
  const readyError = assetState.signature === renderSignature && assetState.status === 'error' ? assetState.error : '';

  return (
    <div
      style={isPreview ? {
        position: 'relative', width: stageWidth, height: stageHeight, overflow: 'hidden',
        backgroundColor: '#FFFFFF', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
      } : {
        position: 'absolute', left: '-99999px', top: '-99999px', opacity: 0,
        pointerEvents: 'none', zIndex: -1,
      }}
    >
      <Stage width={stageWidth} height={stageHeight} ref={stageRef}>
        <Layer ref={layerRef}>
          <Group scaleX={scale} scaleY={scale}>
          <Rect width={width} height={height} fill="#FFFFFF" listening={false} />
          {backgroundUrl && assetState.signature === renderSignature && assetState.sources.__template_background__ && (
            <BackgroundImage
              src={assetState.sources.__template_background__}
              width={width}
              height={height}
              transform={backgroundTransform}
              assetId="__template_background__"
              onAssetStatus={reportAssetStatus}
            />
          )}

          {sortedLayers.map((layer) => {
            if (layer.isVisible === false) return null;
            if (layer.type === 'background') {
              const assetId = `__legacy_background__${layer.id}`;
              const src = assetState.signature === renderSignature ? assetState.sources[assetId] : undefined;
              return src ? (
                <BackgroundImage
                  key={layer.id}
                  src={src}
                  width={width}
                  height={height}
                  assetId={assetId}
                  onAssetStatus={reportAssetStatus}
                />
              ) : null;
            }
            if (layer.type === 'text') {
              const textProps = getTextLayerRenderProps(layer, variables, true);
              const textBackgroundProps = getTextLayerBackgroundRenderProps(layer);

              return (
                <React.Fragment key={layer.id}>
                  {textBackgroundProps && <Rect {...textBackgroundProps} />}
                  <Text
                    x={layer.x}
                    y={layer.y}
                    width={textProps.width}
                    height={textProps.height}
                    text={textProps.text}
                    fontSize={textProps.fontSize}
                    fontFamily={textProps.fontFamily}
                    fontStyle={textProps.fontStyle}
                    textDecoration={textProps.textDecoration}
                    fill={textProps.fill}
                    stroke={textProps.stroke}
                    strokeWidth={textProps.strokeWidth}
                    shadowColor={textProps.shadowColor}
                    shadowBlur={textProps.shadowBlur}
                    shadowOffsetX={textProps.shadowOffsetX}
                    shadowOffsetY={textProps.shadowOffsetY}
                    align={textProps.align}
                    lineHeight={textProps.lineHeight}
                    letterSpacing={textProps.letterSpacing}
                    wrap={textProps.wrap}
                    ellipsis={textProps.ellipsis}
                    opacity={textProps.opacity}
                    rotation={textProps.rotation}
                    scaleX={textProps.scaleX}
                    scaleY={textProps.scaleY}
                    perfectDrawEnabled={false}
                  />
                </React.Fragment>
              );
            }
            if (layer.type === 'image') {
              const src = assetState.signature === renderSignature ? assetState.sources[layer.id] : undefined;
              return src ? <EditableVisualNode key={layer.id} layer={layer} resolvedSource={src} onAssetStatus={reportAssetStatus} /> : null;
            }
            if (layer.type === 'shape') return <EditableVisualNode key={layer.id} layer={layer} />;
            return null;
          })}
          </Group>
        </Layer>
      </Stage>
      {isPreview && assetState.signature === renderSignature && assetState.status === 'error' && (
        <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 12, backgroundColor: 'rgba(255,255,255,0.94)', color: '#991B1B', fontSize: 12, textAlign: 'center' }}>
          {readyError}
        </div>
      )}
      {isPreview && fullyReadySignature !== renderSignature && assetState.status !== 'error' && (
        <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 12, backgroundColor: 'rgba(255,255,255,0.8)', color: '#334155', fontSize: 12, textAlign: 'center' }}>
          Preparing preview…
        </div>
      )}
    </div>
  );
}
