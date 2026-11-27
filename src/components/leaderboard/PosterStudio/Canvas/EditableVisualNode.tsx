import React, { useEffect, useRef } from 'react';
import { Ellipse, Group, Image as KonvaImage, Rect, Text, Transformer } from 'react-konva';
import useImage from 'use-image';
import type { LayerData } from '../Stores/layerStore';
import { useResolvedImageUrl } from '../../../../core/hooks/useResolvedImageUrl';

interface EditableVisualNodeProps {
  layer: LayerData;
  isSelected?: boolean;
  interactive?: boolean;
  onSelect?: (event: any) => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
  onTransformEnd?: (id: string, node: any, activeAnchor?: string) => void;
  onContextMenu?: (event: any) => void;
  resolvedSource?: string;
  onAssetStatus?: (id: string, status: 'loading' | 'loaded' | 'failed') => void;
}

export function EditableVisualNode({
  layer,
  isSelected = false,
  interactive = false,
  onSelect,
  onDragEnd,
  onTransformEnd,
  onContextMenu,
  resolvedSource,
  onAssetStatus,
}: EditableVisualNodeProps) {
  const nodeRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const resolvedByHook = useResolvedImageUrl(layer.type === 'image' ? layer.src : undefined);
  const source = resolvedSource || resolvedByHook;
  const [image, imageStatus] = useImage(source || '', 'anonymous');
  const canEdit = interactive && !layer.isLocked && layer.lockProfile !== 'fully-locked' && layer.lockProfile !== 'semi-locked';
  const commonProps = {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation || 0,
    scaleX: layer.scaleX || 1,
    scaleY: layer.scaleY || 1,
    opacity: layer.opacity ?? 1,
    visible: layer.isVisible !== false,
    draggable: canEdit,
    onClick: interactive ? onSelect : undefined,
    onTap: interactive ? onSelect : undefined,
    onDragEnd: interactive ? (event: any) => onDragEnd?.(layer.id, event.target.x(), event.target.y()) : undefined,
    onTransformEnd: interactive ? () => onTransformEnd?.(layer.id, nodeRef.current, transformerRef.current?.getActiveAnchor()) : undefined,
    onContextMenu: interactive ? (event: any) => {
      event.cancelBubble = true;
      onContextMenu?.(event.evt);
    } : undefined,
  };
  const effectProps = {
    shadowColor: layer.shadowColor || undefined,
    shadowBlur: layer.shadowBlur || 0,
    shadowOffsetX: layer.shadowOffsetX || 0,
    shadowOffsetY: layer.shadowOffsetY || 0,
  };

  useEffect(() => {
    if (layer.type === 'image') {
      onAssetStatus?.(layer.id, !source ? 'loading' : imageStatus === 'loaded' ? 'loaded' : imageStatus === 'failed' ? 'failed' : 'loading');
    }
  }, [imageStatus, layer.id, layer.type, onAssetStatus, source]);

  useEffect(() => {
    if (!isSelected || !canEdit || !transformerRef.current || !nodeRef.current) return;
    transformerRef.current.nodes([nodeRef.current]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [isSelected, canEdit, layer.width, layer.height, image]);

  const renderer = layer.type === 'shape' ? (
    <Group ref={nodeRef} {...commonProps}>
      {layer.shapeKind === 'circle' ? (
        <Ellipse
          x={layer.width / 2}
          y={layer.height / 2}
          radiusX={Math.max(1, layer.width / 2)}
          radiusY={Math.max(1, layer.height / 2)}
          fill={layer.fill || '#CBD5E1'}
          stroke={layer.stroke || undefined}
          strokeWidth={layer.strokeWidth || 0}
          {...effectProps}
        />
      ) : (
        <Rect
          width={layer.width}
          height={layer.height}
          fill={layer.fill || '#CBD5E1'}
          stroke={layer.stroke || undefined}
          strokeWidth={layer.strokeWidth || 0}
          cornerRadius={layer.cornerRadius || 0}
          {...effectProps}
        />
      )}
    </Group>
  ) : image ? (
    <Group
      ref={nodeRef}
      {...commonProps}
      clipFunc={(context) => {
        const radius = Math.min(Math.max(0, layer.cornerRadius || 0), layer.width / 2, layer.height / 2);
        context.beginPath();
        context.moveTo(radius, 0);
        context.lineTo(layer.width - radius, 0);
        context.arcTo(layer.width, 0, layer.width, radius, radius);
        context.lineTo(layer.width, layer.height - radius);
        context.arcTo(layer.width, layer.height, layer.width - radius, layer.height, radius);
        context.lineTo(radius, layer.height);
        context.arcTo(0, layer.height, 0, layer.height - radius, radius);
        context.lineTo(0, radius);
        context.arcTo(0, 0, radius, 0, radius);
        context.closePath();
      }}
    >
      <KonvaImage image={image} width={layer.width} height={layer.height} {...effectProps} />
      {layer.stroke && layer.strokeWidth ? (
        <Rect
          width={layer.width}
          height={layer.height}
          cornerRadius={layer.cornerRadius || 0}
          fillEnabled={false}
          stroke={layer.stroke}
          strokeWidth={layer.strokeWidth}
          listening={false}
        />
      ) : null}
    </Group>
  ) : interactive && layer.isVisible !== false ? (
    <Group
      ref={nodeRef}
      {...commonProps}
      onClick={onSelect}
      onTap={onSelect}
    >
      <Rect width={layer.width} height={layer.height} fill="#F1F5F9" stroke="#94A3B8" dash={[6, 4]} />
      <Text width={layer.width} height={layer.height} text="Image unavailable" fontSize={14} align="center" verticalAlign="middle" fill="#475569" listening={false} />
    </Group>
  ) : null;

  if (!renderer) return null;

  return (
    <>
      {renderer}
      {interactive && isSelected && canEdit && (
        <Transformer
          ref={transformerRef}
          rotateEnabled
          keepRatio={layer.type === 'image'}
          borderStroke="#0EA5E9"
          borderStrokeWidth={2}
          anchorSize={10}
          anchorCornerRadius={5}
          anchorStroke="#0EA5E9"
          anchorFill="#FFFFFF"
          padding={4}
          boundBoxFunc={(oldBox, newBox) => newBox.width < 8 || newBox.height < 8 ? oldBox : newBox}
        />
      )}
    </>
  );
}

interface GroupSelectionNodeProps {
  group: LayerData;
  bounds: { x: number; y: number; width: number; height: number };
  isSelected: boolean;
  onSelect: (event: any) => void;
  onDragEnd: (id: string, x: number, y: number, width: number, height: number) => void;
  onTransformEnd: (id: string, x: number, y: number, width: number, height: number) => void;
}

export function GroupSelectionNode({ group, bounds, isSelected, onSelect, onDragEnd, onTransformEnd }: GroupSelectionNodeProps) {
  const nodeRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const canEdit = !group.isLocked && group.lockProfile === 'editable';

  useEffect(() => {
    if (!isSelected || !canEdit || !nodeRef.current || !transformerRef.current) return;
    transformerRef.current.nodes([nodeRef.current]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [isSelected, canEdit, bounds.x, bounds.y, bounds.width, bounds.height]);

  return (
    <>
      <Rect
        ref={nodeRef}
        x={bounds.x}
        y={bounds.y}
        width={Math.max(1, bounds.width)}
        height={Math.max(1, bounds.height)}
        fill="rgba(255,255,255,0.008)"
        stroke={isSelected ? '#0EA5E9' : 'rgba(14,165,233,0.45)'}
        dash={isSelected ? undefined : [5, 4]}
        strokeWidth={isSelected ? 1.5 : 1}
        listening
        draggable={canEdit}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(event) => onDragEnd(group.id, event.target.x(), event.target.y(), bounds.width, bounds.height)}
        onTransformEnd={() => {
          const node = nodeRef.current;
          if (!node) return;
          onTransformEnd(group.id, node.x(), node.y(), node.width() * node.scaleX(), node.height() * node.scaleY());
          node.scaleX(1);
          node.scaleY(1);
        }}
      />
      {isSelected && canEdit && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          keepRatio={false}
          borderStroke="#0EA5E9"
          borderStrokeWidth={2}
          anchorSize={10}
          anchorCornerRadius={5}
          anchorStroke="#0EA5E9"
          anchorFill="#FFFFFF"
          padding={4}
          boundBoxFunc={(oldBox, newBox) => newBox.width < 12 || newBox.height < 12 ? oldBox : newBox}
        />
      )}
    </>
  );
}
