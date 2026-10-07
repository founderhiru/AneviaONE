/**
 * In-memory fakes for the engine's injected dependencies. The fake database
 * mirrors the engine_* SQL contract closely enough for pipeline tests
 * (claim rules, write-once hash, fingerprint de-duplication, supersession);
 * the real SQL is covered by supabase/tests/gate1_engine_test.sql.
 */

import type { ClaimedDocument, CompletionCounts, EngineContext, EngineDb, FailureArgs } from '../pipeline.ts';
import type { LogFields, Logger } from '../log.ts';
import type { StructuredExtractor } from '../extractor.ts';
import type { Page } from '../validate.ts';
import { UnpdfPageTextProvider } from '../pages.ts';
import { SYNTHETIC_PATIENT, honestExtraction } from './fixtures.ts';

export const USER = '11111111-1111-4111-8111-111111111111';
export const OTHER_USER = '22222222-2222-4222-8222-222222222222';
export const CONSENT_VERSION = 'ai-2026-10';

type Doc = {
  id: string;
  user_id: string;
  status: string;
  failure_kind: string | null;
  storage_path: string;
  content_sha256: string | null;
  processing_attempts: number;
  report_date?: string | null;
  identity_check?: string | null;
  review_reason?: string | null;
};
type Fact = { kind: string; document_id: string; run_id: string; fingerprint: string; gate: string; superseded: boolean; row: Record<string, unknown> };

export class FakeDb implements EngineDb {
  docs = new Map<string, Doc>();
  consent = new Map<string, string>(); // user → version with both consents granted
  identity = { displayName: SYNTHETIC_PATIENT.name as string | null, dateOfBirth: SYNTHETIC_PATIENT.dateOfBirth as string | null };
  runs: { id: string; document_id: string; status: string; consent_version: string }[] = [];
  facts: Fact[] = [];
  failures: FailureArgs[] = [];
  calls: string[] = [];

  addDoc(id: string, userId = USER, status = 'uploaded', storagePath = `${userId}/${id}.pdf`) {
    this.docs.set(id, { id, user_id: userId, status, failure_kind: null, storage_path: storagePath, content_sha256: null, processing_attempts: 0 });
  }

  getOwnedDocument(documentId: string, userId: string) {
    const d = this.docs.get(documentId);
    return Promise.resolve(d && d.user_id === userId ? { id: d.id, status: d.status, failure_kind: d.failure_kind } : null);
  }
  hasAiConsent(userId: string, version: string) {
    this.calls.push('hasAiConsent');
    return Promise.resolve(this.consent.get(userId) === version);
  }
  claimDocument(documentId: string, userId: string, reprocess: boolean, maxAttempts: number): Promise<ClaimedDocument | null> {
    this.calls.push('claimDocument');
    const d = this.docs.get(documentId);
    if (!d || d.user_id !== userId) return Promise.resolve(null);
    const retryable = d.status === 'failed' && ['transient', 'provider', 'validation', 'consent_required'].includes(d.failure_kind ?? '') && d.processing_attempts < maxAttempts;
    if (!(d.status === 'uploaded' || retryable || (d.status === 'completed' && reprocess))) return Promise.resolve(null);
    d.status = 'processing';
    d.processing_attempts += 1;
    d.failure_kind = null;
    return Promise.resolve({ id: d.id, storage_path: d.storage_path, content_sha256: d.content_sha256, processing_attempts: d.processing_attempts });
  }
  recordOriginal(documentId: string, _userId: string, sha256: string) {
    const d = this.docs.get(documentId)!;
    if (d.content_sha256 && d.content_sha256 !== sha256) return Promise.reject(new Error('content_sha256 mismatch'));
    d.content_sha256 = sha256;
    return Promise.resolve();
  }
  startRun(args: { documentId: string; consentVersion: string }) {
    this.calls.push('startRun');
    const id = `run-${this.runs.length + 1}`;
    this.runs.push({ id, document_id: args.documentId, status: 'running', consent_version: args.consentVersion });
    return Promise.resolve(id);
  }
  completeDocument(runId: string, userId: string, payload: Record<string, unknown>): Promise<CompletionCounts> {
    this.calls.push('completeDocument');
    const run = this.runs.find((r) => r.id === runId)!;
    // Earlier runs' unreviewed facts for this document are superseded, never deleted.
    for (const f of this.facts) if (f.document_id === run.document_id && f.run_id !== runId) f.superseded = true;
    const live = new Set(this.facts.filter((f) => !f.superseded && this.docs.get(f.document_id)?.user_id === userId).map((f) => f.fingerprint));
    const counts = { facts_written: 0, facts_needs_review: 0, facts_duplicate: 0 };
    for (const kind of ['observations', 'medications', 'conditions', 'allergies', 'procedures', 'encounters']) {
      for (const row of payload[kind] as Record<string, unknown>[]) {
        const fp = row.fact_fingerprint as string;
        if (live.has(fp)) {
          counts.facts_duplicate += 1;
          continue;
        }
        live.add(fp);
        this.facts.push({ kind, document_id: run.document_id, run_id: runId, fingerprint: fp, gate: row.confidence_gate as string, superseded: false, row });
        counts.facts_written += 1;
        if (row.confidence_gate === 'needs_review') counts.facts_needs_review += 1;
      }
    }
    run.status = 'succeeded';
    const d = this.docs.get(run.document_id)!;
    Object.assign(d, { status: 'completed', report_date: payload.report_date, identity_check: payload.identity_check });
    return Promise.resolve(counts);
  }
  failDocument(args: FailureArgs) {
    this.failures.push(args);
    const d = this.docs.get(args.documentId)!;
    Object.assign(d, { status: 'failed', failure_kind: args.failureKind, review_reason: args.reviewReason ?? null, identity_check: args.identityCheck ?? null });
    const run = this.runs.find((r) => r.id === args.runId);
    if (run) run.status = 'failed';
    return Promise.resolve();
  }
  getAccountIdentity() {
    return Promise.resolve(this.identity);
  }
  /** What the app would see through current_observations. */
  liveObservations(userId = USER) {
    return this.facts.filter((f) => f.kind === 'observations' && !f.superseded && f.gate === 'passed' && this.docs.get(f.document_id)?.user_id === userId);
  }
}

export class FakeStorage {
  files = new Map<string, Uint8Array>();
  downloadOriginal(path: string) {
    const file = this.files.get(path);
    return file ? Promise.resolve(file) : Promise.reject(new Error('not found'));
  }
}

/** Scripted extractor: answers like an honest model unless told otherwise. Records what it was sent. */
export class FakeExtractor implements StructuredExtractor {
  readonly provider = 'fake';
  readonly model = 'fake-model';
  readonly promptVersion = 'test';
  sent: Page[][] = [];
  respond: (pages: Page[]) => unknown = (pages) => honestExtraction(pages);
  extract(pages: Page[]) {
    this.sent.push(pages);
    try {
      return Promise.resolve(this.respond(pages));
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

export class CapturingLogger implements Logger {
  lines: LogFields[] = [];
  info(fields: LogFields) {
    this.lines.push(fields);
  }
  error(fields: LogFields) {
    this.lines.push(fields);
  }
  /** Exactly what consoleLogger would write. */
  written(): string {
    return this.lines.map((l) => JSON.stringify(l)).join('\n');
  }
}

export function makeContext() {
  const db = new FakeDb();
  const storage = new FakeStorage();
  const extractor = new FakeExtractor();
  const log = new CapturingLogger();
  db.consent.set(USER, CONSENT_VERSION);
  const ctx: EngineContext = {
    db,
    storage,
    pageText: new UnpdfPageTextProvider(() => import('unpdf')),
    extractor,
    log,
    config: { consentVersion: CONSENT_VERSION, maxAttempts: 3 },
    today: new Date('2026-10-06T12:00:00Z'),
  };
  return { ctx, db, storage, extractor, log };
}
