import { useState, useRef, useCallback, useEffect } from 'react';

interface UseResizableOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  side: 'left' | 'right';
  storageKey?: string;
}

interface UseResizableReturn {
  width: number;
  collapsed: boolean;
  setCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  dividerProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    className: string;
  };
  panelStyle: React.CSSProperties;
}

export function useResizable({
  initialWidth,
  minWidth,
  maxWidth,
  side,
  storageKey,
}: UseResizableOptions): UseResizableReturn {
  // Read persisted width synchronously
  const [width, setWidth] = useState<number>(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const n = parseFloat(saved);
        if (!isNaN(n) && n >= minWidth && n <= maxWidth) return n;
      }
    }
    return initialWidth;
  });

  const [collapsed, setCollapsed] = useState(false);

  // Track whether we're animating (collapse/expand) vs dragging
  const isAnimating = useRef(false);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Persist width when it changes (debounced via drag)
  useEffect(() => {
    if (storageKey && !collapsed) {
      localStorage.setItem(storageKey, String(width));
    }
  }, [width, storageKey, collapsed]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = side === 'left'
        ? e.clientX - startX.current
        : startX.current - e.clientX;
      const newWidth = startWidth.current + delta;

      // Auto-collapse if dragged far below min
      if (newWidth < minWidth - 20) {
        setCollapsed(true);
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        return;
      }

      setWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
    },
    [side, minWidth, maxWidth],
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // If panel is collapsed, expand on divider click
      if (collapsed) {
        isAnimating.current = true;
        setCollapsed(false);
        setTimeout(() => { isAnimating.current = false; }, 250);
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      isDragging.current = true;
      isAnimating.current = false;
      startX.current = e.clientX;
      startWidth.current = width;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [collapsed, width, handleMouseMove, handleMouseUp],
  );

  // When setCollapsed is called externally, flag animating
  const setCollapsedWrapped = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      isAnimating.current = true;
      setCollapsed(v);
      setTimeout(() => { isAnimating.current = false; }, 250);
    },
    [],
  );

  const panelStyle: React.CSSProperties = {
    width: collapsed ? 0 : width,
    overflow: 'hidden',
    flexShrink: 0,
    // Transition only when animating (collapse/expand), NOT during drag
    transition: isDragging.current ? 'none' : 'width 0.2s ease',
    willChange: 'width',
  };

  return {
    width,
    collapsed,
    setCollapsed: setCollapsedWrapped,
    dividerProps: {
      onMouseDown: handleMouseDown,
      className: `editor-divider${collapsed ? ' editor-divider--collapsed' : ''}`,
    },
    panelStyle,
  };
}
