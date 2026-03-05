import { useRef, useCallback } from 'react';

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

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      (e.target as Element)?.releasePointerCapture?.(e.pointerId);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    },
    [handlePointerMove],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      startX.current   = e.clientX;
      startVal.current = value;
      (e.target as Element).setPointerCapture(e.pointerId);
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [value, handlePointerMove, handlePointerUp],
  );

  return {
    labelProps: {
      onPointerDown: handlePointerDown,
      style:     { cursor: 'ew-resize', userSelect: 'none' },
      className: 'insp-scrub-label',
    },
  };
}
