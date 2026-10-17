import { useEffect, useCallback } from 'react';
import { useCanvasStore } from '../Stores/canvasStore';

interface UseViewportManagerProps {
  containerWidth: number;
  containerHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}

export function useViewportManager({
  containerWidth,
  containerHeight,
  canvasWidth,
  canvasHeight,
}: UseViewportManagerProps) {
  const { zoomLevel, setZoom, panX, setPan, isUserZoomed } = useCanvasStore();

  // Calculate the best zoom to fit the canvas inside the container with padding
  const calculateAutoFitZoom = useCallback(() => {
    if (containerWidth === 0 || containerHeight === 0) return 1;
    const padding = 60; // 30px padding on all sides
    const availableWidth = Math.max(10, containerWidth - padding);
    const availableHeight = Math.max(10, containerHeight - padding);
    
    const scaleX = availableWidth / canvasWidth;
    const scaleY = availableHeight / canvasHeight;
    
    // Fit perfectly, max zoom 1 (100%)
    return Math.min(1, Math.min(scaleX, scaleY));
  }, [containerWidth, containerHeight, canvasWidth, canvasHeight]);

  // Trigger fit whenever container or canvas size changes, IF user hasn't zoomed
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isUserZoomed) {
        const bestZoom = calculateAutoFitZoom();
        setZoom(bestZoom, false);
        setPan(0, 0);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [containerWidth, containerHeight, canvasWidth, canvasHeight, isUserZoomed, calculateAutoFitZoom, setZoom, setPan]);

  // Calculate the offsets required to perfectly center the canvas in the viewport.
  // We do NOT use Math.max(0, ...) here. If the content is bigger than the container, 
  // the offset will be negative, pushing the Konva stage origin off-screen, 
  // which perfectly centers the oversized content inside the `overflow: hidden` container!
  const contentWidth = canvasWidth * zoomLevel;
  const contentHeight = canvasHeight * zoomLevel;
  
  const offsetX = (containerWidth - contentWidth) / 2;
  const offsetY = (containerHeight - contentHeight) / 2;

  return {
    offsetX,
    offsetY,
    contentWidth,
    contentHeight,
  };
}
