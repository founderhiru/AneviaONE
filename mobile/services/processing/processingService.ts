import { isDemoMode } from '../../config/appMode';
import { ServiceError, toServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';

/**
 * Reading a stored report (Gate 1). The app only ASKS the server to read a
 * document; the `process-document` Edge Function verifies the session,
 * ownership and consent, and is the only thing that moves a document past
 * `uploaded`. The app then watches the document's status.
 */

/** Mirrors documents.failure_kind. */
export type FailureKind = 'transient' | 'provider' | 'validation' | 'unsupported' | 'identity_mismatch' | 'consent_required';

export type ProcessingState =
  /** `awaitingRead: false` — not read, but not something to start reading
   * automatically (any status other than `uploaded`). */
  | { phase: 'not_started'; awaitingRead?: false }
  | { phase: 'processing' }
  /** `identityUnconfirmed`: results are held because the report couldn't be
   * matched to the person (it names no one, or only weakly), not for clarity. */
  | { phase: 'ready'; resultsAdded: number; needsReview: number; alreadyInMemory: number; identityUnconfirmed?: boolean }
  | { phase: 'failed'; reason: FailureKind | null; message: string; canRetry: boolean }
  /** The report may belong to someone else: nothing was added; the person decides. */
  | { phase: 'needs_review'; message: string };

export const MAX_ATTEMPTS = 3;
export const POLL_INTERVAL_MS = 2000;
/** After this long the app stops waiting (reading continues on the server). */
export const POLL_TIMEOUT_MS = 4 * 60 * 1000;

const RETRYABLE: FailureKind[] = ['transient', 'provider', 'validation', 'consent_required'];

export const FAILURE_TITLE = 'Couldn’t read this report yet.';
const FALLBACK_REASON = 'Something went wrong while reading it. Your original is stored safely.';

export interface ProcessingService {
  /** Asks the server to read the document. `reprocess` re-reads a completed
   * one and is ONLY for an explicit, confirmed request by the person ("Read
   * again") — never for viewing, refreshing or anything automatic, because a
   * re-read replaces that report's results in Health Memory.
   * Throws ServiceError('consent_required') without consent. */
  start(documentId: string, options?: { retry?: boolean; reprocess?: boolean }): Promise<'processing' | 'completed'>;
  getState(documentId: string): Promise<ProcessingState>;
  /** The person's documents that should be read without anyone asking (selectAutoReads). */
  listAutoReads(): Promise<AutoRead[]>;
}

/** A document to read without anyone asking: never a completed one (never a re-read). */
export type AutoRead = { documentId: string };

type AutoReadDocumentRow = { id: string; status: string; failure_kind: FailureKind | null; processing_attempts: number | null };

/**
 * Which documents to read automatically (on app open, resume or refresh):
 *   • `uploaded` — never read yet;
 *   • `failed` only because consent was missing, while tries remain (the
 *     server's own retry limit) — never other failures, so nothing is
 *     retried over and over.
 * A completed document is NEVER picked: opening the app or viewing a report
 * must not re-read it (a re-read replaces its results in Health Memory). Only
 * the person's confirmed "Read again" re-reads a report.
 */
export function selectAutoReads(documents: AutoReadDocumentRow[]): AutoRead[] {
  const reads: AutoRead[] = [];
  for (const doc of documents) {
    if (doc.status === 'uploaded') reads.push({ documentId: doc.id });
    else if (doc.status === 'failed' && doc.failure_kind === 'consent_required' && (doc.processing_attempts ?? 0) < MAX_ATTEMPTS) {
      reads.push({ documentId: doc.id });
    }
  }
  return reads;
}

type DocumentStateRow = {
  status: string;
  failure_kind: FailureKind | null;
  processing_error: string | null;
  processing_attempts: number | null;
  identity_check?: string | null;
};

export function toProcessingState(
  row: DocumentStateRow,
  run: { facts_written: number | null; facts_needs_review: number | null; facts_duplicate: number | null } | null
): ProcessingState {
  switch (row.status) {
    case 'uploaded':
      return { phase: 'not_started' };
    case 'processing':
    case 'extracted':
    case 'validated':
      return { phase: 'processing' };
    case 'completed': {
      const written = run?.facts_written ?? 0;
      const review = run?.facts_needs_review ?? 0;
      const identityUnconfirmed = row.identity_check === 'no_identifiers' || row.identity_check === 'unverifiable';
      return {
        phase: 'ready',
        resultsAdded: written - review,
        needsReview: review,
        alreadyInMemory: run?.facts_duplicate ?? 0,
        ...(identityUnconfirmed ? { identityUnconfirmed: true } : {}),
      };
    }
    case 'failed': {
      const reason = row.failure_kind;
      if (reason === 'identity_mismatch') return { phase: 'needs_review', message: row.processing_error ?? 'This report may belong to someone else.' };
      // Same rule the server uses when claiming a retry: retryable kinds, fewer than MAX_ATTEMPTS tries.
      const canRetry = reason !== null && RETRYABLE.includes(reason) && (row.processing_attempts ?? 0) < MAX_ATTEMPTS;
      return { phase: 'failed', reason, message: row.processing_error ?? FALLBACK_REASON, canRetry };
    }
    default:
      // Anything else (an unfinished upload, a deletion in progress, a status
      // this app doesn't know) is never a reason to start reading.
      return { phase: 'not_started', awaitingRead: false };
  }
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new ServiceError('not_configured', 'Reading reports isn’t available right now.');
  return client;
}

/** The function's JSON error body, if the failure was an HTTP response. */
async function httpError(error: unknown): Promise<{ status: number; code: string | null } | null> {
  const response = (error as { context?: unknown })?.context;
  if (!(response instanceof Response)) return null;
  const body = await response.json().catch(() => null);
  return { status: response.status, code: typeof body?.error === 'string' ? body.error : null };
}

export const supabaseProcessingService: ProcessingService = {
  async start(documentId, options = {}) {
    const { data, error } = await requireClient().functions.invoke('process-document', {
      // A re-read is named explicitly (`operation`), so the server can refuse
      // to re-read a completed report for any request that isn't one.
      // `reprocess` stays for servers that predate `operation`.
      body: options.reprocess ? { document_id: documentId, operation: 'reread', reprocess: true } : { document_id: documentId },
    });
    if (!error) return data?.status === 'completed' ? 'completed' : 'processing';
    const http = await httpError(error);
    if (http?.status === 412) {
      throw new ServiceError('consent_required', 'Allow report reading to add this report to your Health Memory.');
    }
    // Already being read (e.g. a second tap) — just keep watching it.
    if (http?.status === 409 && http.code === 'already_processing') return 'processing';
    if (http?.status === 409) {
      throw new ServiceError('not_available', options.retry ? 'This report can’t be read again right now.' : 'This report can’t be read right now.');
    }
    if (http?.status === 401) throw new ServiceError('not_signed_in', 'Please sign in again to continue.');
    if (http?.status === 404) throw new ServiceError('not_found', 'We couldn’t find this document.');
    throw toServiceError(error, { code: 'unknown', userMessage: 'We couldn’t start reading this report. Please try again.', retryable: true });
  },

  async getState(documentId) {
    const client = requireClient();
    const { data: row, error } = await client
      .from('documents')
      .select('status, failure_kind, processing_error, processing_attempts, identity_check')
      .eq('id', documentId)
      .maybeSingle();
    if (error) throw toServiceError(error, { code: 'unknown', userMessage: 'We couldn’t check this report. Please try again.', retryable: true });
    if (!row) throw new ServiceError('not_found', 'We couldn’t find this document.');
    let run = null;
    if (row.status === 'completed') {
      const { data } = await client
        .from('extraction_runs')
        .select('facts_written, facts_needs_review, facts_duplicate')
        .eq('document_id', documentId)
        .eq('status', 'succeeded')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      run = data;
    }
    return toProcessingState(row as DocumentStateRow, run);
  },

  async listAutoReads() {
    const client = requireClient();
    // RLS: only the signed-in person's rows. Completed documents aren't even asked for.
    const { data: docs, error } = await client
      .from('documents')
      .select('id, status, failure_kind, processing_attempts')
      .in('status', ['uploaded', 'failed']);
    if (error) throw toServiceError(error, { code: 'unknown', userMessage: 'We couldn’t check your reports. Please try again.', retryable: true });
    return selectAutoReads((docs ?? []) as AutoReadDocumentRow[]);
  },
};

/** DEMO MODE: a short simulated read; no network, nothing leaves the device. */
const demoStates = new Map<string, { startedAt: number }>();
export const DEMO_PROCESSING_MS = 1500;
export const demoProcessingService: ProcessingService = {
  async start(documentId, options = {}) {
    if (!demoStates.has(documentId) || options.reprocess) demoStates.set(documentId, { startedAt: Date.now() });
    return 'processing';
  },
  async getState(documentId) {
    const state = demoStates.get(documentId);
    if (!state) return { phase: 'not_started' };
    if (Date.now() - state.startedAt < DEMO_PROCESSING_MS) return { phase: 'processing' };
    return { phase: 'ready', resultsAdded: 2, needsReview: 0, alreadyInMemory: 0 };
  },
  // Demo uploads are summarised on the spot; nothing waits to be read.
  async listAutoReads() {
    return [];
  },
};

export const processingService: ProcessingService = isDemoMode ? demoProcessingService : supabaseProcessingService;

const starting = new Map<string, Promise<'processing' | 'completed'>>();
/**
 * The one way the app asks for a read: while a request for a document is in
 * flight, asking again (the upload screen, the document screen and the
 * background sweep can overlap) joins it instead of sending another. The
 * server's atomic claim is still what guarantees a single read.
 */
export function startReading(documentId: string, options: { retry?: boolean; reprocess?: boolean } = {}) {
  const pending = starting.get(documentId);
  if (pending) return pending;
  const request = processingService.start(documentId, options).finally(() => starting.delete(documentId));
  starting.set(documentId, request);
  return request;
}
