/**
 * process-document — the trusted server flow. Dependency-injected so every
 * step can be tested with fakes (no network, no database).
 *
 *  1. authenticate (JWT)            2. identity from the JWT only
 *  3. parse body                    4. ownership lookup (filtered by JWT user)
 *  5. provider-approval gate        6. consent gate (server-side, latest rows)
 *  7. atomic claim (RPC)            8. start run
 *  9. download from private bucket 10. SHA-256 of the original
 * 11. page text (text layer only)  12. scanned detection
 * 13. deterministic chunking       14. StructuredExtractor per chunk
 * 15. validate + normalise + gate  16. atomic commit (RPC) or fail (RPC)
 *
 * Nothing here logs page text, quotes, values, prompts or provider output.
 */
import { CONSENT_POLICY_VERSION, LIMITS, PIPELINE_VERSION, PROMPT_VERSION, REQUIRED_CONSENTS, type RuntimeConfig } from '../_shared/config.ts';
import { chunkPages, formatChunkForPrompt } from '../_shared/chunking.ts';
import { buildCommitPayload, mergeExtractions, type CommitPayload } from '../_shared/pipeline.ts';
import { parseExtraction, type RawExtraction } from '../_shared/schema.ts';
import type { FailureCode, FailureInfo, IdentityCheck, RunStats } from '../_shared/types.ts';
import { ExtractorError, type StructuredExtractor } from '../_shared/providers/extractor.ts';
import { judgeTextLayer, PdfError, type PageTextProvider } from '../_shared/providers/pageText.ts';

// ------------------------------------------------------------------ contracts
export type DocumentRow = {
  id: string;
  status: string;
  storage_bucket: string;
  storage_path: string;
  file_size_bytes: number;
  mime_type: string;
};
export type ConsentRow = { consent_type: string; granted: boolean; policy_version: string };
export type ClaimResult =
  | { claimed: true; attempt: number; previous_status: string }
  | { claimed: false; reason: string; failure_code?: string };

export interface ProcessDb {
  /** Must filter by BOTH document id and user id. */
  getDocument(userId: string, documentId: string): Promise<DocumentRow | null>;
  /** Latest decision per consent type for this user. */
  getLatestConsents(userId: string): Promise<ConsentRow[]>;
  getProfile(userId: string): Promise<{ fullName: string | null; dateOfBirth: string | null }>;
  claim(documentId: string, userId: string, reprocess: boolean, maxAttempts: number): Promise<ClaimResult>;
  startRun(documentId: string, userId: string, meta: { model: string; promptVersion: string; pipelineVersion: string }): Promise<string>;
  fail(args: { documentId: string; runId: string | null; info: FailureInfo; identity: IdentityCheck | null; stats: RunStats }): Promise<void>;
  commit(documentId: string, runId: string, payload: CommitPayload): Promise<unknown>;
}

export type LogEvent = {
  event: string;
  document_id?: string;
  run_id?: string;
  status?: string;
  code?: string;
  attempt?: number;
  ms?: number;
  pages?: number;
  chunks?: number;
  input_tokens?: number;
  output_tokens?: number;
  model?: string;
};

export type Deps = {
  config: RuntimeConfig;
  /** Verifies the bearer token and returns the user id, or null. */
  authenticate(authorizationHeader: string | null): Promise<string | null>;
  db: ProcessDb;
  download(bucket: string, path: string): Promise<Uint8Array>;
  pageText: PageTextProvider;
  extractor: StructuredExtractor;
  sha256(bytes: Uint8Array): Promise<string>;
  now(): number;
  log(e: LogEvent): void;
  /** Wall-clock budget for one invocation (ms). */
  budgetMs?: number;
};

// ------------------------------------------------------------ failure catalog
const MESSAGES: Record<FailureCode, { kind: FailureInfo['kind']; retryable: boolean; message: string }> = {
  scanned_pdf: { kind: 'unsupported', retryable: false, message: "Scanned PDFs aren't supported yet." },
  invalid_pdf: { kind: 'unsupported', retryable: false, message: "This file doesn't look like a readable PDF." },
  encrypted_pdf: { kind: 'unsupported', retryable: false, message: 'This PDF is password-protected. Remove the password and upload it again.' },
  document_too_large: { kind: 'unsupported', retryable: false, message: 'This report has too many pages to read yet.' },
  patient_mismatch: { kind: 'permanent', retryable: false, message: "This report seems to be for a different person than your profile, so it wasn't added." },
  no_results_found: { kind: 'permanent', retryable: false, message: "We couldn't find any health results in this report." },
  evidence_validation_failed: { kind: 'permanent', retryable: false, message: "We couldn't confirm the results against the report text, so nothing was added." },
  extraction_invalid_output: { kind: 'provider', retryable: true, message: 'Reading this report did not finish. Please try again.' },
  extraction_too_large: { kind: 'permanent', retryable: false, message: 'This report is too detailed to read in one go yet.' },
  provider_unavailable: { kind: 'transient', retryable: true, message: 'The reading service is busy right now. Please try again in a few minutes.' },
  provider_auth: { kind: 'provider', retryable: true, message: 'Reading is temporarily unavailable. Please try again later.' },
  provider_rejected: { kind: 'provider', retryable: false, message: "We couldn't read this report." },
  storage_download_failed: { kind: 'transient', retryable: true, message: 'We could not open the uploaded file. Please try again.' },
  processing_timeout: { kind: 'transient', retryable: true, message: 'Reading this report took too long. Please try again.' },
  internal_error: { kind: 'transient', retryable: true, message: 'Something went wrong on our side. Please try again.' },
};

export function failureInfo(code: FailureCode): FailureInfo {
  const m = MESSAGES[code];
  return { code, kind: m.kind, retryable: m.retryable, userMessage: m.message };
}

class StepFailure extends Error {
  constructor(readonly code: FailureCode, readonly identity: IdentityCheck | null = null) {
    super(code);
  }
}

// -------------------------------------------------------------------- helpers
const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function missingConsents(rows: ConsentRow[]): string[] {
  return REQUIRED_CONSENTS.filter((type) => {
    const row = rows.find((r) => r.consent_type === type);
    return !row || row.granted !== true || row.policy_version !== CONSENT_POLICY_VERSION;
  });
}

function classifyError(e: unknown): FailureCode {
  if (e instanceof StepFailure) return e.code;
  if (e instanceof PdfError) return e.code;
  if (e instanceof ExtractorError) return e.code;
  return 'internal_error';
}

// ----------------------------------------------------------------------- main
export function createHandler(deps: Deps) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    // 1–2. Identity comes from the verified JWT. A client-supplied user id is never read.
    const userId = await deps.authenticate(req.headers.get('authorization')).catch(() => null);
    if (!userId) return json(401, { error: 'unauthorized' });

    // 3. Body
    let body: { document_id?: unknown; reprocess?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'bad_request' });
    }
    const documentId = typeof body.document_id === 'string' && UUID.test(body.document_id) ? body.document_id.toLowerCase() : null;
    if (!documentId) return json(400, { error: 'bad_request' });
    const reprocess = body.reprocess === true;

    // 4. Ownership (a document that is not yours looks exactly like one that does not exist).
    const doc = await deps.db.getDocument(userId, documentId).catch(() => 'error' as const);
    if (doc === 'error') return json(500, { error: 'internal_error' });
    if (!doc) return json(404, { error: 'not_found' });

    // 5. Provider data-flow gate (docs/AI_DATA_FLOW.md). Nothing is sent, nothing is claimed.
    if (!deps.config.dataFlowApproved) return json(503, { error: 'processing_not_enabled' });

    // 6. Consent gate — checked by the server on every call; the app is not trusted.
    const consents = await deps.db.getLatestConsents(userId).catch(() => null);
    if (!consents) return json(500, { error: 'internal_error' });
    const missing = missingConsents(consents);
    if (missing.length > 0) return json(403, { error: 'consent_required', missing });

    // 7. Atomic claim: eligibility + status move happen in one locked database call.
    const claim = await deps.db.claim(documentId, userId, reprocess, LIMITS.maxAttempts).catch(() => null);
    if (!claim) return json(500, { error: 'internal_error' });
    if (!claim.claimed) {
      const status = claim.reason === 'not_found' ? 404 : 409;
      return json(status, { error: claim.reason === 'not_found' ? 'not_found' : 'not_claimable', reason: claim.reason, failure_code: claim.failure_code ?? null });
    }

    const started = deps.now();
    const deadline = started + (deps.budgetMs ?? 110_000);
    const stats: RunStats = {};
    let runId: string | null = null;
    let identity: IdentityCheck | null = null;
    deps.log({ event: 'claimed', document_id: documentId, attempt: claim.attempt });

    try {
      // 8. Run record
      runId = await deps.db.startRun(documentId, userId, {
        model: deps.config.anthropicModel, promptVersion: PROMPT_VERSION, pipelineVersion: PIPELINE_VERSION,
      });

      // 9–10. Download from the private bucket (server only) and hash the original.
      let bytes: Uint8Array;
      try {
        bytes = await deps.download(doc.storage_bucket, doc.storage_path);
      } catch {
        throw new StepFailure('storage_download_failed');
      }
      const contentSha256 = await deps.sha256(bytes);

      // 11–12. Text layer or nothing.
      const pageResult = await deps.pageText.extract(bytes);
      stats.pages = pageResult.pageCount;
      const verdict = judgeTextLayer(pageResult);
      if (verdict.kind === 'scanned') throw new StepFailure('scanned_pdf');
      stats.empty_pages = verdict.emptyPages;

      // 13. Deterministic chunking (the model never decides which pages exist).
      const chunks = chunkPages(pageResult.pages, LIMITS.maxChunkChars, LIMITS.minPageTextChars);
      if (chunks.length > LIMITS.maxChunks) throw new StepFailure('document_too_large');
      stats.chunks = chunks.length;

      // 14. Extraction, one request per chunk. Consent was verified above.
      const parts: RawExtraction[] = [];
      let inTok = 0;
      let outTok = 0;
      for (const chunk of chunks) {
        if (deps.now() > deadline) throw new StepFailure('processing_timeout');
        const res = await deps.extractor.extract(formatChunkForPrompt(chunk));
        inTok += res.usage.inputTokens;
        outTok += res.usage.outputTokens;
        const parsed = parseExtraction(res.output);
        if (!parsed.ok) throw new ExtractorError('extraction_invalid_output');
        parts.push(parsed.value);
      }
      stats.input_tokens = inTok;
      stats.output_tokens = outTok;
      const merged = parts.length === 1 ? parts[0] : mergeExtractions(parts);

      // 15. Deterministic validation, normalisation and the confidence gate.
      const profile = await deps.db.getProfile(userId);
      const built = await buildCommitPayload({
        pages: pageResult.pages, pageCount: pageResult.pageCount, textSource: pageResult.source,
        contentSha256, extraction: merged, profile, confidenceThreshold: deps.config.confidenceThreshold, baseStats: stats,
      });
      if (built.kind === 'patient_mismatch') {
        Object.assign(stats, built.stats);
        throw new StepFailure('patient_mismatch', 'mismatch');
      }
      identity = built.identity;
      Object.assign(stats, built.stats);
      if (built.accepted === 0) {
        throw new StepFailure(built.proposed === 0 ? 'no_results_found' : 'evidence_validation_failed', built.identity);
      }

      // 16. One atomic commit.
      await deps.db.commit(documentId, runId, built.payload);
      deps.log({
        event: 'completed', document_id: documentId, run_id: runId, status: 'completed', ms: deps.now() - started,
        pages: stats.pages, chunks: stats.chunks, input_tokens: inTok, output_tokens: outTok, model: deps.config.anthropicModel,
      });
      return json(200, { ok: true, document_id: documentId, status: 'completed', identity_check: built.identity });
    } catch (e) {
      const code = classifyError(e);
      const info = failureInfo(code);
      if (e instanceof StepFailure && e.identity) identity = e.identity;
      deps.log({ event: 'failed', document_id: documentId, run_id: runId ?? undefined, status: 'failed', code, ms: deps.now() - started });
      try {
        await deps.db.fail({ documentId, runId, info, identity, stats });
      } catch {
        deps.log({ event: 'fail_write_error', document_id: documentId, code: 'internal_error' });
        return json(500, { error: 'internal_error' });
      }
      return json(200, { ok: false, document_id: documentId, status: 'failed', failure_code: info.code, retryable: info.retryable, message: info.userMessage });
    }
  };
}
