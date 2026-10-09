import { consentService } from '../consent/consentService';
import { invalidateHealthMemory } from '../health/healthMemoryApi';
import { ServiceError } from '../serviceError';
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS, processingService, startReading } from './processingService';

/**
 * Automatic reading. Nobody taps "Read report": when the app opens or
 * refreshes, documents waiting to be read (processingService.listAutoReads)
 * are sent to the server — only when AI consent is already recorded; without
 * it the caller shows the consent once and runs this again after "Allow".
 * The server still checks session, ownership and consent on every request,
 * claims each document atomically, and fingerprints results so nothing is
 * added twice.
 */

export type AutoReadStatus = {
  /** Documents being read right now. */
  reading: number;
  /** Documents that are waiting only for consent. */
  waitingForConsent: number;
  /** A read finished while the app was watching (until the next sweep). */
  justFinished: boolean;
};

let status: AutoReadStatus = { reading: 0, waitingForConsent: 0, justFinished: false };
const listeners = new Set<() => void>();
const watching = new Set<string>();
const timers = new Set<ReturnType<typeof setTimeout>>();
let sweep: Promise<AutoReadStatus> | null = null;

function update(patch: Partial<AutoReadStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((listener) => listener());
}

export function getAutoReadStatus(): AutoReadStatus {
  return status;
}

export function subscribeAutoRead(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Watches one document until it is no longer being read. */
function watch(documentId: string) {
  if (watching.has(documentId)) return;
  watching.add(documentId);
  update({ reading: watching.size });
  const startedAt = Date.now();
  const done = (ready: boolean) => {
    watching.delete(documentId);
    update({ reading: watching.size, justFinished: status.justFinished || ready });
    // New trusted records: every screen built from Health Memory reloads.
    if (ready) invalidateHealthMemory();
  };
  const later = () => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      tick();
    }, POLL_INTERVAL_MS);
    timers.add(timer);
  };
  const tick = async () => {
    if (!watching.has(documentId)) return;
    try {
      const state = await processingService.getState(documentId);
      if (state.phase !== 'processing') return done(state.phase === 'ready');
    } catch {
      // A blip while watching — keep trying until the timeout.
    }
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) return done(false);
    later();
  };
  later();
}

/**
 * Starts reading everything that is waiting. Safe to call on every app open,
 * refresh or foreground: overlapping calls share one sweep, documents
 * already being read are only watched, and completed or permanently failed
 * documents are never picked (see selectAutoReads).
 */
export function readWaitingDocuments(): Promise<AutoReadStatus> {
  if (sweep) return sweep;
  sweep = (async () => {
    update({ justFinished: false });
    const reads = await processingService.listAutoReads();
    if (!reads.length) {
      update({ waitingForConsent: 0 });
      return status;
    }
    // No AI call without consent: nothing is sent until it is recorded.
    const consent = await consentService.getAiConsent();
    if (!consent.granted) {
      update({ waitingForConsent: reads.length });
      return status;
    }
    update({ waitingForConsent: 0 });
    for (const read of reads) {
      if (watching.has(read.documentId)) continue;
      try {
        // Never a re-read: automatic reading only starts documents not yet read.
        const result = await startReading(read.documentId);
        if (result === 'processing') watch(read.documentId);
      } catch (error) {
        // Consent changed since the check: ask again, send nothing more.
        if (error instanceof ServiceError && error.code === 'consent_required') {
          update({ waitingForConsent: reads.length });
          break;
        }
        // Anything else stays as it is; its own screen shows the status.
      }
    }
    return status;
  })()
    .catch(() => status)
    .finally(() => {
      sweep = null;
    });
  return sweep;
}

/** Records consent (the same versioned consent as the report screen), then reads. */
export async function allowAndReadWaitingDocuments(): Promise<AutoReadStatus> {
  await consentService.grantAiConsent();
  return readWaitingDocuments();
}

/** Tests only. */
export function resetAutoReadForTests() {
  status = { reading: 0, waitingForConsent: 0, justFinished: false };
  timers.forEach(clearTimeout);
  timers.clear();
  watching.clear();
  sweep = null;
}
