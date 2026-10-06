/** In-memory fakes for the process-document handler. No network, no database. */
import { CONSENT_POLICY_VERSION, loadRuntimeConfig, DATA_FLOW_VERSION, type RuntimeConfig } from '../../../supabase/functions/_shared/config.ts';
import { createHandler, type ClaimResult, type ConsentRow, type Deps, type DocumentRow, type LogEvent, type ProcessDb } from '../../../supabase/functions/process-document/handler.ts';
import type { StructuredExtractor } from '../../../supabase/functions/_shared/providers/extractor.ts';
import type { PageTextProvider } from '../../../supabase/functions/_shared/providers/pageText.ts';
import type { CommitPayload } from '../../../supabase/functions/_shared/pipeline.ts';
import { sha256Hex } from '../../../supabase/functions/_shared/fingerprint.ts';

export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';
export const DOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const SERVICE_ROLE_KEY = 'service-role-secret-do-not-leak';
export const ANTHROPIC_KEY = 'anthropic-secret-do-not-leak';

export const CONSENT_OK: ConsentRow[] = [
  { consent_type: 'health_data_processing', granted: true, policy_version: CONSENT_POLICY_VERSION },
  { consent_type: 'ai_processing', granted: true, policy_version: CONSENT_POLICY_VERSION },
];

export function makeConfig(over: Partial<RuntimeConfig> = {}): RuntimeConfig {
  const r = loadRuntimeConfig((n) => ({
    SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: ANTHROPIC_KEY, AI_DATA_FLOW_APPROVED: DATA_FLOW_VERSION,
  } as Record<string, string>)[n]);
  if (!r.ok) throw new Error('config');
  return { ...r.config, ...over };
}

export class FakeDb implements ProcessDb {
  docs = new Map<string, DocumentRow & { user_id: string; attempts: number; failure_retryable?: boolean | null }>();
  consents: ConsentRow[] = CONSENT_OK;
  profile = { fullName: 'Asha Synthetic' as string | null, dateOfBirth: '1985-04-12' as string | null };
  calls: string[] = [];
  commits: { documentId: string; runId: string; payload: CommitPayload }[] = [];
  fails: { documentId: string; runId: string | null; code: string; retryable: boolean; identity: string | null }[] = [];
  failWriteError = false;
  runs = 0;

  constructor() {
    this.docs.set(DOC_ID, {
      id: DOC_ID, user_id: USER_A, status: 'uploaded', storage_bucket: 'medical-documents',
      storage_path: `${USER_A}/${DOC_ID}.pdf`, file_size_bytes: 1000, mime_type: 'application/pdf', attempts: 0,
    });
  }
  async getDocument(userId: string, documentId: string) {
    this.calls.push('getDocument');
    const d = this.docs.get(documentId);
    return d && d.user_id === userId ? d : null;
  }
  async getLatestConsents() { this.calls.push('getLatestConsents'); return this.consents; }
  async getProfile() { this.calls.push('getProfile'); return this.profile; }
  async claim(documentId: string, userId: string, reprocess: boolean, maxAttempts: number): Promise<ClaimResult> {
    this.calls.push('claim');
    const d = this.docs.get(documentId);
    if (!d || d.user_id !== userId) return { claimed: false, reason: 'not_found' };
    if (d.status === 'processing') return { claimed: false, reason: 'already_processing' };
    if (d.status === 'pending_upload') return { claimed: false, reason: 'not_uploaded' };
    if (d.attempts >= maxAttempts) return { claimed: false, reason: 'too_many_attempts' };
    if (d.status === 'completed' && !reprocess) return { claimed: false, reason: 'already_completed' };
    if (d.status === 'failed' && d.failure_retryable !== true && !reprocess) return { claimed: false, reason: 'not_retryable' };
    const prev = d.status;
    d.status = 'processing';
    d.attempts += 1;
    return { claimed: true, attempt: d.attempts, previous_status: prev };
  }
  async startRun() { this.calls.push('startRun'); this.runs += 1; return `run-${this.runs}`; }
  async fail(a: Parameters<ProcessDb['fail']>[0]) {
    this.calls.push('fail');
    if (this.failWriteError) throw new Error('db down');
    this.fails.push({ documentId: a.documentId, runId: a.runId, code: a.info.code, retryable: a.info.retryable, identity: a.identity });
    const d = this.docs.get(a.documentId)!;
    d.status = 'failed';
    d.failure_retryable = a.info.retryable;
  }
  async commit(documentId: string, runId: string, payload: CommitPayload) {
    this.calls.push('commit');
    this.commits.push({ documentId, runId, payload });
    this.docs.get(documentId)!.status = 'completed';
    return {};
  }
}

export type Harness = {
  db: FakeDb; logs: LogEvent[]; extractCalls: string[]; downloads: string[]; deps: Deps; handle: (req: Request) => Promise<Response>;
};

export function makeHarness(opts: {
  pageText: PageTextProvider;
  extractor?: StructuredExtractor['extract'];
  config?: Partial<RuntimeConfig>;
  user?: string | null;
  bytes?: Uint8Array;
  downloadFails?: boolean;
  clock?: () => number;
  budgetMs?: number;
}): Harness {
  const db = new FakeDb();
  const logs: LogEvent[] = [];
  const extractCalls: string[] = [];
  const downloads: string[] = [];
  const deps: Deps = {
    config: makeConfig(opts.config),
    async authenticate(h) { return h === 'Bearer good-token' ? (opts.user === undefined ? USER_A : opts.user) : null; },
    db,
    async download(bucket, path) {
      downloads.push(`${bucket}/${path}`);
      if (opts.downloadFails) throw new Error('nope');
      return opts.bytes ?? new Uint8Array([37, 80, 68, 70]);
    },
    pageText: opts.pageText,
    extractor: { async extract(text) { extractCalls.push(text); return opts.extractor!(text); } },
    sha256: (b) => sha256Hex(b),
    now: opts.clock ?? (() => Date.now()),
    log: (e) => logs.push(e),
    budgetMs: opts.budgetMs,
  };
  return { db, logs, extractCalls, downloads, deps, handle: createHandler(deps) };
}

export const post = (body: unknown, token: string | null = 'good-token') =>
  new Request('https://x/functions/v1/process-document', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
