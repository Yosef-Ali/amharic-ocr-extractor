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
  // Mirrors isDragging for the mousemove listener, which needs a synchronous
  // read and must not depend on a re-render having landed.
  const isDraggingRef = useRef(false);
  // State, not a ref: panelStyle reads this during render to suppress the
  // width transition mid-drag. Dragging already re-renders via setWidth.
  const [isDragging, setIsDragging] = useState(false);
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
      if (!isDraggingRef.current) return;
      const delta = side === 'left'
        ? e.clientX - startX.current
        : startX.current - e.clientX;
      const newWidth = startWidth.current + delta;

      // Auto-collapse if dragged far below min
      if (newWidth < minWidth - 20) {
        setCollapsed(true);
        isDraggingRef.current = false;
        setIsDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        return;
      }

      setWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
    },
    [side, minWidth, maxWidth],
  );

  // One controller per drag. Aborting it detaches both listeners at once, so
  // the mouseup handler never needs to reference its own binding.
  const dragAbort = useRef<AbortController | null>(null);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    dragAbort.current?.abort();
    dragAbort.current = null;
  }, []);

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
      isDraggingRef.current = true;
      setIsDragging(true);
      isAnimating.current = false;
      startX.current = e.clientX;
      startWidth.current = width;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      dragAbort.current?.abort();
      const controller = new AbortController();
      dragAbort.current = controller;
      document.addEventListener('mousemove', handleMouseMove, { signal: controller.signal });
      document.addEventListener('mouseup',   handleMouseUp,   { signal: controller.signal });
    },
    [collapsed, width, handleMouseMove, handleMouseUp],
  );

  // Detach if the component unmounts mid-drag.
  useEffect(() => () => dragAbort.current?.abort(), []);

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
    transition: isDragging ? 'none' : 'width 0.2s ease',
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
