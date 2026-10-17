import React from 'react';
import { Layer, Line } from 'react-konva';
import { useCanvasStore } from '../Stores/canvasStore';

interface GridOverlayProps {
  width: number;
  height: number;
}

export default function GridOverlay({ width, height }: GridOverlayProps) {
  const { gridVisible, gridSize } = useCanvasStore();

  if (!gridVisible) return null;

  const lines = [];

  // Vertical lines
  for (let i = 0; i <= width; i += gridSize) {
    lines.push(
      <Line
        key={`v-${i}`}
        points={[i, 0, i, height]}
        stroke="rgba(0,0,0,0.05)"
        strokeWidth={1}
      />
    );
  }

  // Horizontal lines
  for (let j = 0; j <= height; j += gridSize) {
    lines.push(
      <Line
        key={`h-${j}`}
        points={[0, j, width, j]}
        stroke="rgba(0,0,0,0.05)"
        strokeWidth={1}
      />
    );
  }

  return <Layer listening={false}>{lines}</Layer>;
}
