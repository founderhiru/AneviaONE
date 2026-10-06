import { REPORT_A, REPORT_WRONG_PATIENT, SCANNED_PAGES, goodExtraction } from './fixtures.ts';
import { ANTHROPIC_KEY, CONSENT_OK, DOC_ID, SERVICE_ROLE_KEY, USER_A, USER_B, makeHarness, post } from './handlerHarness.ts';
import { ExtractorError } from '../../../supabase/functions/_shared/providers/extractor.ts';
import { PdfError, type PageTextProvider } from '../../../supabase/functions/_shared/providers/pageText.ts';
import { CONSENT_POLICY_VERSION } from '../../../supabase/functions/_shared/config.ts';
import type { PageTextResult } from '../../../supabase/functions/_shared/types.ts';

const textResult = (f = REPORT_A): PageTextResult => ({ pages: f.pages, pageCount: f.pages.length, source: 'pdf_text_layer', meta: { provider: 'fake', version: '1' } });
const textProvider = (f = REPORT_A): PageTextProvider => ({ extract: async () => textResult(f) });
const usage = { inputTokens: 100, outputTokens: 50 };
const extractorFor = (f = REPORT_A, patient?: { name: string; dob: string }) =>
  async () => ({ output: goodExtraction(f, patient), usage });
const body = (o: object = {}) => ({ document_id: DOC_ID, ...o });
const read = async (r: Response) => ({ status: r.status, json: await r.json() as Record<string, unknown> });

describe('process-document: request gates (nothing is claimed or sent)', () => {
  it('401 without a valid JWT; no database or provider activity', async () => {
    const h = makeHarness({ pageText: textProvider(), extractor: extractorFor() });
    expect((await read(await h.handle(post(body(), null)))).status).toBe(401);
    expect((await read(await h.handle(post(body(), 'bad-token')))).status).toBe(401);
    expect(h.db.calls).toEqual([]);
    expect(h.extractCalls).toHaveLength(0);
  });
  it('rejects non-POST and malformed bodies', async () => {
    const h = makeHarness({ pageText: textProvider(), extractor: extractorFor() });
    expect((await h.handle(new Request('https://x', { method: 'GET' }))).status).toBe(405);
    expect((await h.handle(post('{not json'))).status).toBe(400);
    expect((await h.handle(post({ document_id: 'not-a-uuid' }))).status).toBe(400);
    expect((await h.handle(post({}))).status).toBe(400);
    expect(h.db.calls).toEqual([]);
  });
  it("ignores any client-supplied user id: another user's document is 'not found'", async () => {
    const h = makeHarness({ pageText: textProvider(), extractor: extractorFor(), user: USER_B });
    const r = await read(await h.handle(post(body({ user_id: USER_A, userId: USER_A }))));
    expect(r.status).toBe(404);
    expect(h.db.calls).toEqual(['getDocument']);
    expect(h.extractCalls).toHaveLength(0);
    expect(h.downloads).toHaveLength(0);
  });
  it('503 when the provider data-flow gate is not approved: no consent read, no claim, no provider call', async () => {
    const h = makeHarness({ pageText: textProvider(), extractor: extractorFor(), config: { dataFlowApproved: false } });
    const r = await read(await h.handle(post(body())));
    expect(r).toMatchObject({ status: 503, json: { error: 'processing_not_enabled' } });
    expect(h.db.calls).toEqual(['getDocument']);
    expect(h.extractCalls).toHaveLength(0);
  });
  it.each([
    ['no consent at all', []],
    ['only one consent', [CONSENT_OK[0]]],
    ['ai_processing revoked', [CONSENT_OK[0], { ...CONSENT_OK[1], granted: false }]],
    ['health_data_processing revoked', [{ ...CONSENT_OK[0], granted: false }, CONSENT_OK[1]]],
    ['consent for an older policy version', CONSENT_OK.map((c) => ({ ...c, policy_version: 'consent-2025-old' }))],
  ])('403 consent_required — %s: no claim, no download, no AI call', async (_n, consents) => {
    const h = makeHarness({ pageText: textProvider(), extractor: extractorFor() });
    h.db.consents = consents as never;
    const r = await read(await h.handle(post(body())));
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('consent_required');
    expect(h.db.calls).toEqual(['getDocument', 'getLatestConsents']);
    expect(h.extractCalls).toHaveLength(0);
    expect(h.downloads).toHaveLength(0);
    expect(h.db.docs.get(DOC_ID)!.status).toBe('uploaded');
  });
  it('409 when the claim is refused (already processing / completed / not retryable / attempts)', async () => {
    for (const status of ['processing', 'completed', 'pending_upload']) {
      const h = makeHarness({ pageText: textProvider(), extractor: extractorFor() });
      h.db.docs.get(DOC_ID)!.status = status;
      const r = await read(await h.handle(post(body())));
      expect(r.status).toBe(409);
      expect(h.extractCalls).toHaveLength(0);
    }
    const h = makeHarness({ pageText: textProvider(), extractor: extractorFor() });
    h.db.docs.get(DOC_ID)!.attempts = 5;
    expect((await read(await h.handle(post(body())))).json.reason).toBe('too_many_attempts');
    const f = makeHarness({ pageText: textProvider(), extractor: extractorFor() });
    Object.assign(f.db.docs.get(DOC_ID)!, { status: 'failed', failure_retryable: false });
    expect((await read(await f.handle(post(body())))).json.reason).toBe('not_retryable');
  });
});

describe('process-document: happy path', () => {
  it('completes, commits once, with sha256 and evidence-linked facts', async () => {
    const h = makeHarness({ pageText: textProvider(), extractor: extractorFor(), bytes: new Uint8Array([1, 2, 3]) });
    const r = await read(await h.handle(post(body())));
    expect(r).toMatchObject({ status: 200, json: { ok: true, status: 'completed', identity_check: 'match' } });
    expect(h.db.calls).toEqual(['getDocument', 'getLatestConsents', 'claim', 'startRun', 'getProfile', 'commit']);
    expect(h.downloads).toEqual([`medical-documents/${USER_A}/${DOC_ID}.pdf`]);
    expect(h.db.commits).toHaveLength(1);
    const p = h.db.commits[0].payload;
    expect(p.content_sha256).toBe('039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81'); // sha256 of bytes 1,2,3
    expect(p.observations).toHaveLength(2);
    expect(p.pages).toHaveLength(1);
    expect(h.db.docs.get(DOC_ID)!.status).toBe('completed');
    expect(h.extractCalls).toHaveLength(1);
    expect(h.extractCalls[0]).toContain('=== PAGE 1 ===');
  });
  it('the prompt contains page text only — never account identifiers', async () => {
    const h = makeHarness({ pageText: textProvider(), extractor: extractorFor() });
    await h.handle(post(body()));
    const sent = h.extractCalls.join('\n');
    expect(sent).not.toContain(USER_A);
    expect(sent).not.toContain(DOC_ID);
    expect(sent).not.toContain('good-token');
    expect(sent).not.toContain(SERVICE_ROLE_KEY);
  });
  it('a completed document is not re-sent to the provider (UI refresh / double tap)', async () => {
    const h = makeHarness({ pageText: textProvider(), extractor: extractorFor() });
    await h.handle(post(body()));
    const again = await read(await h.handle(post(body())));
    expect(again).toMatchObject({ status: 409, json: { reason: 'already_completed' } });
    expect(h.extractCalls).toHaveLength(1);
  });
  it('explicit reprocess is allowed and produces a second run', async () => {
    const h = makeHarness({ pageText: textProvider(), extractor: extractorFor() });
    await h.handle(post(body()));
    const again = await read(await h.handle(post(body({ reprocess: true }))));
    expect(again.json.ok).toBe(true);
    expect(h.db.runs).toBe(2);
    // identical input → identical fingerprints, so the database can supersede instead of duplicating
    const [a, b] = h.db.commits.map((c) => c.payload.observations.map((o) => o.fingerprint).sort());
    expect(a).toEqual(b);
  });
  it('concurrent calls: the second claim is refused', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    const h = makeHarness({ pageText: textProvider(), extractor: async () => { await gate; return { output: goodExtraction(REPORT_A), usage }; } });
    const first = h.handle(post(body()));
    await new Promise((r) => setTimeout(r, 10));
    const second = await read(await h.handle(post(body())));
    expect(second).toMatchObject({ status: 409, json: { reason: 'already_processing' } });
    release();
    expect((await read(await first)).json.ok).toBe(true);
    expect(h.extractCalls).toHaveLength(1);
  });
});

describe('process-document: failures are explicit and classified', () => {
  const failed = async (h: ReturnType<typeof makeHarness>) => {
    const r = await read(await h.handle(post(body())));
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(false);
    return r.json as { failure_code: string; retryable: boolean; message: string };
  };

  it('scanned PDF: clear reason, never guessed, no provider call', async () => {
    const h = makeHarness({ pageText: { extract: async () => ({ ...textResult(), pages: SCANNED_PAGES, pageCount: 2 }) }, extractor: extractorFor() });
    const r = await failed(h);
    expect(r).toMatchObject({ failure_code: 'scanned_pdf', retryable: false, message: "Scanned PDFs aren't supported yet." });
    expect(h.extractCalls).toHaveLength(0);
    expect(h.db.commits).toHaveLength(0);
    expect(h.db.docs.get(DOC_ID)!.status).toBe('failed');
  });
  it.each([['invalid_pdf'], ['encrypted_pdf'], ['document_too_large']] as const)('%s → unsupported, not retryable', async (code) => {
    const h = makeHarness({ pageText: { extract: async () => { throw new PdfError(code); } }, extractor: extractorFor() });
    expect(await failed(h)).toMatchObject({ failure_code: code, retryable: false });
    expect(h.extractCalls).toHaveLength(0);
  });
  it('storage download failure is retryable', async () => {
    const h = makeHarness({ pageText: textProvider(), extractor: extractorFor(), downloadFails: true });
    expect(await failed(h)).toMatchObject({ failure_code: 'storage_download_failed', retryable: true });
  });
  it('wrong patient: marked, not ingested, not retryable, identity recorded', async () => {
    const h = makeHarness({ pageText: textProvider(REPORT_WRONG_PATIENT), extractor: extractorFor(REPORT_WRONG_PATIENT, { name: 'Ravi Notyou', dob: '03 Nov 1971' }) });
    const r = await failed(h);
    expect(r).toMatchObject({ failure_code: 'patient_mismatch', retryable: false });
    expect(h.db.commits).toHaveLength(0);
    expect(h.db.fails[0]).toMatchObject({ identity: 'mismatch' });
  });
  it.each([
    ['provider_unavailable', true], ['provider_auth', true], ['extraction_invalid_output', true],
    ['provider_rejected', false], ['extraction_too_large', false],
  ] as const)('provider error %s → retryable=%s', async (code, retryable) => {
    const h = makeHarness({ pageText: textProvider(), extractor: async () => { throw new ExtractorError(code); } });
    expect(await failed(h)).toMatchObject({ failure_code: code, retryable });
    expect(h.db.commits).toHaveLength(0);
  });
  it('model returns something that is not the schema → extraction_invalid_output (retryable)', async () => {
    const h = makeHarness({ pageText: textProvider(), extractor: async () => ({ output: ['nope'], usage }) });
    expect(await failed(h)).toMatchObject({ failure_code: 'extraction_invalid_output', retryable: true });
  });
  it('every fact fails evidence validation → evidence_validation_failed, nothing stored', async () => {
    const ex = goodExtraction(REPORT_A);
    for (const o of ex.observations) (o as Record<string, unknown>).source_text = 'text that is not in the report at all';
    const h = makeHarness({ pageText: textProvider(), extractor: async () => ({ output: ex, usage }) });
    expect(await failed(h)).toMatchObject({ failure_code: 'evidence_validation_failed', retryable: false });
    expect(h.db.commits).toHaveLength(0);
  });
  it('model finds nothing → no_results_found (not retried forever)', async () => {
    const ex = { ...goodExtraction(REPORT_A), observations: [] };
    const h = makeHarness({ pageText: textProvider(), extractor: async () => ({ output: ex, usage }) });
    expect(await failed(h)).toMatchObject({ failure_code: 'no_results_found', retryable: false });
  });
  it('unexpected exception → internal_error, retryable, no details exposed', async () => {
    const h = makeHarness({ pageText: { extract: async () => { throw new Error('secret HbA1c 5.8 detail'); } }, extractor: extractorFor() });
    const r = await failed(h);
    expect(r).toMatchObject({ failure_code: 'internal_error', retryable: true });
    expect(JSON.stringify(r)).not.toContain('HbA1c');
  });
  it('wall-clock budget exceeded → processing_timeout (retryable)', async () => {
    let t = 0;
    const h = makeHarness({ pageText: textProvider(), extractor: extractorFor(), clock: () => (t += 100_000), budgetMs: 1000 });
    expect(await failed(h)).toMatchObject({ failure_code: 'processing_timeout', retryable: true });
  });
  it('if even recording the failure fails, respond 500 (the 15-minute lease recovers the document)', async () => {
    const h = makeHarness({ pageText: { extract: async () => { throw new PdfError('invalid_pdf'); } }, extractor: extractorFor() });
    h.db.failWriteError = true;
    expect((await h.handle(post(body()))).status).toBe(500);
  });
  it('a failed-then-retryable document can be retried and succeed', async () => {
    let n = 0;
    const h = makeHarness({ pageText: textProvider(), extractor: async () => { if (n++ === 0) throw new ExtractorError('provider_unavailable'); return { output: goodExtraction(REPORT_A), usage }; } });
    expect((await read(await h.handle(post(body())))).json.ok).toBe(false);
    const retry = await read(await h.handle(post(body())));
    expect(retry.json.ok).toBe(true);
    expect(h.db.docs.get(DOC_ID)!.attempts).toBe(2);
  });
  it('a permanent failure is not retried without an explicit reprocess', async () => {
    const h = makeHarness({ pageText: { extract: async () => ({ ...textResult(), pages: SCANNED_PAGES, pageCount: 2 }) }, extractor: extractorFor() });
    await h.handle(post(body()));
    const again = await read(await h.handle(post(body())));
    expect(again).toMatchObject({ status: 409, json: { reason: 'not_retryable' } });
  });
});

describe('process-document: privacy of logs and responses', () => {
  const SENSITIVE = ['Asha Synthetic', '1985', 'HbA1c', 'LDL', '5.8', '120 mg/dL', 'Collection date'];
  it('logs and responses never contain page text, quotes, values, identity or secrets', async () => {
    const outcomes = [
      makeHarness({ pageText: textProvider(), extractor: extractorFor() }),
      makeHarness({ pageText: textProvider(), extractor: async () => { throw new ExtractorError('provider_unavailable'); } }),
      makeHarness({ pageText: textProvider(REPORT_WRONG_PATIENT), extractor: extractorFor(REPORT_WRONG_PATIENT, { name: 'Ravi Notyou', dob: '03 Nov 1971' }) }),
    ];
    for (const h of outcomes) {
      const res = await h.handle(post(body()));
      const text = JSON.stringify(h.logs) + (await res.text());
      for (const s of [...SENSITIVE, 'Ravi', 'Notyou', SERVICE_ROLE_KEY, ANTHROPIC_KEY, 'good-token']) expect(text).not.toContain(s);
    }
  });
  it('log events only use the allowed keys', async () => {
    const h = makeHarness({ pageText: textProvider(), extractor: extractorFor() });
    await h.handle(post(body()));
    const allowed = new Set(['event', 'document_id', 'run_id', 'status', 'code', 'attempt', 'ms', 'pages', 'chunks', 'input_tokens', 'output_tokens', 'model']);
    for (const e of h.logs) for (const k of Object.keys(e)) expect(allowed.has(k)).toBe(true);
  });
  it('the response never contains the service-role key or consent internals', async () => {
    const h = makeHarness({ pageText: textProvider(), extractor: extractorFor() });
    const t = await (await h.handle(post(body()))).text();
    expect(t).not.toContain(SERVICE_ROLE_KEY);
  });
});

describe('consent version constant', () => {
  it('is pinned (changing it forces everyone to re-consent)', () => {
    expect(CONSENT_POLICY_VERSION).toBe('consent-2026-10-v1');
  });
});
