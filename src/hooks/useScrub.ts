import { useRef, useCallback, useEffect } from 'react';

interface UseScrubOptions {
  value:        number;
  min:          number;
  max:          number;
  step:         number;
  sensitivity?: number;   // px per step — default 4
  onChange:     (v: number) => void;
}

interface UseScrubReturn {
  labelProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    style:         React.CSSProperties;
    className:     string;
  };
}

export function useScrub({
  value,
  min,
  max,
  step,
  sensitivity = 4,
  onChange,
}: UseScrubOptions): UseScrubReturn {
  const startX    = useRef(0);
  const startVal  = useRef(0);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const delta = (e.clientX - startX.current) / sensitivity;
      const raw   = startVal.current + Math.round(delta) * step;
      const clamped = Math.max(min, Math.min(max, parseFloat(raw.toFixed(2))));
      onChange(clamped);
    },
    [min, max, step, sensitivity, onChange],
  );

  // One controller per drag. Aborting it detaches both listeners at once, so
  // the pointerup handler never needs to reference its own binding.
  const dragAbort = useRef<AbortController | null>(null);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    (e.target as Element)?.releasePointerCapture?.(e.pointerId);
    dragAbort.current?.abort();
    dragAbort.current = null;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      startX.current   = e.clientX;
      startVal.current = value;
      (e.target as Element).setPointerCapture(e.pointerId);

      dragAbort.current?.abort();
      const controller = new AbortController();
      dragAbort.current = controller;
      document.addEventListener('pointermove', handlePointerMove, { signal: controller.signal });
      document.addEventListener('pointerup',   handlePointerUp,   { signal: controller.signal });
    },
    [value, handlePointerMove, handlePointerUp],
  );

  // Detach if the component unmounts mid-drag.
  useEffect(() => () => dragAbort.current?.abort(), []);

  return {
    labelProps: {
      onPointerDown: handlePointerDown,
      style:     { cursor: 'ew-resize', userSelect: 'none' },
      className: 'insp-scrub-label',
    },
  };
}
