import { useCallback, useEffect, useState } from 'react';

import { APPLE_HEALTH_ENABLED } from '../config/appleHealthFlag';
import {
  connectAppleHealth,
  disconnectAppleHealth,
  getAppleHealthConnection,
  isAppleHealthSupported,
  readAppleHealthWeek,
  type AppleHealthWeek,
} from '../services/connected/appleHealth';

export type AppleHealthState = {
  /** The build offers it AND this iPhone can use it. */
  offered: boolean;
  connected: boolean;
  week: AppleHealthWeek | null;
  busy: boolean;
  /** A plain message when connecting or reading did not work. */
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
};

/** Apple Health for the signed-in person's OWN record on this iPhone. Nothing here leaves the phone. */
export function useAppleHealth(userId: string | null | undefined): AppleHealthState {
  const offered = APPLE_HEALTH_ENABLED && isAppleHealthSupported();
  const [connected, setConnected] = useState(false);
  const [week, setWeek] = useState<AppleHealthWeek | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async () => {
    try {
      setWeek(await readAppleHealthWeek());
      setError(null);
    } catch {
      setError('We couldn’t read from Apple Health just now.');
    }
  }, []);

  useEffect(() => {
    let live = true;
    if (!offered) return;
    getAppleHealthConnection(userId).then(async (c) => {
      if (!live) return;
      setConnected(!!c);
      if (c) await read();
    });
    return () => {
      live = false;
    };
  }, [offered, userId, read]);

  const connect = useCallback(async () => {
    if (!offered || !userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await connectAppleHealth(userId);
      setConnected(ok);
      if (ok) await read();
      else setError('Apple Health isn’t available on this iPhone.');
    } catch {
      setError('Apple Health didn’t connect. Nothing was changed — please try again.');
    } finally {
      setBusy(false);
    }
  }, [offered, userId, busy, read]);

  const disconnect = useCallback(async () => {
    await disconnectAppleHealth();
    setConnected(false);
    setWeek(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!connected || busy) return;
    setBusy(true);
    await read();
    setBusy(false);
  }, [connected, busy, read]);

  return { offered, connected, week, busy, error, connect, disconnect, refresh };
}
