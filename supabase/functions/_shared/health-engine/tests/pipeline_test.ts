/** End-to-end pipeline: real synthetic PDFs → real unpdf → scripted extractor → validation → fake DB. */
import { assertEquals } from '@std/assert';

import { EngineError, USER_MESSAGES } from '../errors.ts';
import { processClaimedDocument } from '../pipeline.ts';
import { CONSENT_VERSION, USER, makeContext } from './fakes.ts';
import {
  MALFORMED_PDF,
  REPORT_A,
  REPORT_AMBIGUOUS_VALUE,
  REPORT_B,
  REPORT_C,
  REPORT_MISSING_VALUE,
  REPORT_WRONG_PATIENT,
  buildImageOnlyPdf,
  buildTextPdf,
  honestExtraction,
} from './fixtures.ts';

const DOC_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const DOC_B = 'aaaaaaaa-0000-4000-8000-00000000000b';
const DOC_C = 'aaaaaaaa-0000-4000-8000-00000000000c';

async function upload(env: ReturnType<typeof makeContext>, id: string, pdf: Uint8Array) {
  env.db.addDoc(id);
  env.storage.files.set(`${USER}/${id}.pdf`, pdf);
  const claimed = await env.db.claimDocument(id, USER, false, 3);
  return processClaimedDocument(env.ctx, claimed!, USER);
}

const values = (env: ReturnType<typeof makeContext>) =>
  env.db.liveObservations().map((f) => [f.row.name_as_written, f.row.value_numeric, f.row.unit_normalized, f.row.effective_date]);

Deno.test('Reports A, B and C become dated, evidence-backed observations', async () => {
  const env = makeContext();
  assertEquals((await upload(env, DOC_A, buildTextPdf(REPORT_A))).status, 'completed');
  assertEquals((await upload(env, DOC_B, buildTextPdf(REPORT_B))).status, 'completed');
  assertEquals((await upload(env, DOC_C, buildTextPdf(REPORT_C))).status, 'completed');

  assertEquals(values(env), [
    ['HbA1c', 5.8, '%', '2026-03-12'], // 12/03/2026 resolved DD/MM because DOB 14/08/1985 proves the order
    ['LDL Cholesterol', 120, 'mg/dL', '2026-03-12'],
    ['HbA1c', 6.1, '%', '2026-06-10'],
    ['LDL Cholesterol', 135, 'mg/dL', '2026-06-10'],
    ['HbA1c', 5.9, '%', '2026-09-15'],
    ['LDL Cholesterol', 128, 'mg/dL', '2026-09-15'],
  ]);
  for (const f of env.db.facts) {
    assertEquals(typeof f.row.source_text, 'string');
    assertEquals(f.row.page_number, 1);
    assertEquals(/^[0-9a-f]{64}$/.test(f.fingerprint), true);
  }
  assertEquals(env.db.docs.get(DOC_A)!.status, 'completed');
  assertEquals(env.db.docs.get(DOC_A)!.identity_check, 'consistent');
  assertEquals(env.db.runs.every((r) => r.consent_version === CONSENT_VERSION && r.status === 'succeeded'), true);
});

Deno.test('the extractor receives only page text — never the PDF bytes or account data', async () => {
  const env = makeContext();
  await upload(env, DOC_A, buildTextPdf(REPORT_A));
  assertEquals(env.extractor.sent.length, 1);
  const sent = env.extractor.sent[0];
  assertEquals(Object.keys(sent[0]).sort(), ['page_number', 'text']);
  assertEquals(sent[0].text.includes('%PDF'), false);
  assertEquals(sent[0].text.includes('1985-08-14'), false); // account DOB (ISO) is not sent
});

Deno.test('scanned PDF: unsupported, and the AI provider is never called', async () => {
  const env = makeContext();
  const outcome = await upload(env, DOC_A, buildImageOnlyPdf());
  assertEquals(outcome, { status: 'failed', failure_kind: 'unsupported', error_code: 'scanned_pdf' });
  assertEquals(env.extractor.sent.length, 0);
  assertEquals(env.db.failures[0].userMessage, USER_MESSAGES.scanned);
  assertEquals(env.db.failures[0].textLayer, 'absent');
  assertEquals(env.db.calls.includes('startRun'), false);
});

Deno.test('malformed PDF: unsupported, no AI call', async () => {
  const env = makeContext();
  const outcome = await upload(env, DOC_A, MALFORMED_PDF);
  assertEquals(outcome.status === 'failed' && outcome.failure_kind, 'unsupported');
  assertEquals(env.extractor.sent.length, 0);
});

Deno.test('consent revoked after the claim: re-checked before the AI call — nothing is sent', async () => {
  const env = makeContext();
  env.db.addDoc(DOC_A);
  env.storage.files.set(`${USER}/${DOC_A}.pdf`, buildTextPdf(REPORT_A));
  const claimed = await env.db.claimDocument(DOC_A, USER, false, 3);
  env.db.consent.delete(USER); // revoked between claim and processing
  const outcome = await processClaimedDocument(env.ctx, claimed!, USER);
  assertEquals(outcome, { status: 'failed', failure_kind: 'consent_required', error_code: 'consent_required' });
  assertEquals(env.extractor.sent.length, 0);
  // A consent version mismatch is treated the same as no consent.
  const env2 = makeContext();
  env2.db.consent.set(USER, 'ai-2020-01');
  assertEquals((await upload(env2, DOC_A, buildTextPdf(REPORT_A))).status, 'failed');
  assertEquals(env2.extractor.sent.length, 0);
});

Deno.test("wrong patient: flagged for review, NOTHING ingested", async () => {
  const env = makeContext();
  const outcome = await upload(env, DOC_A, buildTextPdf(REPORT_WRONG_PATIENT));
  assertEquals(outcome, { status: 'failed', failure_kind: 'identity_mismatch', error_code: 'identity_mismatch' });
  assertEquals(env.db.facts.length, 0);
  assertEquals(env.db.docs.get(DOC_A)!.review_reason, 'identity_mismatch');
  assertEquals(env.db.docs.get(DOC_A)!.identity_check, 'mismatch');
});

Deno.test('missing value: no fact is invented for the blank row', async () => {
  const env = makeContext();
  env.extractor.respond = (pages) => {
    const r = honestExtraction(pages);
    // A careless model fills the blank HbA1c with a plausible number.
    r.observations.push({
      test_name: 'HbA1c', raw_value: '5.8', raw_unit: '%', reference_range: '4.0 - 5.6', observation_date: null,
      category: 'laboratory', page: 1, source_text: 'HbA1c % 4.0 - 5.6', confidence: 0.9,
    });
    return r;
  };
  const outcome = await upload(env, DOC_A, buildTextPdf(REPORT_MISSING_VALUE));
  assertEquals(outcome.status === 'completed' && outcome.facts_rejected, 1);
  assertEquals(values(env), [['LDL Cholesterol', 120, 'mg/dL', '2026-03-12']]);
});

Deno.test('ambiguous value: raw kept, not normalized, held for review (not in current views)', async () => {
  const env = makeContext();
  const outcome = await upload(env, DOC_A, buildTextPdf(REPORT_AMBIGUOUS_VALUE));
  assertEquals(outcome.status === 'completed' && outcome.facts_needs_review, 1);
  const ldl = env.db.facts.find((f) => f.row.name_as_written === 'LDL Cholesterol')!;
  assertEquals([ldl.row.value_as_written, ldl.row.value_numeric, ldl.gate], ['1,20', null, 'needs_review']);
  assertEquals(values(env), [['HbA1c', 5.8, '%', '2026-03-12']]);
});

Deno.test('hallucinated fact: quote not on the page → rejected', async () => {
  const env = makeContext();
  env.extractor.respond = (pages) => {
    const r = honestExtraction(pages);
    r.observations.push({
      test_name: 'Vitamin D', raw_value: '18', raw_unit: 'ng/mL', reference_range: null, observation_date: null,
      category: 'laboratory', page: 1, source_text: 'Vitamin D 18 ng/mL', confidence: 0.99,
    });
    return r;
  };
  const outcome = await upload(env, DOC_A, buildTextPdf(REPORT_A));
  assertEquals(outcome.status === 'completed' && outcome.facts_rejected, 1);
  assertEquals(env.db.facts.some((f) => f.row.name_as_written === 'Vitamin D'), false);
});

Deno.test('reprocessing and duplicate uploads are idempotent', async () => {
  const env = makeContext();
  await upload(env, DOC_A, buildTextPdf(REPORT_A));
  const first = env.db.facts.map((f) => f.fingerprint);

  // Reprocess the same document: old run's facts superseded, same fingerprints, no duplicates live.
  const again = await env.db.claimDocument(DOC_A, USER, true, 3);
  const outcome = await processClaimedDocument(env.ctx, again!, USER);
  assertEquals(outcome.status === 'completed' && outcome.facts_written, 2);
  assertEquals(env.db.runs.length, 2); // the first run is kept for audit
  assertEquals(env.db.facts.filter((f) => !f.superseded).map((f) => f.fingerprint), first);
  assertEquals(env.db.liveObservations().length, 2);

  // Without reprocess, a completed document can't be claimed again (no repeat AI cost).
  assertEquals(await env.db.claimDocument(DOC_A, USER, false, 3), null);

  // The same PDF uploaded as a second document: every fact is a duplicate.
  const dup = await upload(env, DOC_B, buildTextPdf(REPORT_A));
  assertEquals(dup.status === 'completed' && [dup.facts_written, dup.facts_duplicate], [0, 2]);
  assertEquals(env.db.liveObservations().length, 2);
});

Deno.test('failures are classified for the retry policy', async () => {
  const cases: [unknown, string, string][] = [
    [new EngineError('provider', 'provider_rate_limited', USER_MESSAGES.generic), 'provider', 'provider_rate_limited'],
    [new EngineError('transient', 'provider_connection', USER_MESSAGES.generic), 'transient', 'provider_connection'],
    [new EngineError('validation', 'invalid_json', USER_MESSAGES.generic), 'validation', 'invalid_json'],
    [new Error('boom'), 'transient', 'internal_error'],
  ];
  for (const [error, kind, code] of cases) {
    const env = makeContext();
    env.extractor.respond = () => {
      throw error;
    };
    const outcome = await upload(env, DOC_A, buildTextPdf(REPORT_A));
    assertEquals(outcome, { status: 'failed', failure_kind: kind, error_code: code } as never);
    assertEquals(env.db.runs[0].status, 'failed');
    assertEquals(env.db.facts.length, 0);
    // A retryable failure can be claimed again.
    assertEquals((await env.db.claimDocument(DOC_A, USER, false, 3)) !== null, true);
  }
});

Deno.test('a schema-invalid model answer is a validation failure, not a crash', async () => {
  const env = makeContext();
  env.extractor.respond = () => ({ observations: 'lots' });
  const outcome = await upload(env, DOC_A, buildTextPdf(REPORT_A));
  assertEquals(outcome, { status: 'failed', failure_kind: 'validation', error_code: 'invalid_extraction_schema' });
});

Deno.test('the original is hashed write-once; changed bytes are refused', async () => {
  const env = makeContext();
  await upload(env, DOC_A, buildTextPdf(REPORT_A));
  const sha = env.db.docs.get(DOC_A)!.content_sha256;
  env.storage.files.set(`${USER}/${DOC_A}.pdf`, buildTextPdf(REPORT_B)); // tampered
  const again = await env.db.claimDocument(DOC_A, USER, true, 3);
  const outcome = await processClaimedDocument(env.ctx, again!, USER);
  assertEquals(outcome.status, 'failed');
  assertEquals(env.db.docs.get(DOC_A)!.content_sha256, sha);
  assertEquals(env.extractor.sent.length, 1);
});

Deno.test('logs contain no report text, names, values or quotes', async () => {
  const env = makeContext();
  await upload(env, DOC_A, buildTextPdf(REPORT_A));
  await upload(env, DOC_B, buildTextPdf(REPORT_WRONG_PATIENT));
  await upload(env, DOC_C, buildImageOnlyPdf());
  const written = env.log.written();
  for (const secret of ['Asha', 'Verma', 'Rahul', 'HbA1c', 'LDL', 'Cholesterol', '14/08/1985', 'mg/dL', 'Sunrise']) {
    assertEquals(written.includes(secret), false, `log leaked ${secret}`);
  }
  assertEquals(written.includes('document_completed'), true);
});

Deno.test('missing PDF in storage: retryable failure, no AI call, nothing written', async () => {
  const env = makeContext();
  env.db.addDoc(DOC_A); // no file stored at its path
  const claimed = await env.db.claimDocument(DOC_A, USER, false, 3);
  const outcome = await processClaimedDocument(env.ctx, claimed!, USER);
  assertEquals(outcome, { status: 'failed', failure_kind: 'transient', error_code: 'storage_download_failed' });
  assertEquals(env.extractor.sent.length, 0);
  assertEquals(env.db.facts.length, 0);
});

Deno.test('low confidence: stored for review, kept out of trusted (current) results', async () => {
  const env = makeContext();
  env.extractor.respond = (pages) => {
    const r = honestExtraction(pages);
    (r.observations[1] as { confidence: number }).confidence = 0.6; // LDL read with low confidence
    return r;
  };
  const outcome = await upload(env, DOC_A, buildTextPdf(REPORT_A));
  assertEquals(outcome.status === 'completed' && [outcome.facts_written, outcome.facts_needs_review], [2, 1]);
  assertEquals(values(env), [['HbA1c', 5.8, '%', '2026-03-12']]);
});
