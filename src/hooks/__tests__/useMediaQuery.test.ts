import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from '../useMediaQuery';

/**
 * jsdom has no layout engine, so matchMedia is stubbed with a controllable fake.
 * `setMatches` flips the result and notifies subscribers, which is exactly what
 * a real viewport resize does.
 */
function installMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const removed: string[] = [];

  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() { return matches; },
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => { listeners.add(cb); },
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
      removed.push(query);
    },
  }));

  return {
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach(cb => cb({ matches: next } as MediaQueryListEvent));
    },
    get listenerCount() { return listeners.size; },
    get removed() { return removed; },
  };
}

describe('useMediaQuery', () => {
  let mm: ReturnType<typeof installMatchMedia>;

  beforeEach(() => { mm = installMatchMedia(false); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reports the current match on first render, with no effect round-trip', () => {
    // The old useState+useEffect version rendered `false` first and corrected
    // itself on mount; the initial value must be right immediately.
    mm = installMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 1023px)'));
    expect(result.current).toBe(true);
  });

  it('reports false when the query does not match', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 1023px)'));
    expect(result.current).toBe(false);
  });

  it('re-renders when the viewport crosses the breakpoint', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 1023px)'));
    expect(result.current).toBe(false);

    act(() => mm.setMatches(true));
    expect(result.current).toBe(true);

    act(() => mm.setMatches(false));
    expect(result.current).toBe(false);
  });

  it('subscribes once and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 1023px)'));
    expect(mm.listenerCount).toBe(1);
    unmount();
    expect(mm.listenerCount).toBe(0);
  });

  it('re-subscribes when the query changes', () => {
    const { result, rerender } = renderHook(({ q }) => useMediaQuery(q), {
      initialProps: { q: '(max-width: 1023px)' },
    });
    expect(result.current).toBe(false);

    act(() => mm.setMatches(true));
    expect(result.current).toBe(true);

    rerender({ q: '(max-width: 767px)' });
    expect(mm.listenerCount).toBe(1);       // old subscription dropped
    expect(result.current).toBe(true);      // still reading the stubbed value
  });
});
