/** @jest-environment node */
/**
 * End to end with REAL synthetic PDFs: private download (faked) → real unpdf
 * text layer → fake extractor that answers from the text → real validators →
 * fake database. No network.
 */
import fs from 'fs';
import path from 'path';
import { createUnpdfPageTextProvider, type UnpdfLike } from '../../../supabase/functions/_shared/providers/pageText.ts';
import { goodExtraction, labReport, REPORT_A, REPORT_B, REPORT_C } from './fixtures.ts';
import { DOC_ID, makeHarness, post } from './handlerHarness.ts';

function cloneValue(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v)) { const a = v as Uint8Array; return new (a.constructor as Uint8ArrayConstructor)(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength)); }
  if (v instanceof ArrayBuffer) return v.slice(0);
  if (Array.isArray(v)) return v.map(cloneValue);
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, cloneValue(x)]));
  if (v instanceof Set) return new Set([...v].map(cloneValue));
  return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, cloneValue(x)]));
}
(globalThis as { structuredClone: unknown }).structuredClone = cloneValue;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const unpdf = require('unpdf') as UnpdfLike;
const pdf = (n: string) => new Uint8Array(fs.readFileSync(path.join(__dirname, '../../../supabase/functions/_fixtures', n)));
const usage = { inputTokens: 1, outputTokens: 1 };
const body = { document_id: DOC_ID };
const run = async (file: string, extractor: () => Promise<{ output: unknown; usage: typeof usage }>) => {
  const h = makeHarness({ pageText: createUnpdfPageTextProvider(unpdf), extractor, bytes: pdf(file) });
  const res = await h.handle(post(body));
  return { h, json: (await res.json()) as Record<string, unknown> };
};

describe('real PDFs through process-document', () => {
  it.each([['report_a.pdf', REPORT_A, '5.8', '120'], ['report_b.pdf', REPORT_B, '6.1', '135'], ['report_c.pdf', REPORT_C, '5.9', '128']])(
    '%s → completed with the right numbers on page 1',
    async (file, fx, hba1c, ldl) => {
      const { h, json } = await run(file, async () => ({ output: goodExtraction(fx), usage }));
      expect(json.ok).toBe(true);
      const obs = h.db.commits[0].payload.observations;
      expect(obs.find((o) => o.code === 'hba1c')).toMatchObject({ value_as_written: hba1c, page_number: 1, effective_date: fx.date });
      expect(obs.find((o) => o.code === 'ldl_cholesterol')).toMatchObject({ value_as_written: ldl, unit_normalized: 'mg/dL' });
      expect(h.db.commits[0].payload.document.identity_check).toBe('match');
    },
  );
  it('scanned.pdf → scanned_pdf, provider never called', async () => {
    const { h, json } = await run('scanned.pdf', async () => { throw new Error('must not be called'); });
    expect(json).toMatchObject({ ok: false, failure_code: 'scanned_pdf', message: "Scanned PDFs aren't supported yet." });
    expect(h.extractCalls).toHaveLength(0);
  });
  it('malformed.pdf → invalid_pdf; encrypted.pdf → encrypted_pdf', async () => {
    expect((await run('malformed.pdf', async () => { throw new Error('x'); })).json).toMatchObject({ failure_code: 'invalid_pdf' });
    expect((await run('encrypted.pdf', async () => { throw new Error('x'); })).json).toMatchObject({ failure_code: 'encrypted_pdf' });
  });
  it('wrong_patient.pdf → patient_mismatch, nothing committed', async () => {
    const fx = labReport({ id: 'W', date: '2026-01-15', dateLabel: '15 Jan 2026', hba1c: '5.8', ldl: '120', name: 'Ravi Notyou', dob: '03 Nov 1971' });
    const { h, json } = await run('wrong_patient.pdf', async () => ({ output: goodExtraction(fx, { name: 'Ravi Notyou', dob: '03 Nov 1971' }), usage }));
    expect(json).toMatchObject({ failure_code: 'patient_mismatch' });
    expect(h.db.commits).toHaveLength(0);
  });
  it('ambiguous.pdf → facts stored but held for review, never trusted', async () => {
    const lines = ['HbA1c 5.8-6.1 % 4.0 - 5.6', 'LDL Cholesterol - mg/dL < 100'];
    const out = {
      ...goodExtraction({ ...REPORT_A, lines }, { name: 'Asha Synthetic', dob: '' } as never, '05/06/2026'),
    };
    (out.observations[0] as Record<string, unknown>).value_as_written = '5.8-6.1';
    (out.observations[0] as Record<string, unknown>).source_text = lines[0];
    out.observations.length = 1;
    const { h, json } = await run('ambiguous.pdf', async () => ({ output: out, usage }));
    expect(json.ok).toBe(true);
    const o = h.db.commits[0].payload.observations[0];
    expect(o).toMatchObject({ review_status: 'needs_review', value_normalized: null });
    expect(['ambiguous_value', 'ambiguous_date']).toContain(o.review_reason);
  });
  it('a missing value in the PDF (LDL "-") can never become a fact', async () => {
    const lines = ['HbA1c 5.8-6.1 % 4.0 - 5.6', 'LDL Cholesterol - mg/dL < 100'];
    const out = goodExtraction({ ...REPORT_A, lines }, { name: 'Asha Synthetic', dob: '' } as never, '05/06/2026');
    (out.observations[0] as Record<string, unknown>).source_text = lines[0];
    (out.observations[0] as Record<string, unknown>).value_as_written = '5.8-6.1';
    (out.observations[1] as Record<string, unknown>).source_text = lines[1];
    (out.observations[1] as Record<string, unknown>).value_as_written = '120'; // invented by the "model"
    const { h } = await run('ambiguous.pdf', async () => ({ output: out, usage }));
    const codes = h.db.commits[0].payload.observations.map((o) => o.code);
    expect(codes).not.toContain('ldl_cholesterol');
    expect(h.db.commits[0].payload.stats.rejected).toMatchObject({ value_not_in_quote: 1 });
  });
  it('duplicate/reprocessed document: same fingerprints both times', async () => {
    const h = makeHarness({ pageText: createUnpdfPageTextProvider(unpdf), extractor: async () => ({ output: goodExtraction(REPORT_A), usage }), bytes: pdf('report_a.pdf') });
    await h.handle(post(body));
    await h.handle(post({ ...body, reprocess: true }));
    const [a, b] = h.db.commits.map((c) => c.payload.observations.map((o) => o.fingerprint).sort());
    expect(a).toEqual(b);
    expect(h.db.commits[0].payload.content_sha256).toBe(h.db.commits[1].payload.content_sha256);
  });
});
