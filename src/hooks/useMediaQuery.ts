import { useCallback, useSyncExternalStore } from 'react';

/**
 * Track a CSS media query.
 *
 * Uses useSyncExternalStore rather than useState + useEffect: matchMedia is an
 * external store, and seeding state from inside an effect meant every mount
 * rendered once with a possibly-stale value before correcting itself.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  // Server snapshot: no viewport to measure, so report "does not match".
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
