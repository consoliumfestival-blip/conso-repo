import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Stage, Layer, Text, Image as KonvaImage, Transformer, Rect } from 'react-konva';
import useImage from 'use-image';
import { useLayerStore, LayerData } from '../Stores/layerStore';
import { useHistoryStore } from '../Stores/historyStore';
import { useCanvasStore } from '../Stores/canvasStore';
import { useTemplateStore } from '../Stores/templateStore';
import CanvasSkeleton from './CanvasSkeleton';
import SafeZoneOverlay from './SafeZoneOverlay';
import GridOverlay from './GridOverlay';
import RulerOverlay from './RulerOverlay';
import MultiSelectToolbar from '../Toolbar/MultiSelectToolbar';
import InlineTextEditor from '../Layers/InlineTextEditor';
import { useViewportManager } from '../Hooks/useViewportManager';
import { measureText } from '../Utils/fontLoader';
import { resolveTemplateVariables } from '../Utils/resolver';

interface StudioCanvasProps {
  canvasWidth: number;
  canvasHeight: number;
  backgroundUrl?: string;
  onContextMenu?: (e: React.MouseEvent, targetId: string | null, targetType: 'layer' | 'canvas') => void;
}

const SNAP_THRESHOLD = 6;

function snapToGuides(val: number, center: boolean, canvasSize: number): number {
  const mid = canvasSize / 2;
  const target = center ? val : val;
  if (Math.abs((center ? val : val + 0) - mid) < SNAP_THRESHOLD) {
    return mid - (center ? 0 : 0);
  }
  return val;
}

interface BackgroundLayerProps {
  src: string;
  width: number;
  height: number;
  transform?: { scale: number; x: number; y: number; isDraggable?: boolean };
  onDragEnd?: (x: number, y: number) => void;
}

function BackgroundImage({ src, width, height, transform, onDragEnd }: BackgroundLayerProps) {
  const [image] = useImage(src, 'anonymous');
  
  const scale = transform?.scale ?? 1;
  const x = transform?.x ?? 0;
  const y = transform?.y ?? 0;
  const isDraggable = transform?.isDraggable ?? false;

  return image ? (
    <KonvaImage 
      image={image} 
      width={width} 
      height={height} 
      x={x}
      y={y}
      scaleX={scale}
      scaleY={scale}
      draggable={isDraggable}
      listening={isDraggable}
      onDragEnd={(e) => {
        if (onDragEnd) onDragEnd(e.target.x(), e.target.y());
      }}
    />
  ) : null;
}

interface EditableTextNodeProps {
  layer: LayerData;
  isSelected: boolean;
  onSelect: (e: any) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onTransformEnd: (id: string, node: any, activeAnchor?: string) => void;
  onDblClick: () => void;
  deviceQuality: string;
  isEditing?: boolean;
  onContextMenu?: (e: any) => void;
}

function EditableTextNode({ layer, isSelected, onSelect, onDragEnd, onTransformEnd, onDblClick, deviceQuality, isEditing = false, onContextMenu }: EditableTextNodeProps) {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const { variables } = useTemplateStore();

  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    if (document.fonts) {
      document.fonts.ready.then(() => setFontsLoaded(true));
    } else {
      setFontsLoaded(true);
    }
  }, [layer.fontFamily]);

  const resolvedText = resolveTemplateVariables(layer.text, variables);
  const draggable = layer.lockProfile !== 'fully-locked' && layer.lockProfile !== 'semi-locked';

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, layer.width, layer.height, fontsLoaded]);

  const handleDragStart = (e: any) => {
    if (deviceQuality === 'low') {
      e.target.getShadowEnabled() && e.target.shadowEnabled(false);
    }
  };

  const handleDragEndInternal = (e: any) => {
    if (deviceQuality === 'low') e.target.shadowEnabled(true);
    onDragEnd(layer.id, e.target.x(), e.target.y());
  };

  const handleTransform = (e: any) => {
    const node = shapeRef.current;
    if (node && node.className === 'Text') {
      const activeAnchor = trRef.current?.getActiveAnchor();
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      
      if (activeAnchor === 'middle-left' || activeAnchor === 'middle-right') {
        node.width(Math.max(50, node.width() * scaleX));
        node.scaleX(1);
        node.scaleY(1);
      } else if (activeAnchor === 'top-center' || activeAnchor === 'bottom-center') {
        node.height(Math.max(20, (node.height() || 40) * scaleY));
        node.scaleX(1);
        node.scaleY(1);
      } else if (activeAnchor && activeAnchor.includes('-')) {
        const avgScale = (scaleX + scaleY) / 2;
        node.scaleX(avgScale);
        node.scaleY(avgScale);
      }
    }
  };

  let displayFontSize = layer.fontSize || 24;
  let scaleForShrink = 1;
  
  if (layer.overflowMode === 'auto-shrink' && layer.width && fontsLoaded) {
    const metrics = measureText(resolvedText, `"${layer.fontFamily || 'Inter'}", "Noto Sans Malayalam"`, displayFontSize, layer.fontWeight || 400);
    if (metrics.width > layer.width) {
      scaleForShrink = Math.max(0.2, layer.width / metrics.width);
    }
  }

  return (
    <>
      <Text
        ref={shapeRef}
        x={layer.x}
        y={layer.y}
        width={layer.width || undefined}
        height={layer.height || undefined}
        text={resolvedText}
        fontSize={displayFontSize}
        fontFamily={`"${layer.fontFamily || 'Poppins'}", "Noto Sans Malayalam", "Inter", sans-serif`}
        fontStyle={`${layer.fontWeight || 600} ${layer.fontStyle || 'normal'}`}
        textDecoration={layer.textDecoration || ''}
        fill={layer.fill || '#000000'}
        stroke={layer.stroke || undefined}
        strokeWidth={layer.strokeWidth || 0}
        shadowColor={layer.shadowColor || undefined}
        shadowBlur={layer.shadowBlur || 0}
        shadowOffsetX={layer.shadowOffsetX || 0}
        shadowOffsetY={layer.shadowOffsetY || 0}
        align={layer.align || 'left'}
        lineHeight={layer.lineHeight || 1.2}
        letterSpacing={layer.letterSpacing || 0}
        wrap={layer.overflowMode === 'clip' ? 'none' : 'word'}
        ellipsis={layer.overflowMode === 'ellipsis'}
        rotation={layer.rotation || 0}
        scaleX={(layer.scaleX || 1) * scaleForShrink}
        scaleY={(layer.scaleY || 1) * scaleForShrink}
        opacity={isEditing ? 0 : (layer.opacity ?? 1)}
        visible={layer.isVisible !== false}
        draggable={draggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEndInternal}
        onTransform={handleTransform}
        onTransformEnd={() => onTransformEnd(layer.id, shapeRef.current, trRef.current?.getActiveAnchor())}
        onDblClick={onDblClick}
        onDblTap={onDblClick}
        onContextMenu={(e) => {
          if (onContextMenu) {
            e.cancelBubble = true;
            onContextMenu(e.evt);
          }
        }}
        perfectDrawEnabled={false}
      />
      {isSelected && draggable && (
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio={false}
          enabledAnchors={
            isSelected && layer.type === 'text'
              ? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']
              : undefined
          }
          borderStroke="#0EA5E9"
          borderStrokeWidth={2}
          anchorSize={10}
          anchorCornerRadius={5}
          anchorStroke="#0EA5E9"
          anchorStrokeWidth={2}
          anchorFill="#FFFFFF"
          padding={8}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 50 || newBox.height < 20) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}

import { useResolvedImageUrl } from '../../../../core/hooks/useResolvedImageUrl';

export default function StudioCanvas({ canvasWidth, canvasHeight, backgroundUrl, onContextMenu }: StudioCanvasProps) {
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { layers, selectedIds, setSelectedIds, clearSelection, updateLayer } = useLayerStore();
  const history = useHistoryStore();
  
  const resolvedBgUrl = useResolvedImageUrl(backgroundUrl);
  const { zoomLevel, panX, panY, setZoom, setStageSize, setHydrationComplete, deviceQuality, gridSnap, gridSize } = useCanvasStore();
  const { activeTemplate } = useTemplateStore();

  const [inlineEditLayerId, setInlineEditLayerId] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const isDrawingSelection = useRef(false);
  const selectionStart = useRef({ x: 0, y: 0 });

  const { offsetX, offsetY, contentWidth, contentHeight } = useViewportManager({
    containerWidth: dimensions.width,
    containerHeight: dimensions.height,
    canvasWidth,
    canvasHeight,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const parent = containerRef.current.parentElement;
    if (!parent) return;

    let timeoutId: any;
    const observer = new ResizeObserver((entries) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        for (const entry of entries) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
          setStageSize(entry.contentRect.width, entry.contentRect.height);
        }
      }, 50);
    });

    observer.observe(parent);
    setDimensions({ width: parent.clientWidth, height: parent.clientHeight });
    setStageSize(parent.clientWidth, parent.clientHeight);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
    };
  }, [setStageSize]);

  useEffect(() => {
    const timer = setTimeout(() => setHydrationComplete(true), 600);
    return () => clearTimeout(timer);
  }, []);

  const handleStageMouseDown = useCallback((e: any) => {
    if (e.target !== e.target.getStage()) return;
    clearSelection();
    
    const pos = e.target.getStage().getPointerPosition();
    selectionStart.current = { 
      x: (pos.x - panX - offsetX) / zoomLevel, 
      y: (pos.y - panY - offsetY) / zoomLevel 
    };
    isDrawingSelection.current = true;
    setSelectionRect({ x: selectionStart.current.x, y: selectionStart.current.y, width: 0, height: 0 });
  }, [clearSelection, panX, panY, canvasWidth, canvasHeight, zoomLevel, dimensions]);

  const handleStageMouseMove = useCallback((e: any) => {
    if (!isDrawingSelection.current) return;

    const pos = e.target.getStage().getPointerPosition();
    const current = { 
      x: (pos.x - panX - offsetX) / zoomLevel, 
      y: (pos.y - panY - offsetY) / zoomLevel 
    };
    
    setSelectionRect({
      x: Math.min(selectionStart.current.x, current.x),
      y: Math.min(selectionStart.current.y, current.y),
      width: Math.abs(current.x - selectionStart.current.x),
      height: Math.abs(current.y - selectionStart.current.y),
    });
  }, [panX, panY, canvasWidth, canvasHeight, zoomLevel, dimensions]);

  const handleStageMouseUp = useCallback(() => {
    if (!isDrawingSelection.current || !selectionRect) return;
    isDrawingSelection.current = false;
    if (selectionRect.width > 5 && selectionRect.height > 5) {
      const intersecting = layers.filter((l) => {
        if (l.lockProfile === 'fully-locked') return false;
        return l.x < selectionRect.x + selectionRect.width &&
               l.x + l.width > selectionRect.x &&
               l.y < selectionRect.y + selectionRect.height &&
               l.y + l.height > selectionRect.y;
      });
      if (intersecting.length > 0) setSelectedIds(intersecting.map((l) => l.id));
    }
    setSelectionRect(null);
  }, [layers, selectionRect, setSelectedIds]);

  const handleLayerSelect = useCallback((e: any, id: string) => {
    if (e.evt?.shiftKey) {
      const { toggleSelect } = useLayerStore.getState();
      toggleSelect(id);
    } else {
      setSelectedIds([id]);
    }
  }, [setSelectedIds]);

  const handleDragEnd = useCallback((id: string, x: number, y: number) => {
    history.push(layers);
    updateLayer(id, {
      x: gridSnap ? Math.round(x / gridSize) * gridSize : Math.round(x),
      y: gridSnap ? Math.round(y / gridSize) * gridSize : Math.round(y),
    });
  }, [gridSize, gridSnap, history, layers, updateLayer]);

  const handleTransformEnd = useCallback((id: string, node: any, activeAnchor?: string) => {
    history.push(layers);
    
    const isText = node.className === 'Text';
    let newWidth = Math.round(node.width() * node.scaleX());
    let newHeight = Math.round(node.height() * node.scaleY());

    if (isText) {
      const currentLayer = layers.find(l => l.id === id);
      const oldFontSize = currentLayer?.fontSize || 24;
      let newFontSize = oldFontSize;
      let newHeightVal = currentLayer?.height;
      let newWidthVal = node.width() * node.scaleX();
      
      if (activeAnchor && !activeAnchor.includes('middle') && !activeAnchor.includes('center')) {
        newFontSize = Math.round(oldFontSize * node.scaleX());
      }
      
      if (activeAnchor === 'top-center' || activeAnchor === 'bottom-center') {
        newHeightVal = Math.max(20, node.height() * node.scaleY());
      }

      updateLayer(id, {
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        width: Math.max(50, Math.round(newWidthVal)),
        height: newHeightVal,
        rotation: Math.round(node.rotation()),
        fontSize: newFontSize,
        scaleX: 1,
        scaleY: 1,
      });
    } else {
      updateLayer(id, {
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        width: newWidth,
        height: newHeight,
        rotation: Math.round(node.rotation()),
        scaleX: 1,
        scaleY: 1,
      });
    }
  }, [history, layers, updateLayer]);

  const lastDist = useRef(0);
  const handleTouchMove = useCallback((e: any) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) return;
    e.evt.preventDefault();
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (lastDist.current > 0) {
      const scale = dist / lastDist.current;
      setZoom(zoomLevel * scale, true);
    }
    lastDist.current = dist;
  }, [zoomLevel, setZoom]);

  const handleTouchEnd = useCallback(() => { lastDist.current = 0; }, []);

  const inlineEditLayer = inlineEditLayerId ? layers.find((l) => l.id === inlineEditLayerId) || null : null;
  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        touchAction: 'none',
        userSelect: 'none',
        position: 'relative'
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e as unknown as React.MouseEvent, null, 'canvas');
      }}
    >
      <CanvasSkeleton />
      <RulerOverlay />

      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={zoomLevel}
        scaleY={zoomLevel}
        x={panX + offsetX}
        y={panY + offsetY}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Layer name="backgroundLayer" listening={activeTemplate?.background_transform?.isDraggable}>
          <Rect width={canvasWidth} height={canvasHeight} fill="#FFFFFF" shadowColor="rgba(0,0,0,0.1)" shadowBlur={20} shadowOffsetY={8} listening={false} />
          {resolvedBgUrl && (
            <BackgroundImage 
              src={resolvedBgUrl || ''} 
              width={canvasWidth} 
              height={canvasHeight} 
              transform={activeTemplate?.background_transform}
              onDragEnd={(x, y) => {
                const tr = activeTemplate?.background_transform || { scale: 1, x: 0, y: 0 };
                useTemplateStore.getState().updateTemplateMeta({ background_transform: { ...tr, x, y } });
              }}
            />
          )}
        </Layer>

        <Layer name="contentLayer">
          {sortedLayers.map((layer) => {
            if (layer.type === 'text') {
              return (
                <EditableTextNode
                  key={layer.id}
                  layer={layer}
                  isSelected={selectedIds.includes(layer.id) && !inlineEditLayerId}
                  onSelect={(e) => handleLayerSelect(e, layer.id)}
                  onDragEnd={handleDragEnd}
                  onTransformEnd={handleTransformEnd}
                  onDblClick={() => {
                    if (layer.lockProfile !== 'fully-locked') setInlineEditLayerId(layer.id);
                  }}
                  onContextMenu={(e) => onContextMenu?.(e, layer.id, 'layer')}
                  deviceQuality={deviceQuality}
                  isEditing={inlineEditLayerId === layer.id}
                />
              );
            }
            return null;
          })}

          {/* Rubber-band Selection Rect */}
          {selectionRect && (
            <Rect
              x={selectionRect.x}
              y={selectionRect.y}
              width={selectionRect.width}
              height={selectionRect.height}
              fill="rgba(22, 184, 217, 0.08)"
              stroke="#16B8D9"
              strokeWidth={1.5}
              dash={[4, 4]}
              listening={false}
            />
          )}
        </Layer>

        <GridOverlay width={canvasWidth} height={canvasHeight} />

        {/* UI Layer — selection handles, guides (redraws on selection changes) */}
        <Layer name="uiLayer" listening={false} />
      </Stage>

      {/* Multi-select toolbar */}
      {selectedIds.length > 1 && (
        <div style={{ position: 'absolute', top: 0, left: '50%' }}>
          <MultiSelectToolbar canvasWidth={canvasWidth} canvasHeight={canvasHeight} />
        </div>
      )}

      {/* Safe Zone Overlay */}
      <SafeZoneOverlay 
        canvasWidth={canvasWidth} 
        canvasHeight={canvasHeight} 
        zoomLevel={zoomLevel} 
        offsetX={offsetX + panX}
        offsetY={offsetY + panY}
      />

      {/* Inline Text Editor */}
      {inlineEditLayer && (
        <InlineTextEditor
          layer={inlineEditLayer}
          stageContainer={containerRef.current}
          onClose={() => setInlineEditLayerId(null)}
          offsetX={offsetX}
          offsetY={offsetY}
        />
      )}
    </div>
  );
}
