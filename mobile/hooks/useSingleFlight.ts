import { useCallback, useRef } from 'react';

/**
 * Runs at most one task at a time: a call made while another is still in
 * flight is ignored. Guards sign-in actions against double taps (a second
 * tap must never start a second OAuth session or a second code check). The
 * guard is released however the task ends, including when it throws.
 */
export function useSingleFlight() {
  const busy = useRef(false);
  return useCallback(async (task: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await task();
    } finally {
      busy.current = false;
    }
  }, []);
}
