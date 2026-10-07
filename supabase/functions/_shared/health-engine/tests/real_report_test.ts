/**
 * Regression: REAL-WORLD report layouts must produce facts (synthetic content).
 *
 * Production reports completed with 0 facts — nothing written, held,
 * discarded or duplicated — because every fact carried the report's date as
 * printed ("07/09/2026 10:45 AM"), the parser didn't know that form, and the
 * whole fact was rejected as invalid_date. The extractor is TOLD to copy dates
 * exactly as written, so the dates it returned were correct. These fixtures
 * pin the fix end to end: real PDF text → model response (in the exact
 * extraction-schema shape) → validation → normalization → stored facts.
 */
import { assertEquals } from '@std/assert';

import type { OcrProvider } from '../ocr.ts';
import { processClaimedDocument } from '../pipeline.ts';
import { validateExtraction } from '../validate.ts';
import { USER, makeContext } from './fakes.ts';
import { buildImageOnlyPdf, buildTextPdf } from './fixtures.ts';

const DOC = 'cccccccc-0000-4000-8000-00000000000c';
const TODAY = new Date('2026-10-06T12:00:00Z');

// A typical Indian lab report page as unpdf extracts it: headers, label/value
// columns separated by runs of spaces, date-times, a "Bio. Ref. Interval".
const LAB_LINES = [
  'CITY CARE DIAGNOSTICS PVT. LTD.',
  'Patient Name : Ms. ASHA VERMA            Age/Sex : 41 Y / F',
  'DOB : 14/08/1985                          Ref. By : Dr. Self',
  'Collected On : 15/09/2026 10:45 AM        Reported On : 15/09/2026 06:12 PM',
  'HAEMATOLOGY',
  'Test Name                 Result     Unit          Bio. Ref. Interval',
  'Haemoglobin               13.5       g/dL          12.0 - 15.0',
  'Total Leucocyte Count     7,800      /cumm         4000 - 11000',
  'Platelet Count            2.5        lakhs/cumm    1.5 - 4.5',
  'BIOCHEMISTRY',
  'Glucose (Fasting)         112        mg/dL         70 - 100',
  'HbA1c                     6.2        %             4.0 - 5.6',
];

const ob = (test_name: string, raw_value: string, raw_unit: string, reference_range: string, source_text: string) => ({
  test_name,
  raw_value,
  raw_unit,
  reference_range,
  observation_date: '15/09/2026 10:45 AM', // copied exactly as printed, as the prompt requires
  category: 'laboratory',
  page: 1,
  source_text,
  confidence: 0.95,
});

/** A model response in the exact extraction-schema shape. */
const labResponse = () => ({
  patient_name: { value: 'ASHA VERMA', page: 1, source_text: 'Patient Name : Ms. ASHA VERMA' },
  patient_date_of_birth: { value: '14/08/1985', page: 1, source_text: 'DOB : 14/08/1985' },
  report_date: { value: '15/09/2026 06:12 PM', page: 1, source_text: 'Reported On : 15/09/2026 06:12 PM' },
  observations: [
    ob('Haemoglobin', '13.5', 'g/dL', '12.0 - 15.0', 'Haemoglobin               13.5       g/dL          12.0 - 15.0'),
    ob('Total Leucocyte Count', '7,800', '/cumm', '4000 - 11000', 'Total Leucocyte Count     7,800      /cumm         4000 - 11000'),
    ob('Platelet Count', '2.5', 'lakhs/cumm', '1.5 - 4.5', 'Platelet Count            2.5        lakhs/cumm    1.5 - 4.5'),
    ob('Glucose (Fasting)', '112', 'mg/dL', '70 - 100', 'Glucose (Fasting) 112 mg/dL 70 - 100'),
    ob('HbA1c', '6.2', '%', '4.0 - 5.6', 'HbA1c 6.2 % 4.0 - 5.6'),
  ],
  medications: [],
  conditions: [],
  allergies: [],
  procedures: [],
  encounters: [],
});

const live = (env: ReturnType<typeof makeContext>) =>
  env.db.liveObservations().map((f) => [f.row.name_as_written, f.row.value_as_written, f.row.unit_as_written, f.row.effective_date]);

Deno.test('a realistic text-layer lab report produces dated, evidence-backed facts', async () => {
  const env = makeContext();
  env.db.addDoc(DOC);
  env.storage.files.set(`${USER}/${DOC}.pdf`, buildTextPdf([LAB_LINES]));
  env.extractor.respond = () => labResponse();
  const claimed = await env.db.claimDocument(DOC, USER, false, 3);
  const out = await processClaimedDocument({ ...env.ctx, today: TODAY }, claimed!, USER);

  assertEquals(out.status, 'completed');
  assertEquals(out.status === 'completed' && out.facts_rejected, 0);
  assertEquals(out.status === 'completed' && out.facts_written, 5);
  assertEquals(live(env), [
    ['Haemoglobin', '13.5', 'g/dL', '2026-09-15'],
    ['Total Leucocyte Count', '7,800', '/cumm', '2026-09-15'],
    ['Platelet Count', '2.5', 'lakhs/cumm', '2026-09-15'],
    ['Glucose (Fasting)', '112', 'mg/dL', '2026-09-15'],
    ['HbA1c', '6.2', '%', '2026-09-15'],
  ]);
  assertEquals(env.db.docs.get(DOC)!.identity_check, 'consistent');
  assertEquals(env.db.docs.get(DOC)!.report_date, '2026-09-15');
});

Deno.test('a realistic scanned report (OCR transcription) produces the same facts', async () => {
  const env = makeContext();
  env.db.addDoc(DOC);
  env.storage.files.set(`${USER}/${DOC}.pdf`, buildImageOnlyPdf());
  const transcription = LAB_LINES.map((l) => l.replace(/ {2,}/g, '  ')).join('\n');
  const ocr: OcrProvider = {
    name: 'scripted',
    promptVersion: 'test-ocr',
    recognize: () => Promise.resolve({ pages: [{ page_number: 1, text: transcription }], legibility: new Map([[1, 0.94]]) }),
  };
  env.extractor.respond = () => {
    const r = labResponse();
    // Quotes come from the transcription, so their spacing follows it.
    r.observations = r.observations.map((o) => ({ ...o, source_text: o.source_text.replace(/ {2,}/g, '  ') }));
    return r;
  };
  const claimed = await env.db.claimDocument(DOC, USER, false, 3);
  const out = await processClaimedDocument({ ...env.ctx, ocr, today: TODAY }, claimed!, USER);

  assertEquals(out.status === 'completed' && out.facts_written, 5);
  assertEquals(out.status === 'completed' && out.facts_rejected, 0);
  assertEquals(live(env).length, 5);
});

Deno.test('a date in a form the parser does not know keeps the fact (undated) and holds it for review', () => {
  const pages = [{ page_number: 1, text: 'Sample drawn 15th of Sept 2026\nHaemoglobin 13.5 g/dL' }];
  const r = validateExtraction(
    {
      ...labResponse(),
      patient_name: null,
      patient_date_of_birth: null,
      report_date: null,
      observations: [{ ...ob('Haemoglobin', '13.5', 'g/dL', '', 'Haemoglobin 13.5 g/dL'), observation_date: '15th of Sept 2026' }],
    } as never,
    pages,
    { today: TODAY },
  );
  assertEquals(r.rejected, []);
  assertEquals(r.facts.length, 1);
  assertEquals(r.facts[0].row.effective_date, null);
  assertEquals(r.facts[0].confidence_gate, 'needs_review');
});

Deno.test('dates are still strict: a date not on the page, or impossible, still rejects the fact', () => {
  const pages = [{ page_number: 1, text: 'Collected On : 15/09/2026 10:45 AM\nHaemoglobin 13.5 g/dL' }];
  const run = (date: string) =>
    validateExtraction(
      { ...labResponse(), patient_name: null, patient_date_of_birth: null, report_date: null, observations: [{ ...ob('Haemoglobin', '13.5', 'g/dL', '', 'Haemoglobin 13.5 g/dL'), observation_date: date }] } as never,
      pages,
      { today: TODAY },
    ).rejected.map((x) => x.reason);
  assertEquals(run('16/09/2026 10:45 AM'), ['invalid_date']); // not on the page
  assertEquals(run('15/09/2026 10:45 AM'), []); // on the page, parsed
});
