import { assertEquals, assertThrows } from '@std/assert';

import { EngineError } from '../errors.ts';
import { EXTRACTION_JSON_SCHEMA, type ExtractedObservation, STATUS_NOT_STATED, type StructuredExtraction } from '../extraction-schema.ts';
import { CONFIDENCE, assertExtractionShape, validateExtraction, type Page } from '../validate.ts';

const TODAY = new Date('2026-10-06T12:00:00Z');
const PAGES: Page[] = [
  { page_number: 1, text: 'Report Date: 15/09/2026\nHbA1c 5.9 % 4.0 - 5.6\nLDL Cholesterol 128 mg/dL < 100' },
  {
    page_number: 2,
    text: 'History: Family history of diabetes. Known hypertension, diagnosed 2019.\nNo history of asthma.\nAllergies: Penicillin (rash). Medication: Metformin 500 mg twice daily',
  },
];

const empty = (): StructuredExtraction => ({
  patient_name: null,
  patient_date_of_birth: null,
  report_date: null,
  observations: [],
  medications: [],
  conditions: [],
  allergies: [],
  procedures: [],
  encounters: [],
});

const obs = (over: Record<string, unknown> = {}): ExtractedObservation => ({
  test_name: 'HbA1c',
  raw_value: '5.9',
  raw_unit: '%',
  reference_range: '4.0 - 5.6',
  observation_date: null,
  category: 'laboratory',
  page: 1,
  source_text: 'HbA1c 5.9 % 4.0 - 5.6',
  confidence: 0.96,
  ...over,
}) as ExtractedObservation;

function run(extra: Partial<StructuredExtraction>) {
  return validateExtraction({ ...empty(), ...extra } as StructuredExtraction, PAGES, { today: TODAY });
}

Deno.test('schema: the top-level shape must be exactly right', () => {
  assertThrows(() => assertExtractionShape(null), EngineError);
  assertThrows(() => assertExtractionShape({ observations: 'x' }), EngineError);
  assertThrows(() => assertExtractionShape({ ...empty(), report_date: 'not-an-object' }), EngineError);
  assertEquals(assertExtractionShape(empty()).observations, []);
});

Deno.test('a well-evidenced observation passes with raw AND normalized values', () => {
  const r = run({ observations: [obs()], report_date: { value: '15/09/2026', page: 1, source_text: 'Report Date: 15/09/2026' } });
  assertEquals(r.rejected, []);
  assertEquals(r.facts.length, 1);
  const f = r.facts[0];
  assertEquals(f.confidence_gate, 'passed');
  assertEquals(f.row.value_as_written, '5.9');
  assertEquals(f.row.unit_as_written, '%');
  assertEquals(f.row.value_numeric, 5.9);
  assertEquals(f.row.value_normalized, 5.9);
  assertEquals(f.row.unit_normalized, '%');
  assertEquals([f.row.reference_low, f.row.reference_high], [4, 5.6]);
  assertEquals(f.row.effective_date, '2026-09-15'); // falls back to the evidence-backed report date
  assertEquals(f.page_number, 1);
});

Deno.test('evidence: rejects a missing page, a quote not on the page, and a value not in the quote', () => {
  const r = run({
    observations: [
      obs({ page: 7 }),
      obs({ source_text: 'HbA1c 9.9 % 4.0 - 5.6' }), // invented quote
      obs({ raw_value: '6.4' }), // value not in quote
      obs({ test_name: 'Ferritin' }), // name not in quote
      obs({ source_text: '' }),
    ],
  });
  assertEquals(r.facts.length, 0);
  assertEquals(r.rejected.map((x) => x.reason), ['page_not_found', 'quote_not_on_page', 'value_not_in_quote', 'value_not_in_quote', 'missing_provenance']);
});

Deno.test('evidence: quote matching tolerates whitespace / dash differences only', () => {
  const r = run({ observations: [obs({ source_text: 'HbA1c  5.9 %  4.0 – 5.6' })] });
  assertEquals(r.facts.length, 1);
});

Deno.test('validation: confidence, enums, units-in-quote, dates', () => {
  const r = run({
    observations: [
      obs({ confidence: 1.4 }),
      obs({ category: 'astrology' }),
      obs({ raw_unit: 'mmol/L' }), // unit not in quote
      obs({ observation_date: '31/02/2026' }), // not on page
    ],
  });
  assertEquals(r.rejected.map((x) => x.reason), ['invalid_confidence', 'invalid_enum', 'value_not_in_quote', 'invalid_date']);
});

Deno.test('confidence gate: discard below 0.5, review below 0.85, pass above', () => {
  const r = run({
    observations: [
      obs({ confidence: CONFIDENCE.DISCARD_BELOW - 0.01 }),
      obs({ confidence: 0.7, source_text: 'LDL Cholesterol 128 mg/dL < 100', test_name: 'LDL Cholesterol', raw_value: '128', raw_unit: 'mg/dL', reference_range: '< 100' }),
      obs({ confidence: 0.9 }),
    ],
  });
  assertEquals(r.discarded, 1);
  assertEquals(r.facts.map((f) => f.confidence_gate), ['needs_review', 'passed']);
});

Deno.test('ambiguity forces review even at high confidence', () => {
  const pages: Page[] = [{ page_number: 1, text: 'LDL Cholesterol 1,20 mg/dL < 100\nCollected: 12/03/2026' }];
  const r = validateExtraction(
    {
      ...empty(),
      observations: [
        obs({ test_name: 'LDL Cholesterol', raw_value: '1,20', raw_unit: 'mg/dL', reference_range: '< 100', source_text: 'LDL Cholesterol 1,20 mg/dL < 100', confidence: 0.99, observation_date: '12/03/2026' }),
      ],
    },
    pages,
    { today: TODAY },
  );
  assertEquals(r.facts[0].confidence_gate, 'needs_review');
  assertEquals(r.facts[0].row.value_numeric, null); // not guessed
  assertEquals(r.facts[0].row.effective_date, null); // 12 Mar or 3 Dec? not guessed
  assertEquals(r.facts[0].row.value_as_written, '1,20'); // raw kept
});

Deno.test('conditions: family history is never a diagnosis; negations are not conditions', () => {
  const r = run({
    conditions: [
      { name: 'diabetes', assertion: 'diagnosed', page: 2, source_text: 'Family history of diabetes', confidence: 0.95 },
      { name: 'hypertension', assertion: 'diagnosed', page: 2, source_text: 'Known hypertension, diagnosed 2019', confidence: 0.95 },
      { name: 'asthma', assertion: 'mentioned', page: 2, source_text: 'No history of asthma', confidence: 0.95 },
    ],
  });
  assertEquals(r.facts.map((f) => [f.row.name_as_written, f.row.assertion, f.confidence_gate]), [
    ['diabetes', 'mentioned', 'needs_review'],
    ['hypertension', 'diagnosed', 'passed'],
  ]);
  assertEquals(r.rejected, [{ kind: 'conditions', reason: 'negated' }]);
});

Deno.test('allergies and medications: evidence-checked, "no known allergies" rejected', () => {
  const pages: Page[] = [...PAGES, { page_number: 3, text: 'Allergies: No known drug allergies' }];
  const r = validateExtraction(
    {
      ...empty(),
      allergies: [
        { allergen: 'Penicillin', reaction: 'rash', assertion: 'reported', page: 2, source_text: 'Allergies: Penicillin (rash)', confidence: 0.92 },
        { allergen: 'No known drug allergies', reaction: null, assertion: 'reported', page: 3, source_text: 'Allergies: No known drug allergies', confidence: 0.92 },
      ],
      medications: [
        { name: 'Metformin', dose: '500 mg', frequency: 'twice daily', status: null, start_date: null, end_date: null, page: 2, source_text: 'Metformin 500 mg twice daily', confidence: 0.9 },
        { name: 'Metformin', dose: '1000 mg', frequency: null, status: null, start_date: null, end_date: null, page: 2, source_text: 'Metformin 500 mg twice daily', confidence: 0.9 },
      ],
    },
    pages,
    { today: TODAY },
  );
  assertEquals(r.facts.map((f) => f.kind), ['medications', 'allergies']);
  assertEquals(r.rejected.map((x) => x.reason).sort(), ['negated', 'value_not_in_quote']);
});

Deno.test('identity values are returned only when evidence-backed', () => {
  const pages: Page[] = [{ page_number: 1, text: 'Patient: Asha Verma DOB: 14/08/1985' }];
  const ok = validateExtraction(
    { ...empty(), patient_name: { value: 'Asha Verma', page: 1, source_text: 'Patient: Asha Verma' } },
    pages,
    { today: TODAY },
  );
  assertEquals(ok.patientName, 'Asha Verma');
  const invented = validateExtraction(
    { ...empty(), patient_name: { value: 'Rahul Mehta', page: 1, source_text: 'Patient: Rahul Mehta' } },
    pages,
    { today: TODAY },
  );
  assertEquals(invented.patientName, null);
});

Deno.test('schema: no nullable unions (provider grammar limit) and "not stated" is representable', () => {
  const text = JSON.stringify(EXTRACTION_JSON_SCHEMA);
  assertEquals(text.includes('anyOf'), false);
  assertEquals(text.includes('"null"'), false);
  assertEquals(text.includes(STATUS_NOT_STATED), true);
});

Deno.test('"not stated" as empty strings / "not_stated" means the same as null', () => {
  const pages: Page[] = [...PAGES, { page_number: 3, text: 'Patient: Asha Verma' }];
  const asNull = validateExtraction(
    {
      ...empty(),
      observations: [obs({ raw_unit: null, reference_range: null, observation_date: null, source_text: 'HbA1c 5.9 %', raw_value: '5.9' })],
      medications: [{ name: 'Metformin', dose: '500 mg', frequency: null, status: null, start_date: null, end_date: null, page: 2, source_text: 'Metformin 500 mg twice daily', confidence: 0.9 }],
    },
    pages,
    { today: TODAY },
  );
  const asEmpty = validateExtraction(
    {
      ...empty(),
      patient_name: { value: '', page: 0, source_text: '' },
      patient_date_of_birth: { value: '', page: 0, source_text: '' },
      report_date: { value: '', page: 0, source_text: '' },
      observations: [obs({ raw_unit: '', reference_range: '', observation_date: '', source_text: 'HbA1c 5.9 %', raw_value: '5.9' })],
      medications: [{ name: 'Metformin', dose: '500 mg', frequency: '', status: 'not_stated', start_date: '', end_date: '', page: 2, source_text: 'Metformin 500 mg twice daily', confidence: 0.9 }],
    },
    pages,
    { today: TODAY },
  );
  assertEquals(asEmpty.rejected, []);
  assertEquals(asEmpty.facts.map((f) => f.row), asNull.facts.map((f) => f.row));
  assertEquals(asEmpty.facts.map((f) => f.fingerprintParts), asNull.facts.map((f) => f.fingerprintParts));
  assertEquals([asEmpty.patientName, asEmpty.patientDateOfBirth, asEmpty.reportDate], [null, null, null]);
  assertEquals(asEmpty.facts.find((f) => f.kind === 'medications')?.row.status, null);
});

Deno.test('medication status: stated values kept, unknown values rejected', () => {
  const med = (status: string) => ({ name: 'Metformin', dose: '', frequency: '', status, start_date: '', end_date: '', page: 2, source_text: 'Metformin 500 mg twice daily', confidence: 0.9 });
  const r = validateExtraction({ ...empty(), medications: [med('active'), med('paused')] } as unknown as StructuredExtraction, PAGES, { today: TODAY });
  assertEquals(r.facts.map((f) => f.row.status), ['active']);
  assertEquals(r.rejected.map((x) => x.reason), ['invalid_enum']);
});
