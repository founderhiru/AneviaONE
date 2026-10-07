import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import {
  allowAndReadWaitingDocuments,
  getAutoReadStatus,
  readWaitingDocuments,
  subscribeAutoRead,
} from '../services/processing/autoRead';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../services/serviceError';

/** "Not now" holds for the rest of this app session — the consent is asked once. */
let declinedThisSession = false;

/**
 * Reads waiting documents when the app opens, comes back to the foreground,
 * or is refreshed (see services/processing/autoRead.ts). Exposes whether to
 * show the consent, and the reading progress.
 */
export function useAutoRead() {
  const status = useSyncExternalStore(subscribeAutoRead, getAutoReadStatus);
  const [declined, setDeclined] = useState(declinedThisSession);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readWaitingDocuments();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') readWaitingDocuments();
    });
    return () => subscription.remove();
  }, []);

  const allow = useCallback(async () => {
    setError(null);
    try {
      await allowAndReadWaitingDocuments();
    } catch (e) {
      setError(e instanceof ServiceError ? e.userMessage : GENERIC_ERROR_MESSAGE);
    }
  }, []);

  const decline = useCallback(() => {
    declinedThisSession = true;
    setDeclined(true);
  }, []);

  return {
    ...status,
    showConsent: status.waitingForConsent > 0 && !declined,
    error,
    allow,
    decline,
    /** Pull to refresh. */
    refresh: readWaitingDocuments,
  };
}

/** Tests only. */
export function resetAutoReadConsentPromptForTests() {
  declinedThisSession = false;
}
