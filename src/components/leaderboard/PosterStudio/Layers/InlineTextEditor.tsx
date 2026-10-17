import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLayerStore, LayerData } from '../Stores/layerStore';
import { useHistoryStore } from '../Stores/historyStore';
import { useCanvasStore } from '../Stores/canvasStore';
import { useTemplateStore } from '../Stores/templateStore';
import { resolveLayerText } from '../Utils/resolver';

interface InlineTextEditorProps {
  layer: LayerData;
  stageContainer: HTMLDivElement | null;
  onClose: () => void;
  offsetX: number;
  offsetY: number;
}

export default function InlineTextEditor({ layer, stageContainer, onClose, offsetX, offsetY }: InlineTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { updateLayer, layers } = useLayerStore();
  const history = useHistoryStore();
  const { zoomLevel, panX, panY } = useCanvasStore();
  
  const { variables, updateVariable } = useTemplateStore();
  // Use resolveLayerText so manualOverride layers show their literal text
  const resolved = resolveLayerText(layer, variables);
  const [localValue, setLocalValue] = useState(resolved);
  const [dynamicWidth, setDynamicWidth] = useState((layer.width || 200) * zoomLevel);
  const isComposing = useRef(false);

  useEffect(() => {
    if (!textareaRef.current || !stageContainer) return;
    textareaRef.current.focus();
    textareaRef.current.value = localValue;
    // Select all text automatically to mimic pro design tools
    textareaRef.current.select();
  }, []);

  // Content-aware width calculation (matches Konva width constraints)
  useEffect(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) {
      context.font = `${layer.fontStyle || 'normal'} ${layer.fontWeight ?? 400} ${(layer.fontSize || 24) * zoomLevel}px "${layer.fontFamily || 'Inter, sans-serif'}"`;
      const lines = localValue.split('\n');
      let maxW = 0;
      lines.forEach(line => {
        const w = context.measureText(line).width;
        if (w > maxW) maxW = w;
      });
      const letterSpacingBuf = lines[0].length * ((layer.letterSpacing ?? 0) * zoomLevel);
      let calculatedW = maxW + letterSpacingBuf + 10; // 10px caret buffer
      
      if (layer.width && calculatedW > layer.width * zoomLevel) {
        calculatedW = layer.width * zoomLevel;
      }
      setDynamicWidth(Math.max(calculatedW, 20));
    }
  }, [localValue, zoomLevel, layer]);

  // Auto-resize height to fit multiline content seamlessly
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = '0px';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [localValue, layer.width, zoomLevel, adjustHeight]);

  const commit = useCallback(() => {
    if (isComposing.current) return;
    const newText = localValue.trim();
    if (layer.dynamicBinding) {
      updateVariable(layer.dynamicBinding, newText);
    } else if (newText !== layer.text) {
      history.push(layers);
      updateLayer(layer.id, {
        text: newText,
        manualOverride: true,
        dynamicBinding: undefined,
      });
    }
    onClose();
  }, [layer.id, layer.text, layer.dynamicBinding, layers, history, updateLayer, updateVariable, onClose, localValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isComposing.current) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
      }
    },
    [commit, onClose]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalValue(val);
    adjustHeight();
    // Live update for instant canvas preview (skip during IME composition)
    if (!isComposing.current) {
      if (layer.dynamicBinding) {
        updateVariable(layer.dynamicBinding, val);
      } else {
        updateLayer(layer.id, {
          text: val,
          manualOverride: true,
          dynamicBinding: undefined,
        });
      }
    }
  };

  const handleCompositionStart = () => { isComposing.current = true; };
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposing.current = false;
    const val = (e.target as HTMLTextAreaElement).value;
    setLocalValue(val);
    if (layer.dynamicBinding) {
      updateVariable(layer.dynamicBinding, val);
    } else {
      updateLayer(layer.id, {
        text: val,
        manualOverride: true,
        dynamicBinding: undefined,
      });
    }
    adjustHeight();
  };

  if (!stageContainer) return null;

  const containerRect = stageContainer.getBoundingClientRect();

  // Perfect absolute screen mapping including Figma-style canvas centering (offsetX/offsetY)
  const screenX = containerRect.left + panX + offsetX + layer.x * zoomLevel;
  const screenY = containerRect.top + panY + offsetY + layer.y * zoomLevel;

  return (
    <>
      <style>{`
        .poster-studio-inline-editor::selection {
          background: rgba(59, 130, 246, 0.18);
        }
      `}</style>
      <textarea
        ref={textareaRef}
        className="poster-studio-inline-editor"
        value={localValue}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        style={{
          position: 'fixed',
          left: screenX,
          top: screenY,
          width: dynamicWidth,
          minHeight: (layer.fontSize || 24) * zoomLevel * (layer.lineHeight || 1.4),
          fontSize: (layer.fontSize || 24) * zoomLevel, // Scale font size precisely
          fontFamily: `"${layer.fontFamily || 'Inter'}", "Noto Sans Malayalam", "Inter", sans-serif`,
          fontWeight: layer.fontWeight ?? 400,
          fontStyle: layer.fontStyle || 'normal',
          color: layer.fill || '#000000',
          lineHeight: layer.lineHeight ?? 1.4,
          letterSpacing: (layer.letterSpacing ?? 0) * zoomLevel, // Scale letter spacing
          textAlign: layer.align as any,
          backgroundColor: 'transparent',
          
          // Smooth transitions for appearing/disappearing
          transition: 'opacity 0.12s ease, transform 0.12s ease',
          
          // Remove ALL browser defaults for native-canvas feel
          appearance: 'none',
          border: 'none',
          outline: 'none',
          resize: 'none',
          overflow: 'hidden',
          padding: 0,
          margin: 0,
          boxShadow: 'none',
          
          zIndex: 9999,
          transform: `rotate(${layer.rotation ?? 0}deg)`,
          transformOrigin: 'top left',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          boxSizing: 'border-box',
          unicodeBidi: 'plaintext', // Essential for accurate Malayalam IME cursor behavior
        }}
      />
    </>
  );
}
