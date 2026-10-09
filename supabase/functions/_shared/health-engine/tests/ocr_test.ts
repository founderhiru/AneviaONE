/**
 * Scanned / image-only reports: transcription (OCR) → the normal extractor
 * → the normal evidence validation. Synthetic content only; the OCR step is
 * scripted so the tests pin the pipeline's rules, not a model's behaviour.
 */
import { assertEquals, assertRejects } from '@std/assert';

import type { JsonModelProvider, JsonRequest } from '../../ai/provider.ts';
import { EngineError } from '../errors.ts';
import { ILLEGIBLE, ModelOcrProvider, OCR_MAX_BYTES, parseTranscription, type OcrProvider, type OcrResult } from '../ocr.ts';
import { processClaimedDocument } from '../pipeline.ts';
import { USER, makeContext } from './fakes.ts';
import { buildImageOnlyPdf, buildTextPdf, REPORT_A } from './fixtures.ts';

const DOC = 'bbbbbbbb-0000-4000-8000-00000000000b';

/** What a careful transcription of a synthetic scanned lab report returns. */
const LEGIBLE_SCAN = [
  'Sunrise Diagnostics - Laboratory Report',
  'Patient: Asha Verma   DOB: 14/08/1985',
  'Report Date: 20/09/2026',
  'Test   Result   Unit   Reference Range',
  'HbA1c 6.4 % 4.0 - 5.6',
  'LDL Cholesterol 141 mg/dL < 100',
].join('\n');

class ScriptedOcr implements OcrProvider {
  readonly name = 'scripted';
  readonly promptVersion = 'test-ocr';
  calls = 0;
  constructor(private readonly result: (pageCount: number) => OcrResult) {}
  recognize(_pdf: Uint8Array, pageCount: number) {
    this.calls += 1;
    return Promise.resolve(this.result(pageCount));
  }
}

const scan = (text: string, legibility: number) => new ScriptedOcr(() => ({ pages: [{ page_number: 1, text }], legibility: new Map([[1, legibility]]) }));

async function processScan(env: ReturnType<typeof makeContext>, ocr: OcrProvider | undefined, opts: { reprocess?: boolean } = {}) {
  if (!env.db.docs.has(DOC)) {
    env.db.addDoc(DOC);
    env.storage.files.set(`${USER}/${DOC}.pdf`, buildImageOnlyPdf());
  }
  const claimed = await env.db.claimDocument(DOC, USER, opts.reprocess ?? false, 3);
  return processClaimedDocument({ ...env.ctx, ocr }, claimed!, USER);
}

const passed = (env: ReturnType<typeof makeContext>) => env.db.liveObservations().map((f) => [f.row.name_as_written, f.row.value_as_written]);

Deno.test('a legible scan becomes evidence-backed facts through the normal validation', async () => {
  const env = makeContext();
  const ocr = scan(LEGIBLE_SCAN, 0.97);
  const out = await processScan(env, ocr);
  assertEquals(out.status, 'completed');
  assertEquals(ocr.calls, 1);
  assertEquals(passed(env), [
    ['HbA1c', '6.4'],
    ['LDL Cholesterol', '141'],
  ]);
  // The extractor read the transcription, as page text.
  assertEquals(env.extractor.sent[0][0].text, LEGIBLE_SCAN);
});

Deno.test('scan pages are stored with text_source "ocr" (honest provenance)', async () => {
  const env = makeContext();
  let payload: Record<string, unknown> | null = null;
  const complete = env.db.completeDocument.bind(env.db);
  env.db.completeDocument = (runId, userId, p) => {
    payload = p;
    return complete(runId, userId, p);
  };
  await processScan(env, scan(LEGIBLE_SCAN, 0.97));
  assertEquals((payload!.pages as { text_source: string }[]).map((p) => p.text_source), ['ocr']);
});

Deno.test('a hard-to-read scan: facts are held for review, never passed into Health Memory', async () => {
  const env = makeContext();
  const out = await processScan(env, scan(LEGIBLE_SCAN, 0.6));
  assertEquals(out.status, 'completed');
  assertEquals(passed(env), []);
  assertEquals(out.status === 'completed' && out.facts_needs_review > 0, true);
});

Deno.test('values the transcription marked illegible are never accepted', async () => {
  const env = makeContext();
  const blurred = LEGIBLE_SCAN.replace('6.4', ILLEGIBLE).replace('141', ILLEGIBLE);
  env.extractor.respond = () => ({
    patient_name: null,
    patient_date_of_birth: null,
    report_date: null,
    observations: [
      { test_name: 'HbA1c', raw_value: ILLEGIBLE, raw_unit: '%', reference_range: '', observation_date: null, category: 'laboratory', page: 1, source_text: `HbA1c ${ILLEGIBLE} %`, confidence: 0.9 },
      // A guessed value that is not in the transcription at all.
      { test_name: 'LDL Cholesterol', raw_value: '141', raw_unit: 'mg/dL', reference_range: '', observation_date: null, category: 'laboratory', page: 1, source_text: 'LDL Cholesterol 141 mg/dL', confidence: 0.9 },
    ],
    medications: [],
    conditions: [],
    allergies: [],
    procedures: [],
    encounters: [],
  });
  const out = await processScan(env, scan(blurred, 0.9));
  // Nothing accepted — and not passed off as "no health information": the
  // read fails clearly, with what was rejected and why recorded (counts only).
  assertEquals(out, { status: 'failed', failure_kind: 'validation', error_code: 'all_candidates_rejected' });
  assertEquals(passed(env), []);
  assertEquals(env.db.facts.length, 0);
  const [d] = [...env.db.diagnostics.values()];
  assertEquals(d.candidates.observations, 2);
  assertEquals(d.accepted, 0);
  assertEquals(d.rejected, { illegible: 1, quote_not_on_page: 1 });
});

Deno.test('an unreadable scan fails safely: no extraction call, no facts, an honest message', async () => {
  const env = makeContext();
  const out = await processScan(env, scan(`${ILLEGIBLE} ${ILLEGIBLE}\n${ILLEGIBLE}`, 0.1));
  assertEquals(out, { status: 'failed', failure_kind: 'unsupported', error_code: 'unreadable_scan' });
  assertEquals(env.extractor.sent.length, 0);
  assertEquals(env.db.facts.length, 0);
});

Deno.test('without consent nothing is sent: the scan is not transcribed', async () => {
  const env = makeContext();
  env.db.consent.clear();
  const ocr = scan(LEGIBLE_SCAN, 0.97);
  const out = await processScan(env, ocr);
  assertEquals(out.status === 'failed' && out.failure_kind, 'consent_required');
  assertEquals(ocr.calls, 0);
  assertEquals(env.extractor.sent.length, 0);
});

Deno.test('without an OCR step a scan is still refused as unsupported (no AI call)', async () => {
  const env = makeContext();
  const out = await processScan(env, undefined);
  assertEquals(out, { status: 'failed', failure_kind: 'unsupported', error_code: 'scanned_pdf' });
  assertEquals(env.extractor.sent.length, 0);
});

Deno.test('text PDFs never go through OCR', async () => {
  const env = makeContext();
  const ocr = scan(LEGIBLE_SCAN, 0.97);
  env.db.addDoc(DOC);
  env.storage.files.set(`${USER}/${DOC}.pdf`, buildTextPdf(REPORT_A));
  const claimed = await env.db.claimDocument(DOC, USER, false, 3);
  const out = await processClaimedDocument({ ...env.ctx, ocr }, claimed!, USER);
  assertEquals(out.status, 'completed');
  assertEquals(ocr.calls, 0);
});

Deno.test('reading a scan again never creates duplicate facts', async () => {
  const env = makeContext();
  const first = await processScan(env, scan(LEGIBLE_SCAN, 0.97));
  const again = await processScan(env, scan(LEGIBLE_SCAN, 0.97), { reprocess: true });
  assertEquals(first.status === 'completed' && first.facts_written, 2);
  assertEquals(again.status === 'completed' && again.facts_written, 2);
  assertEquals(passed(env).length, 2);
});

Deno.test('a scan whose transcription names someone else is held for review, nothing added', async () => {
  const env = makeContext();
  const out = await processScan(env, scan(LEGIBLE_SCAN.replace('Asha Verma', 'Meera Nair').replace('14/08/1985', '03/03/1990'), 0.97));
  assertEquals(out.status === 'failed' && out.failure_kind, 'identity_mismatch');
  assertEquals(env.db.facts.length, 0);
});

// ------------------------------------------------------- the OCR provider --

class RecordingProvider implements JsonModelProvider {
  readonly provider = 'fake';
  readonly model = 'fake-model';
  requests: JsonRequest[] = [];
  constructor(private readonly answer: unknown) {}
  generateJson(request: JsonRequest) {
    this.requests.push(request);
    return Promise.resolve(this.answer);
  }
}

Deno.test('the OCR provider sends only the PDF and a fixed instruction — no account data', async () => {
  const ai = new RecordingProvider({ pages: [{ page_number: 1, text: LEGIBLE_SCAN, legibility: 0.95 }] });
  const pdf = buildImageOnlyPdf();
  const result = await new ModelOcrProvider(ai).recognize(pdf, 1);
  assertEquals(result.pages[0].text, LEGIBLE_SCAN);
  assertEquals(ai.requests.length, 1);
  assertEquals(ai.requests[0].pdf, pdf);
  assertEquals(ai.requests[0].content, 'Transcribe all 1 page(s) of the attached document.');
});

Deno.test('scans too large to send are refused before any AI call', async () => {
  const ai = new RecordingProvider({ pages: [] });
  await assertRejects(() => new ModelOcrProvider(ai).recognize(new Uint8Array(OCR_MAX_BYTES + 1), 1), EngineError, 'scan_too_large');
  await assertRejects(() => new ModelOcrProvider(ai).recognize(new Uint8Array(10), 21), EngineError, 'scan_too_large');
  assertEquals(ai.requests.length, 0);
});

Deno.test('a malformed transcription is rejected, never trusted', () => {
  for (const bad of [null, {}, { pages: 'x' }, { pages: [{ page_number: 2, text: 'x', legibility: 1 }] }, { pages: [{ page_number: 1, text: 5, legibility: 1 }] }]) {
    try {
      parseTranscription(bad, 1);
      throw new Error('accepted');
    } catch (error) {
      assertEquals((error as EngineError).code, 'invalid_ocr_output');
    }
  }
  assertEquals(parseTranscription({ pages: [{ page_number: 1, text: 'ok', legibility: 7 }] }, 1).legibility.get(1), 1);
});
