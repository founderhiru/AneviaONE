import { useSyncExternalStore } from 'react';

/**
 * Whether this app session's launch splash has finished. The root layout
 * marks it once the splash has faded out; screens that sit underneath it
 * (Welcome) wait for it before playing their own entrance, so the entrance
 * is seen rather than spent behind the splash. It never replays the splash
 * or delays launch: it only says when the splash is gone.
 */
let done = false;
const listeners = new Set<() => void>();

export function markLaunchSplashDone() {
  if (done) return;
  done = true;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLaunchSplashDone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => done,
    () => done,
  );
}
