import { isDemoMode } from '../../config/appMode';
import { ServiceError, toServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';
import type { CorrectionFields } from './factCorrection';
import { invalidateHealthMemory } from './healthMemoryApi';

/**
 * One result (observation) with its evidence and history, and the person's
 * two actions on it: confirm a held result, or correct it.
 *
 * Reads go through RLS (own rows only). Corrections go through
 * public.correct_fact, which keeps the original as superseded history,
 * computes interpreted values on the server and records the reason; nothing
 * here writes values directly. Confidence is shown only when the reading
 * stored one — it is never estimated.
 */

export type FactOrigin = 'extracted' | 'user_entered' | 'user_corrected';
export type FactReviewStatus = 'unreviewed' | 'confirmed' | 'rejected';

export type FactVersion = {
  id: string;
  name: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  date: string | null;
  origin: FactOrigin;
  reviewStatus: FactReviewStatus;
  /** When this version was recorded. */
  recordedAt: string;
  /** Why the person made this correction (corrections only, when given). */
  correctionReason: string | null;
  supersededAt: string | null;
};

export type FactDetail = FactVersion & {
  /** As the reading stored it (0–1); null when none was stored (e.g. a correction). */
  confidence: number | null;
  /** The reading was held for checking (low confidence, unclear date, or identity not confirmed). */
  heldForReview: boolean;
  /**
   * Held because its report could not be matched to the person (no name or
   * date of birth to compare, or only a partial match). Such results can't be
   * confirmed or corrected here: that would accept the report as theirs.
   */
  identityUnconfirmed: boolean;
  /** In trusted Health Memory: current, not rejected, and passed or confirmed. */
  trusted: boolean;
  sourceText: string | null;
  document: { id: string; name: string } | null;
  pageNumber: number | null;
  /** Set when this version has been corrected: the newer version's id. */
  correctedById: string | null;
  /** Earlier versions this one replaced, newest first. */
  history: FactVersion[];
};

/**
 * The request may or may not have reached the server (e.g. the connection
 * dropped). Not proof of failure: the caller must check the saved state
 * before allowing another attempt.
 */
export class OutcomeUnknownError extends ServiceError {
  readonly outcomeUnknown = true;
  constructor(cause?: unknown) {
    super('network', 'We couldn’t confirm whether this was saved.', { retryable: false, cause });
    this.name = 'OutcomeUnknownError';
  }
}

/** The result changed elsewhere (corrected, marked not correct, report being deleted, or gone): reload it. */
export const isStaleRefusal = (e: unknown): boolean => e instanceof ServiceError && (e.code === 'not_found' || e.code === 'not_available');

export interface FactService {
  getFact(id: string): Promise<FactDetail | null>;
  /** Returns the id of the new, current version. */
  correct(id: string, fields: CorrectionFields, reason: string | null): Promise<string>;
  /** Confirms a result held for checking, unchanged. */
  confirm(id: string): Promise<void>;
}

type FactRow = {
  id: string;
  name_as_written: string;
  value_as_written: string;
  unit_as_written: string | null;
  reference_range_as_written: string | null;
  effective_date: string | null;
  origin: FactOrigin;
  review_status: FactReviewStatus;
  confidence_gate: 'passed' | 'needs_review';
  confidence: number | string | null;
  source_text: string | null;
  document_id: string | null;
  document_page_id: string | null;
  supersedes_id: string | null;
  superseded_at: string | null;
  correction_reason: string | null;
  created_at: string;
};

const FACT_COLUMNS =
  'id, name_as_written, value_as_written, unit_as_written, reference_range_as_written, effective_date, origin, review_status, confidence_gate, confidence, source_text, document_id, document_page_id, supersedes_id, superseded_at, correction_reason, created_at';
/** Enough to show any real chain; a guard against loops, not a product limit. */
const MAX_HISTORY = 25;
const LOAD_ERROR = { code: 'unknown' as const, userMessage: 'We couldn’t load this result. Please try again.', retryable: true };
const SAVE_ERROR = { code: 'save_failed' as const, userMessage: 'We couldn’t save your correction. Please try again.', retryable: true };

/** correct_fact's refusals are written for people; anything else stays generic. */
const STALE_MESSAGES: Record<string, [ServiceError['code'], string]> = {
  'that result was not found': ['not_found', 'This result is no longer available.'],
  'that result has already been corrected — correct the newer version instead': ['not_available', 'This result has already been corrected. The latest version is shown below.'],
  'that result was marked as not correct and cannot be corrected': ['not_available', 'This result was marked as not correct, so it can’t be corrected.'],
  'that report is being deleted': ['not_available', 'This report is being deleted, so its results can’t be changed.'],
};
const CORRECTION_MESSAGES: Record<string, string> = {
  'sign in to correct your records': 'Sign in again to correct your records.',
  'that report has not been confirmed as yours': 'This report hasn’t been confirmed as yours, so its results can’t be corrected yet.',
  'the test name is required': 'Enter the test name as printed on the report.',
  'the value is required': 'Enter the value as printed on the report.',
  'an entry is too long': 'One of the entries is too long.',
  'the reason is too long': 'Keep the reason under 500 characters.',
  'an entry contains characters that are not allowed': 'Remove the special characters and try again.',
  'the date is not valid': 'Check the date: it must be a real date, not in the future.',
  'nothing was changed': 'Nothing has changed. Edit a field to correct it.',
};

/** How long a correction or confirmation may take before its outcome is treated as unknown. */
export const WRITE_TIMEOUT_MS = 20_000;

/**
 * Whether the server actually answered: a Postgres error (5-character
 * SQLSTATE, e.g. 22023, 42501, P0002) or a PostgREST refusal (PGRSTnnn).
 * Such an answer is definite — the statement failed and nothing was written.
 * Anything else (no answer, an aborted or timed-out request, a gateway
 * failure, a transport message such as Expo's "fetch failed …") says nothing
 * about whether the write reached the database.
 */
function serverAnswered(error: unknown): boolean {
  const code = String((error as { code?: unknown } | null)?.code ?? '');
  return /^[0-9A-Z]{5}$/.test(code) || /^PGRST\d+$/.test(code);
}

function correctionError(error: unknown): ServiceError {
  if (!serverAnswered(error)) return new OutcomeUnknownError(error);
  const message = (error as { message?: string } | null)?.message ?? '';
  const key = message.startsWith('correct_fact: ') ? message.slice('correct_fact: '.length) : '';
  const stale = STALE_MESSAGES[key];
  if (stale) return new ServiceError(stale[0], stale[1], { cause: error });
  if (CORRECTION_MESSAGES[key]) return new ServiceError('invalid_input', CORRECTION_MESSAGES[key], { cause: error });
  return toServiceError(error, SAVE_ERROR);
}

function confirmationError(error: unknown): ServiceError {
  if (!serverAnswered(error)) return new OutcomeUnknownError(error);
  if (String((error as { message?: string }).message ?? '').endsWith('this report has not been confirmed as yours')) {
    return new ServiceError('invalid_input', 'This report hasn’t been confirmed as yours, so its results can’t be confirmed yet.', { cause: error });
  }
  return toServiceError(error, SAVE_ERROR);
}

type WriteResult<T> = { data: T | null; error: unknown };
type AbortableRequest<T> = PromiseLike<WriteResult<T>> & { abortSignal?: (signal: AbortSignal) => PromiseLike<WriteResult<T>> };

/**
 * Runs one write with a time limit. On timeout the request is aborted and the
 * outcome is unknown: the caller checks the saved state before saying
 * anything. A response that arrives after the time limit is ignored — it
 * neither refreshes screens nor triggers another attempt (nothing is ever
 * retried automatically), so it can't change what the person was shown. A
 * second correction of the same result can't create a duplicate either: the
 * database refuses to correct a result that has already been corrected.
 */
async function timedWrite<T>(start: () => AbortableRequest<T>): Promise<WriteResult<T>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timed_out'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timed_out');
    }, WRITE_TIMEOUT_MS);
  });
  try {
    const request = start();
    const sent = typeof request.abortSignal === 'function' ? request.abortSignal(controller.signal) : request;
    const result = await Promise.race([Promise.resolve(sent), timedOut]);
    if (result === 'timed_out') throw new OutcomeUnknownError('timed out');
    return result;
  } catch (e) {
    // A thrown transport failure is as ambiguous as a timeout.
    throw e instanceof ServiceError ? e : new OutcomeUnknownError(e);
  } finally {
    clearTimeout(timer);
  }
}

const confidenceOf = (v: number | string | null): number | null => {
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toVersion = (r: FactRow): FactVersion => ({
  id: r.id,
  name: r.name_as_written,
  value: r.value_as_written,
  unit: r.unit_as_written,
  referenceRange: r.reference_range_as_written,
  date: r.effective_date,
  origin: r.origin,
  reviewStatus: r.review_status,
  recordedAt: r.created_at,
  correctionReason: r.correction_reason,
  supersededAt: r.superseded_at,
});

function client() {
  const c = getSupabaseClient();
  if (!c) throw new ServiceError('not_configured', 'Your Health Memory isn’t available right now.');
  return c;
}

export const productionFactService: FactService = {
  async getFact(id) {
    const c = client();
    const { data, error } = await c.from('observations').select(FACT_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw toServiceError(error, LOAD_ERROR);
    if (!data) return null;
    const row = data as FactRow;

    // Earlier versions, following each correction to the one it replaced.
    const history: FactVersion[] = [];
    let previous = row.supersedes_id;
    while (previous && history.length < MAX_HISTORY) {
      const { data: older, error: olderError } = await c.from('observations').select(FACT_COLUMNS).eq('id', previous).maybeSingle();
      if (olderError) throw toServiceError(olderError, LOAD_ERROR);
      if (!older) break;
      history.push(toVersion(older as FactRow));
      previous = (older as FactRow).supersedes_id;
    }

    const [newer, doc, page] = await Promise.all([
      row.superseded_at ? c.from('observations').select('id').eq('supersedes_id', row.id).maybeSingle() : { data: null, error: null },
      row.document_id ? c.from('documents').select('id, original_filename, identity_check').eq('id', row.document_id).maybeSingle() : { data: null, error: null },
      row.document_page_id ? c.from('document_pages').select('page_number').eq('id', row.document_page_id).maybeSingle() : { data: null, error: null },
    ]);
    for (const r of [newer, doc, page]) if (r.error) throw toServiceError(r.error, LOAD_ERROR);

    const heldForReview = row.confidence_gate === 'needs_review' && row.review_status !== 'confirmed';
    const docRow = doc.data as { id: string; original_filename: string; identity_check?: string | null } | null;
    return {
      ...toVersion(row),
      confidence: confidenceOf(row.confidence),
      heldForReview,
      identityUnconfirmed: heldForReview && (docRow?.identity_check === 'no_identifiers' || docRow?.identity_check === 'unverifiable'),
      trusted: row.superseded_at === null && row.review_status !== 'rejected' && !heldForReview,
      sourceText: row.source_text,
      document: docRow ? { id: docRow.id, name: docRow.original_filename } : null,
      pageNumber: (page.data as { page_number: number } | null)?.page_number ?? null,
      correctedById: (newer.data as { id: string } | null)?.id ?? null,
      history,
    };
  },

  async correct(id, fields, reason) {
    const c = client();
    const { data, error } = await timedWrite<string>(
      () => c.rpc('correct_fact', { p_table: 'observations', p_fact_id: id, p_fields: fields, p_reason: reason }) as unknown as AbortableRequest<string>,
    );
    if (error) throw correctionError(error);
    // No error but no new id: we can't tell what was saved.
    if (typeof data !== 'string') throw new OutcomeUnknownError();
    invalidateHealthMemory();
    return data;
  },

  async confirm(id) {
    const c = client();
    const { data, error } = await timedWrite<{ id: string }[]>(
      () =>
        c.from('observations').update({ review_status: 'confirmed' }).eq('id', id).is('superseded_at', null).select('id') as unknown as AbortableRequest<
          { id: string }[]
        >,
    );
    if (error) throw confirmationError(error);
    if (!data || data.length === 0) throw new ServiceError('not_found', 'This result is no longer available.');
    invalidateHealthMemory();
  },
};

/** The demo shows sample reports only; their results can't be corrected. */
const demoFactService: FactService = {
  async getFact() {
    return null;
  },
  async correct() {
    throw new ServiceError('not_available', 'Correcting results isn’t available in the demo.');
  },
  async confirm() {
    throw new ServiceError('not_available', 'Confirming results isn’t available in the demo.');
  },
};

export const factService: FactService = isDemoMode ? demoFactService : productionFactService;
