import { useState, useCallback, useEffect } from 'react';

type ContextMenuState = {
  isOpen: boolean;
  x: number;
  y: number;
  targetId: string | null;
  targetType: 'layer' | 'canvas' | null;
};

export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    targetId: null,
    targetType: null,
  });

  const openMenu = useCallback((e: React.MouseEvent, targetId: string | null, targetType: 'layer' | 'canvas') => {
    e.preventDefault();
    e.stopPropagation();

    // Prevent overflowing the right/bottom edge
    let x = e.clientX;
    let y = e.clientY;
    const menuWidth = 180;
    const menuHeight = 220; // approximate max height

    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 16;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 16;

    setState({
      isOpen: true,
      x,
      y,
      targetId,
      targetType,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  // Handle outside click and Escape
  useEffect(() => {
    if (!state.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault(); // Prevent default browser behavior
        e.stopPropagation(); // Stop propagation to index.tsx Escape handler
        closeMenu();
      }
    };

    const handleClickOutside = () => {
      closeMenu();
    };

    // Use capture phase so we can stop propagation before index.tsx sees it
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [state.isOpen, closeMenu]);

  return {
    contextMenu: state,
    openMenu,
    closeMenu,
  };
}
