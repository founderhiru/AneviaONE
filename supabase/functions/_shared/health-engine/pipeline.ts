/**
 * Processing pipeline for ONE claimed document (steps 7–22 of the Gate 1
 * spec). All I/O is injected so the whole flow is testable without a network,
 * a database or an AI provider.
 *
 *   download original (private storage) → SHA-256 (write-once)
 *   → page text (text layer), or — for scanned / image-only PDFs — a
 *     verbatim transcription (ocr.ts; only when an OCR provider is set)
 *   → consent re-check immediately before any AI call (OCR included)
 *   → deterministic chunks → StructuredExtractor
 *   → deterministic validation + normalization + confidence gate
 *   → report-person check (mismatch → review, nothing ingested; anything
 *     short of strong identity evidence → every fact held for review)
 *   → one atomic database write → document completed
 *   any failure → classified, user-safe failure (retryable or not)
 */

import { chunkPages } from './chunking.ts';
import { EngineError, USER_MESSAGES, isEngineError, type FailureKind } from './errors.ts';
import type { StructuredExtractor } from './extractor.ts';
import { factFingerprint, sha256Hex } from './fingerprint.ts';
import { checkReportPerson, identityAllowsTrust, type AccountIdentity, type IdentityCheck } from './identity.ts';
import type { Logger } from './log.ts';
import { OCR_PASS_LEGIBILITY, type OcrProvider } from './ocr.ts';
import type { PageTextProvider } from './pages.ts';
import { assertExtractionShape, validateExtraction, type Page, type ValidatedFact } from './validate.ts';
import type { StructuredExtraction } from './extraction-schema.ts';

export const PIPELINE_VERSION = 'g1.1';

export type ClaimedDocument = { id: string; storage_path: string; content_sha256: string | null; processing_attempts: number };

export type CompletionCounts = { facts_written: number; facts_needs_review: number; facts_duplicate: number };

export type FailureArgs = {
  documentId: string;
  userId: string;
  runId: string | null;
  failureKind: FailureKind;
  errorCode: string;
  userMessage: string;
  reviewReason?: 'identity_mismatch' | null;
  identityCheck?: IdentityCheck | null;
  textLayer?: 'present' | 'absent' | null;
};

/** Database operations, all executed with the service role (engine_* functions). */
export interface EngineDb {
  getOwnedDocument(documentId: string, userId: string): Promise<{ id: string; status: string; failure_kind: string | null } | null>;
  hasAiConsent(userId: string, policyVersion: string): Promise<boolean>;
  claimDocument(documentId: string, userId: string, reprocess: boolean, maxAttempts: number): Promise<ClaimedDocument | null>;
  recordOriginal(documentId: string, userId: string, sha256: string, pageCount: number): Promise<void>;
  startRun(args: { documentId: string; userId: string; pipelineVersion: string; provider: string; model: string; promptVersion: string; consentVersion: string }): Promise<string>;
  completeDocument(runId: string, userId: string, payload: Record<string, unknown>): Promise<CompletionCounts>;
  failDocument(args: FailureArgs): Promise<void>;
  getAccountIdentity(userId: string): Promise<AccountIdentity>;
  /** Counts-only diagnostics for a run (never content). */
  recordRunDiagnostics(runId: string, userId: string, diagnostics: RunDiagnostics): Promise<void>;
}

/** What the model returned and what validation did with it — counts only. */
export type RunDiagnostics = {
  candidates: Record<string, number>;
  accepted: number;
  discarded: number;
  rejected: Record<string, number>;
};

const FACT_KINDS = ['observations', 'medications', 'conditions', 'allergies', 'procedures', 'encounters'] as const;

/** Rejections that say the report itself says "no" (a denied condition, no
 * allergies) — correct outcomes, not a reading failure. */
const SEMANTIC_REJECTIONS = new Set(['negated']);

export function buildRunDiagnostics(extraction: StructuredExtraction, validation: { facts: unknown[]; discarded: number; rejected: { reason: string }[] }): RunDiagnostics {
  const candidates: Record<string, number> = {};
  for (const kind of FACT_KINDS) candidates[kind] = Array.isArray(extraction[kind]) ? extraction[kind].length : 0;
  const rejected: Record<string, number> = {};
  for (const { reason } of validation.rejected) rejected[reason] = (rejected[reason] ?? 0) + 1;
  return { candidates, accepted: validation.facts.length, discarded: validation.discarded, rejected };
}

/** The model found facts but every one failed evidence/format checks: not "nothing in the report". */
export function allCandidatesUnreadable(d: RunDiagnostics): boolean {
  const total = Object.values(d.candidates).reduce((a, b) => a + b, 0);
  const semantic = Object.entries(d.rejected).filter(([r]) => SEMANTIC_REJECTIONS.has(r)).reduce((a, [, n]) => a + n, 0);
  return total > 0 && d.accepted === 0 && d.discarded === 0 && semantic === 0;
}

export interface EngineStorage {
  /** Downloads the original from the PRIVATE medical-documents bucket. */
  downloadOriginal(storagePath: string): Promise<Uint8Array>;
}

export type EngineConfig = { consentVersion: string; maxAttempts: number };

export type EngineContext = {
  db: EngineDb;
  storage: EngineStorage;
  pageText: PageTextProvider;
  /** Reads scanned / image-only PDFs. Without it they fail as unsupported. */
  ocr?: OcrProvider;
  extractor: StructuredExtractor;
  log: Logger;
  config: EngineConfig;
  today?: Date;
};

export type ProcessOutcome =
  | ({ status: 'completed' } & CompletionCounts & { facts_rejected: number; facts_discarded: number })
  | { status: 'failed'; failure_kind: FailureKind; error_code: string };

/** Rejections counted by reason (`rejected_<reason>`: counts only, never content). */
export function rejectionCounts(rejected: { reason: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { reason } of rejected) counts[`rejected_${reason}`] = (counts[`rejected_${reason}`] ?? 0) + 1;
  return counts;
}

/** `candidates_<kind>` counts for the log (numbers only). */
function candidateCounts(d: RunDiagnostics): Record<string, number> {
  return Object.fromEntries(Object.entries(d.candidates).map(([k, n]) => [`candidates_${k}`, n]));
}

/** Holds every fact for review (identity not established); evidence is kept as read. */
export function holdForIdentity(facts: ValidatedFact[]): ValidatedFact[] {
  return facts.map((f) => (f.confidence_gate === 'needs_review' ? f : { ...f, confidence_gate: 'needs_review' }));
}

/** Merges per-chunk extractions into one (identity / report date: first evidence-backed value wins). */
function mergeExtractions(parts: StructuredExtraction[]): StructuredExtraction {
  const merged: StructuredExtraction = {
    patient_name: null,
    patient_date_of_birth: null,
    report_date: null,
    observations: [],
    medications: [],
    conditions: [],
    allergies: [],
    procedures: [],
    encounters: [],
  };
  for (const part of parts) {
    merged.patient_name ??= part.patient_name ?? null;
    merged.patient_date_of_birth ??= part.patient_date_of_birth ?? null;
    merged.report_date ??= part.report_date ?? null;
    merged.observations.push(...part.observations);
    merged.medications.push(...part.medications);
    merged.conditions.push(...part.conditions);
    merged.allergies.push(...part.allergies);
    merged.procedures.push(...part.procedures);
    merged.encounters.push(...part.encounters);
  }
  return merged;
}

/** Builds the engine_complete_document payload, fingerprinting every fact. */
export async function buildCompletionPayload(args: {
  facts: ValidatedFact[];
  pages: Page[];
  contentSha256: string;
  reportDate: string | null;
  identityCheck: IdentityCheck;
  textLayer: 'present' | 'absent';
  chunkCount: number;
  discarded: number;
}): Promise<Record<string, unknown>> {
  // Where each page's text came from: the PDF's text layer, or a transcription.
  const textSource = args.textLayer === 'present' ? 'pdf_text_layer' : 'ocr';
  const payload: Record<string, unknown> = {
    report_date: args.reportDate,
    identity_check: args.identityCheck,
    text_layer: args.textLayer,
    chunk_count: args.chunkCount,
    facts_discarded: args.discarded,
    pages: args.pages.map((p) => ({ page_number: p.page_number, text: p.text, text_source: textSource })),
    observations: [],
    medications: [],
    conditions: [],
    allergies: [],
    procedures: [],
    encounters: [],
  };
  for (const fact of args.facts) {
    (payload[fact.kind] as unknown[]).push({
      ...fact.row,
      page_number: fact.page_number,
      source_text: fact.source_text,
      confidence: fact.confidence,
      confidence_gate: fact.confidence_gate,
      fact_fingerprint: await factFingerprint(args.contentSha256, fact.fingerprintParts),
    });
  }
  return payload;
}

export async function processClaimedDocument(ctx: EngineContext, doc: ClaimedDocument, userId: string): Promise<ProcessOutcome> {
  const { db, log } = ctx;
  const started = Date.now();
  let runId: string | null = null;
  let textLayer: 'present' | 'absent' | null = null;
  let identityCheck: IdentityCheck | null = null;

  try {
    const original = await ctx.storage.downloadOriginal(doc.storage_path).catch((cause) => {
      throw new EngineError('transient', 'storage_download_failed', USER_MESSAGES.generic, { cause });
    });
    const contentSha256 = await sha256Hex(original);

    const extracted = await ctx.pageText.extract(original);
    const { metadata } = extracted;
    let pages = extracted.pages;
    textLayer = metadata.textLayer;
    const pageCount = Math.max(1, metadata.pageCount);
    await db.recordOriginal(doc.id, userId, contentSha256, pageCount);

    // Scanned / image-only: detected, never guessed. Without an OCR step it
    // is refused with no AI call.
    const needsOcr = metadata.textLayer === 'absent';
    if (needsOcr && !ctx.ocr) throw new EngineError('unsupported', 'scanned_pdf', USER_MESSAGES.scanned);

    // Consent is re-checked immediately before the document leaves our server
    // (for a scan, that is the transcription step).
    if (!(await db.hasAiConsent(userId, ctx.config.consentVersion))) {
      throw new EngineError('consent_required', 'consent_required', USER_MESSAGES.consent);
    }

    runId = await db.startRun({
      documentId: doc.id,
      userId,
      pipelineVersion: PIPELINE_VERSION,
      provider: ctx.extractor.provider,
      model: ctx.extractor.model,
      promptVersion: needsOcr && ctx.ocr ? `${ctx.extractor.promptVersion}+${ctx.ocr.promptVersion}` : ctx.extractor.promptVersion,
      consentVersion: ctx.config.consentVersion,
    });

    // Scans: transcribe verbatim, then treat the transcription as the page text.
    let reviewPages = new Set<number>();
    if (needsOcr && ctx.ocr) {
      const ocr = await ctx.ocr.recognize(original, pageCount);
      pages = ocr.pages;
      reviewPages = new Set([...ocr.legibility].filter(([, score]) => score < OCR_PASS_LEGIBILITY).map(([n]) => n));
      const readable = pages.some((p) => (p.text.replaceAll('[illegible]', '').match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 20);
      if (!readable) throw new EngineError('unsupported', 'unreadable_scan', USER_MESSAGES.unreadableScan);
    }
    const chunks = chunkPages(pages);

    const parts: StructuredExtraction[] = [];
    for (const chunk of chunks) {
      parts.push(assertExtractionShape(await ctx.extractor.extract(chunk)));
    }
    const merged = mergeExtractions(parts);
    const validation = validateExtraction(merged, pages, { today: ctx.today, reviewPages });
    const diagnostics = buildRunDiagnostics(merged, validation);
    // Recorded for every run, so "0 facts" is never ambiguous afterwards. Best-effort.
    await db.recordRunDiagnostics(runId, userId, diagnostics).catch(() => {
      log.error({ event: 'run_diagnostics_write_failed', document_id: doc.id, run_id: runId });
    });
    if (allCandidatesUnreadable(diagnostics)) {
      throw new EngineError('validation', 'all_candidates_rejected', USER_MESSAGES.notReadReliably, {
        diagnostics: { facts_rejected: validation.rejected.length, ...rejectionCounts(validation.rejected), ...candidateCounts(diagnostics) },
      });
    }

    identityCheck = checkReportPerson(
      { patientName: validation.patientName, patientDateOfBirth: validation.patientDateOfBirth },
      await db.getAccountIdentity(userId),
    );
    if (identityCheck === 'mismatch') {
      throw new EngineError('identity_mismatch', 'identity_mismatch', USER_MESSAGES.identity);
    }

    // Extraction is not proof of ownership: without strong identity evidence
    // every fact is stored with its evidence but held for review — none of
    // it reaches trusted Health Memory (current_* views) on its own.
    const trusted = identityAllowsTrust(identityCheck);
    const facts = trusted ? validation.facts : holdForIdentity(validation.facts);

    const payload = await buildCompletionPayload({
      facts,
      pages,
      contentSha256,
      reportDate: validation.reportDate,
      identityCheck,
      textLayer: metadata.textLayer,
      chunkCount: chunks.length,
      discarded: validation.discarded,
    });
    const counts = await db.completeDocument(runId, userId, payload);

    log.info({
      event: 'document_completed',
      document_id: doc.id,
      run_id: runId,
      attempt: doc.processing_attempts,
      pages: pages.length,
      chunks: chunks.length,
      facts_written: counts.facts_written,
      facts_needs_review: counts.facts_needs_review,
      facts_duplicate: counts.facts_duplicate,
      facts_rejected: validation.rejected.length,
      ...rejectionCounts(validation.rejected),
      ...candidateCounts(diagnostics),
      facts_discarded: validation.discarded,
      identity_check: identityCheck,
      facts_held_identity: trusted ? 0 : validation.facts.filter((f) => f.confidence_gate === 'passed').length,
      duration_ms: Date.now() - started,
    });
    return { status: 'completed', ...counts, facts_rejected: validation.rejected.length, facts_discarded: validation.discarded };
  } catch (error) {
    const failure = isEngineError(error) ? error : new EngineError('transient', 'internal_error', USER_MESSAGES.generic, { cause: error });
    log.error({
      event: 'document_failed',
      document_id: doc.id,
      run_id: runId,
      failure_kind: failure.kind,
      error_code: failure.code,
      ...failure.diagnostics,
      text_layer: textLayer,
      identity_check: identityCheck,
      duration_ms: Date.now() - started,
    });
    try {
      await db.failDocument({
        documentId: doc.id,
        userId,
        runId,
        failureKind: failure.kind,
        errorCode: failure.code,
        userMessage: failure.userMessage,
        reviewReason: failure.kind === 'identity_mismatch' ? 'identity_mismatch' : null,
        identityCheck,
        textLayer,
      });
    } catch {
      // The claim expires after 15 minutes and can then be retried.
      log.error({ event: 'fail_document_write_failed', document_id: doc.id, error_code: failure.code });
    }
    return { status: 'failed', failure_kind: failure.kind, error_code: failure.code };
  }
}
