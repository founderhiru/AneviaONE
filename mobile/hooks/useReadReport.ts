import { useCallback, useEffect, useRef, useState } from 'react';

import { consentService } from '../services/consent/consentService';
import { invalidateHealthMemory } from '../services/health/healthMemoryApi';
import { processingService, type ProcessingState } from '../services/processing/processingService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../services/serviceError';

export const POLL_INTERVAL_MS = 2000;
/** After this long the screen stops waiting (reading continues on the server). */
export const POLL_TIMEOUT_MS = 4 * 60 * 1000;

export type ReadReportView =
  | { kind: 'loading' }
  | { kind: 'consent' }
  | { kind: 'state'; state: ProcessingState }
  /** Still reading after POLL_TIMEOUT_MS — the person can leave and come back. */
  | { kind: 'slow' }
  | { kind: 'error'; message: string };

/**
 * Drives reading one stored report: consent → ask the server → watch the
 * document's status until it is ready or fails.
 *
 * `autoStart` (the Add Record flow) starts reading straight after upload
 * when consent is already recorded; otherwise the consent screen is shown.
 */
export function useReadReport(documentId: string | null, options: { autoStart?: boolean } = {}) {
  const [view, setView] = useState<ReadReportView>({ kind: 'loading' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  /** "Read again" was asked for: after consent is given, re-read (don't just reopen). */
  const wantsReprocess = useRef(false);
  const autoStart = options.autoStart ?? false;

  const stopPolling = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const poll = useCallback(
    (id: string, startedAt: number) => {
      stopPolling();
      const tick = async () => {
        try {
          const state = await processingService.getState(id);
          if (!mounted.current) return;
          if (state.phase === 'processing') {
            if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
              setView({ kind: 'slow' });
              return;
            }
            setView({ kind: 'state', state });
            timer.current = setTimeout(tick, POLL_INTERVAL_MS);
            return;
          }
          setView({ kind: 'state', state });
        } catch {
          // A blip while watching — keep trying until the timeout.
          if (mounted.current && Date.now() - startedAt <= POLL_TIMEOUT_MS) timer.current = setTimeout(tick, POLL_INTERVAL_MS);
        }
      };
      timer.current = setTimeout(tick, POLL_INTERVAL_MS);
    },
    []
  );

  const begin = useCallback(
    async (id: string, retry = false, reprocess = false) => {
      setView({ kind: 'state', state: { phase: 'processing' } });
      try {
        const result = await processingService.start(id, { retry, reprocess });
        if (!mounted.current) return;
        // A re-read reports "completed" until the server has claimed it again.
        if (result === 'completed' && !reprocess) setView({ kind: 'state', state: await processingService.getState(id) });
        else poll(id, Date.now());
      } catch (error) {
        if (!mounted.current) return;
        if (error instanceof ServiceError && error.code === 'consent_required') setView({ kind: 'consent' });
        else setView({ kind: 'error', message: error instanceof ServiceError ? error.userMessage : GENERIC_ERROR_MESSAGE });
      }
    },
    [poll]
  );

  /** Loads the current state; starts reading if asked to and allowed. */
  const refresh = useCallback(async () => {
    if (!documentId) return;
    try {
      const state = await processingService.getState(documentId);
      if (!mounted.current) return;
      if (state.phase === 'processing') {
        setView({ kind: 'state', state });
        poll(documentId, Date.now());
        return;
      }
      if (state.phase === 'not_started' && autoStart) {
        const consent = await consentService.getAiConsent();
        if (!mounted.current) return;
        if (consent.granted) await begin(documentId);
        else setView({ kind: 'consent' });
        return;
      }
      setView({ kind: 'state', state });
    } catch (error) {
      if (mounted.current) setView({ kind: 'error', message: error instanceof ServiceError ? error.userMessage : GENERIC_ERROR_MESSAGE });
    }
  }, [documentId, autoStart, begin, poll]);

  // New trusted records: Health Memory, Timeline, Trends and What Changed must refetch.
  const ready = view.kind === 'state' && view.state.phase === 'ready';
  useEffect(() => {
    if (ready) invalidateHealthMemory();
  }, [ready]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
      stopPolling();
    };
  }, [refresh]);

  return {
    view,
    /** "Read again" on a completed report: same consent rule, server-side
     * reprocess (fingerprints keep results from being duplicated). */
    async readAgain() {
      if (!documentId) return;
      try {
        const consent = await consentService.getAiConsent();
        if (!consent.granted) {
          wantsReprocess.current = true;
          setView({ kind: 'consent' });
          return;
        }
      } catch (error) {
        setView({ kind: 'error', message: error instanceof ServiceError ? error.userMessage : GENERIC_ERROR_MESSAGE });
        return;
      }
      wantsReprocess.current = true;
      await begin(documentId, false, true);
      wantsReprocess.current = false;
    },
    /** "Read this report" / Retry: asks for consent first if it isn't recorded. */
    async read(retry = false) {
      if (!documentId) return;
      try {
        const consent = await consentService.getAiConsent();
        if (!consent.granted) {
          setView({ kind: 'consent' });
          return;
        }
      } catch (error) {
        setView({ kind: 'error', message: error instanceof ServiceError ? error.userMessage : GENERIC_ERROR_MESSAGE });
        return;
      }
      await begin(documentId, retry);
    },
    /** Records consent (both types, current version), then starts reading. */
    async allow() {
      if (!documentId) return;
      try {
        await consentService.grantAiConsent();
      } catch (error) {
        setView({ kind: 'error', message: error instanceof ServiceError ? error.userMessage : GENERIC_ERROR_MESSAGE });
        return;
      }
      const reprocess = wantsReprocess.current;
      wantsReprocess.current = false;
      await begin(documentId, !reprocess, reprocess);
    },
    /** Declining keeps the original stored; nothing is read. */
    decline() {
      wantsReprocess.current = false;
      setView({ kind: 'state', state: { phase: 'not_started' } });
    },
    refresh,
  };
}
