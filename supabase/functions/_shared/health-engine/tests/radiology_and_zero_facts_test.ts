/**
 * Regressions from three real uploads (9 Oct 2026), reproduced with
 * SYNTHETIC content only:
 *   - a written X-ray report produced no facts at all;
 *   - a lab report produced 0 written / held / discarded with no error, which
 *     looked exactly like "this report contains nothing";
 *   - month-name dates written with slashes weren't read (see real_report_test).
 *
 * Interpreting an X-ray IMAGE is not implemented; only the radiologist's
 * written report text is read.
 */
import { assertEquals } from '@std/assert';

import { EXTRACTION_SYSTEM_PROMPT } from '../extractor.ts';
import { parseDateAsWritten } from '../normalize.ts';
import type { OcrProvider } from '../ocr.ts';
import { processClaimedDocument } from '../pipeline.ts';
import { USER, makeContext } from './fakes.ts';
import { buildImageOnlyPdf } from './fixtures.ts';

const DOC = 'dddddddd-0000-4000-8000-00000000000d';
const TODAY = new Date('2026-10-09T12:00:00Z');

/** A photographed page: OCR returns this transcription. */
async function processPhoto(env: ReturnType<typeof makeContext>, transcription: string) {
  env.db.addDoc(DOC);
  env.storage.files.set(`${USER}/${DOC}.pdf`, buildImageOnlyPdf());
  const ocr: OcrProvider = {
    name: 'scripted',
    promptVersion: 'test-ocr',
    recognize: () => Promise.resolve({ pages: [{ page_number: 1, text: transcription }], legibility: new Map([[1, 0.95]]) }),
  };
  const claimed = await env.db.claimDocument(DOC, USER, false, 3);
  return processClaimedDocument({ ...env.ctx, ocr, today: TODAY }, claimed!, USER);
}

const empty = { medications: [], conditions: [], allergies: [], procedures: [], encounters: [] };

// --------------------------------------------------------------- radiology --

const XRAY = [
  'LAKEVIEW IMAGING CENTRE',
  'Patient Name : ASHA VERMA   DOB : 14/08/1985',
  'Date : Oct 07, 2026, 10:45 am',
  'X-RAY CHEST PA VIEW',
  'Findings: Both lung fields are clear. Cardiac size is normal.',
  'Costophrenic angles are clear. Bony thorax is normal.',
  'Impression: No significant abnormality detected.',
].join('\n');

const imaging = (test_name: string, raw_value: string, source_text: string) => ({
  test_name, raw_value, raw_unit: '', reference_range: '', observation_date: '', category: 'imaging', page: 1, source_text, confidence: 0.95,
});

/** What the extraction prompt asks for on a written radiology report. */
const xrayResponse = () => ({
  patient_name: { value: 'ASHA VERMA', page: 1, source_text: 'Patient Name : ASHA VERMA' },
  patient_date_of_birth: { value: '14/08/1985', page: 1, source_text: 'DOB : 14/08/1985' },
  report_date: { value: 'Oct 07, 2026, 10:45 am', page: 1, source_text: 'Date : Oct 07, 2026, 10:45 am' },
  observations: [
    imaging('Lung fields', 'clear', 'Both lung fields are clear.'),
    imaging('Cardiac size', 'normal', 'Cardiac size is normal.'),
    imaging('Costophrenic angles', 'clear', 'Costophrenic angles are clear.'),
    imaging('Bony thorax', 'normal', 'Bony thorax is normal.'),
    imaging('Impression', 'No significant abnormality detected.', 'Impression: No significant abnormality detected.'),
  ],
  ...empty,
  encounters: [
    { encounter_date: 'Oct 07, 2026, 10:45 am', encounter_type: 'imaging', provider_name: '', facility_name: '', page: 1, source_text: 'Date : Oct 07, 2026, 10:45 am', confidence: 0.95 },
  ],
});

Deno.test('the extraction prompt covers written imaging reports — and never image interpretation', () => {
  assertEquals(/A quote may run across a line break/.test(EXTRACTION_SYSTEM_PROMPT), true);
  assertEquals(/Give provider_name and facility_name only if they appear in that same source_text/.test(EXTRACTION_SYSTEM_PROMPT), true);
  assertEquals(/Written imaging reports/.test(EXTRACTION_SYSTEM_PROMPT), true);
  assertEquals(/never the image itself/.test(EXTRACTION_SYSTEM_PROMPT), true);
  assertEquals(/Never list them as conditions/.test(EXTRACTION_SYSTEM_PROMPT), true);
  assertEquals(/Do not summarise, combine sentences, or add findings/.test(EXTRACTION_SYSTEM_PROMPT), true);
});

Deno.test('a written X-ray report yields dated imaging findings and the exam, each traceable to its quote', async () => {
  const env = makeContext();
  env.extractor.respond = () => xrayResponse();
  const out = await processPhoto(env, XRAY);

  assertEquals(out.status, 'completed');
  assertEquals(out.status === 'completed' && out.facts_rejected, 0);
  assertEquals(out.status === 'completed' && out.facts_written, 6);
  const obs = env.db.liveObservations().map((f) => [f.row.name_as_written, f.row.value_as_written, f.row.category, f.row.effective_date]);
  assertEquals(obs, [
    ['Lung fields', 'clear', 'imaging', '2026-10-07'],
    ['Cardiac size', 'normal', 'imaging', '2026-10-07'],
    ['Costophrenic angles', 'clear', 'imaging', '2026-10-07'],
    ['Bony thorax', 'normal', 'imaging', '2026-10-07'],
    // A written negative impression is kept, exactly as written.
    ['Impression', 'No significant abnormality detected.', 'imaging', '2026-10-07'],
  ]);
  const encounters = env.db.facts.filter((f) => f.kind === 'encounters');
  assertEquals(encounters.map((f) => [f.row.encounter_type, f.row.encounter_date]), [['imaging', '2026-10-07']]);
  for (const f of env.db.facts) {
    assertEquals(f.row.page_number, 1);
    assertEquals(XRAY.includes(String(f.row.source_text)), true);
  }
  assertEquals(env.db.facts.some((f) => f.kind === 'conditions'), false);
  assertEquals(env.db.docs.get(DOC)!.report_date, '2026-10-07');
});

Deno.test('radiology: findings not written in the report are never stored; negatives never become conditions', async () => {
  const env = makeContext();
  env.extractor.respond = () => {
    const r = xrayResponse();
    // Invented: not in the report at all.
    r.observations.push(imaging('Pleural effusion', 'present', 'Pleural effusion is present.'));
    // A negative wrongly offered as a condition.
    (r as Record<string, unknown>).conditions = [
      { name: 'significant abnormality', assertion: 'diagnosed', page: 1, source_text: 'Impression: No significant abnormality detected.', confidence: 0.9 },
    ];
    return r;
  };
  const out = await processPhoto(env, XRAY);
  assertEquals(out.status, 'completed');
  assertEquals(env.db.liveObservations().some((f) => f.row.name_as_written === 'Pleural effusion'), false);
  assertEquals(env.db.facts.some((f) => f.kind === 'conditions'), false);
  const [d] = [...env.db.diagnostics.values()];
  assertEquals(d.rejected, { quote_not_on_page: 1, negated: 1 });
  assertEquals(d.rejected_by_kind, { observations: { quote_not_on_page: 1 }, conditions: { negated: 1 } });
});

Deno.test('radiology: identity gates still apply — no identity entered, every finding held', async () => {
  const env = makeContext();
  env.db.identity = { fullName: null, dateOfBirth: null };
  env.extractor.respond = () => xrayResponse();
  const out = await processPhoto(env, XRAY);
  assertEquals(out.status, 'completed');
  assertEquals(env.db.liveObservations().length, 0);
  assertEquals(env.db.facts.length > 0 && env.db.facts.every((f) => f.gate === 'needs_review'), true);
});

// ------------------------------------------------- zero facts, explained --

const LAB = [
  'CITY CARE DIAGNOSTICS PVT. LTD.',
  'Patient Name : Ms. ASHA VERMA   DOB : 14/08/1985',
  'Collected : 07/Oct/2026 10:45am',
  'Haemoglobin   13.5   g/dL   12.0 - 15.0',
  'Glucose (Fasting)   112   mg/dL   70 - 100',
].join('\n');

const lab = (test_name: string, raw_value: string, source_text: string) => ({
  test_name, raw_value, raw_unit: '', reference_range: '', observation_date: '', category: 'laboratory', page: 1, source_text, confidence: 0.95,
});

Deno.test('zero facts because the model found none: completed as "nothing found", diagnostics say so', async () => {
  const env = makeContext();
  env.extractor.respond = () => ({ patient_name: null, patient_date_of_birth: null, report_date: null, observations: [], ...empty });
  const out = await processPhoto(env, LAB);
  assertEquals(out.status, 'completed');
  assertEquals(out.status === 'completed' && out.facts_written, 0);
  const [d] = [...env.db.diagnostics.values()];
  assertEquals(Object.values(d.candidates).every((n) => n === 0), true);
  assertEquals(d.rejected, {});
});

Deno.test('zero facts because every candidate failed evidence checks: a clear failure, never "nothing found"', async () => {
  const env = makeContext();
  env.extractor.respond = () => ({
    patient_name: null, patient_date_of_birth: null, report_date: null,
    observations: [
      lab('Haemoglobin', '13.8', 'Haemoglobin   13.5   g/dL   12.0 - 15.0'), // value not in its quote
      lab('Glucose (Fasting)', '112', 'Glucose Fasting 112'), // quote not on the page
    ],
    ...empty,
  });
  const out = await processPhoto(env, LAB);
  assertEquals(out, { status: 'failed', failure_kind: 'validation', error_code: 'all_candidates_rejected' });
  assertEquals(env.db.facts.length, 0);
  const doc = env.db.docs.get(DOC)!;
  assertEquals(doc.status, 'failed');
  assertEquals(doc.failure_kind, 'validation');
  const [d] = [...env.db.diagnostics.values()];
  assertEquals(d, {
    candidates: { observations: 2, medications: 0, conditions: 0, allergies: 0, procedures: 0, encounters: 0 },
    accepted: 0,
    discarded: 0,
    rejected: { value_not_in_quote: 1, quote_not_on_page: 1 },
    rejected_by_kind: { observations: { value_not_in_quote: 1, quote_not_on_page: 1 } },
  });
});

Deno.test('a report whose only statements are negatives completes normally (not a reading failure)', async () => {
  const env = makeContext();
  env.extractor.respond = () => ({
    patient_name: null, patient_date_of_birth: null, report_date: null, observations: [], ...empty,
    allergies: [{ allergen: 'No known allergies', reaction: '', assertion: 'reported', page: 1, source_text: 'Haemoglobin   13.5', confidence: 0.9 }],
  });
  const out = await processPhoto(env, LAB);
  assertEquals(out.status, 'completed');
});

Deno.test('diagnostics are counts only — no names, values, quotes or dates', async () => {
  const env = makeContext();
  env.extractor.respond = () => xrayResponse();
  await processPhoto(env, XRAY);
  const serialized = JSON.stringify([...env.db.diagnostics.values()]);
  for (const sensitive of ['ASHA', 'Lung', 'clear', 'Oct', '2026', 'Impression']) assertEquals(serialized.includes(sensitive), false, sensitive);
});

// ------------------------------------------------------- dates stay strict --

Deno.test('slash month-name dates: still never impossible, future or guessed', () => {
  assertEquals(parseDateAsWritten('31/Feb/2026', TODAY), { kind: 'invalid' });
  assertEquals(parseDateAsWritten('07/Dec/2026', TODAY)?.kind, 'invalid'); // after "today"
  assertEquals(parseDateAsWritten('07/Oct/2026', TODAY), { kind: 'date', iso: '2026-10-07' });
  assertEquals(parseDateAsWritten('Oct/07/2026 10:45 AM', TODAY), { kind: 'date', iso: '2026-10-07' });
  assertEquals(parseDateAsWritten('07/10/2026', TODAY), { kind: 'ambiguous' });
});

Deno.test('radiology: a quote may run from the label on one line to the statement on the next', async () => {
  const env = makeContext();
  env.extractor.respond = () => ({
    ...xrayResponse(),
    observations: [
      // Label "Findings" is on the previous line; the quote spans the line break, in order.
      imaging('Findings', 'Costophrenic angles are clear.', 'Findings: Both lung fields are clear. Cardiac size is normal.\nCostophrenic angles are clear.'),
      // The same statement quoted out of order is not on the page: refused.
      imaging('Findings', 'Bony thorax is normal.', 'Findings: Bony thorax is normal.'),
    ],
  });
  const out = await processPhoto(env, XRAY);
  assertEquals(out.status, 'completed');
  assertEquals(env.db.liveObservations().map((f) => [f.row.name_as_written, f.row.value_as_written]), [['Findings', 'Costophrenic angles are clear.']]);
  const [d] = [...env.db.diagnostics.values()];
  assertEquals(d.rejected_by_kind, { observations: { quote_not_on_page: 1 } });
});
