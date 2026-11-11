import { useCallback, useEffect, useRef, useState } from 'react';

import { ServiceError } from '../services/serviceError';
import { obligationsService, type NewObligation } from '../services/obligations/obligationsService';
import { addDays, visibleOpen, type Obligation } from '../services/obligations/comingUp';

const messageOf = (e: unknown) => (e instanceof ServiceError ? e.userMessage : 'That didn’t go through. Nothing was changed — please try again.');

type Loaded = { subjectId: string | null; items: Obligation[]; error: string | null };

/**
 * The open reminders for one person (the active person on Home). Reloads when the
 * person changes, and never shows one person's reminders while another is on screen.
 * Changes are saved first and then reloaded, so what people see is what is stored.
 */
export function useObligations(subjectId: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const latest = useRef(subjectId);
  useEffect(() => {
    latest.current = subjectId;
  }, [subjectId]);

  const load = useCallback(async () => {
    const asked = subjectId;
    try {
      const items = await obligationsService.list(asked);
      if (latest.current === asked) setLoaded({ subjectId: asked, items, error: null });
    } catch (e) {
      if (latest.current === asked) {
        setLoaded((prev) => ({ subjectId: asked, items: prev && prev.subjectId === asked ? prev.items : [], error: messageOf(e) }));
      }
    }
  }, [subjectId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setActionError(null);
      try {
        await action();
        await load();
        return true;
      } catch (e) {
        setActionError(messageOf(e));
        return false;
      }
    },
    [load],
  );

  const current = loaded && loaded.subjectId === subjectId ? loaded : null;
  return {
    visible: current ? visibleOpen(current.items, new Date()) : null,
    loadError: current?.error ?? null,
    actionError,
    clearActionError: () => setActionError(null),
    reload: load,
    add: (input: NewObligation) => run(() => obligationsService.add(input)),
    markDone: (id: string) => run(() => obligationsService.markDone(id)),
    snoozeWeek: (id: string) => run(() => obligationsService.snooze(id, addDays(new Date(), 7))),
    dismiss: (id: string) => run(() => obligationsService.dismiss(id)),
  };
}
