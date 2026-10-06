import { buildCommitPayload, mergeExtractions } from '../../../supabase/functions/_shared/pipeline.ts';
import type { RawExtraction } from '../../../supabase/functions/_shared/schema.ts';
import {
  REPORT_A, REPORT_B, REPORT_C, REPORT_WRONG_PATIENT, SYNTH_PROFILE, goodExtraction, labReport,
} from './fixtures.ts';

const SHA = 'a'.repeat(64);
const build = (f = REPORT_A, ex: RawExtraction = goodExtraction(f), extra: Record<string, unknown> = {}) =>
  buildCommitPayload({ pages: f.pages, pageCount: f.pages.length, textSource: 'pdf_text_layer', contentSha256: SHA, extraction: ex, profile: SYNTH_PROFILE, ...extra });

async function built(f = REPORT_A, ex?: RawExtraction, extra?: Record<string, unknown>) {
  const r = await build(f, ex, extra);
  if (r.kind !== 'built') throw new Error('expected built');
  return r;
}

describe('pipeline: happy path (Report A)', () => {
  it('produces normalised, evidence-linked, trusted observations', async () => {
    const r = await built();
    expect(r.identity).toBe('match');
    expect(r.payload.observations).toHaveLength(2);
    const hba1c = r.payload.observations.find((o) => o.code === 'hba1c')!;
    expect(hba1c).toMatchObject({
      value_as_written: '5.8', value_numeric: 5.8, value_normalized: 5.8, unit_normalized: '%',
      effective_date: '2026-01-15', effective_date_basis: 'collection', review_status: 'unreviewed', review_reason: null,
      page_number: 1, source_text: 'HbA1c 5.8 % 4.0 - 5.6', reference_low: 4, reference_high: 5.6,
    });
    expect(hba1c.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(r.payload.document.identity_check).toBe('match');
    expect(r.payload.document.report_date).toBe('2026-01-15');
    expect(r.stats.accepted).toEqual({ observations: 2 });
  });
  it('every stored fact carries page, source text and confidence', async () => {
    const r = await built();
    for (const o of r.payload.observations) {
      expect(o.page_number).toBeGreaterThanOrEqual(1);
      expect((o.source_text as string).length).toBeGreaterThan(2);
      expect(typeof o.confidence).toBe('number');
    }
  });
  it('A, B, C give distinct fingerprints; re-processing A gives identical ones (idempotent)', async () => {
    const fps = async (f: typeof REPORT_A) => (await built(f)).payload.observations.map((o) => o.fingerprint as string).sort();
    const a1 = await fps(REPORT_A);
    const a2 = await fps(REPORT_A);
    expect(a1).toEqual(a2);
    const all = new Set([...a1, ...(await fps(REPORT_B)), ...(await fps(REPORT_C))]);
    expect(all.size).toBe(6);
  });
});

describe('pipeline: evidence is a hard boundary', () => {
  it('rejects a quote that is not on the page', async () => {
    const ex = goodExtraction(REPORT_A);
    (ex.observations[0] as Record<string, unknown>).source_text = 'HbA1c 7.9 % 4.0 - 5.6';
    const r = await built(REPORT_A, ex);
    expect(r.payload.observations).toHaveLength(1);
    expect(r.stats.rejected).toMatchObject({ quote_not_on_page: 1 });
  });
  it('rejects a value that is not in the quote', async () => {
    const ex = goodExtraction(REPORT_A);
    (ex.observations[0] as Record<string, unknown>).value_as_written = '9.9';
    const r = await built(REPORT_A, ex);
    expect(r.stats.rejected).toMatchObject({ value_not_in_quote: 1 });
    expect(r.payload.observations.map((o) => o.code)).toEqual(['ldl_cholesterol']);
  });
  it('rejects a wrong page number', async () => {
    const ex = goodExtraction(REPORT_A);
    (ex.observations[0] as Record<string, unknown>).page_number = 2;
    const r = await built(REPORT_A, ex);
    expect(r.stats.rejected).toMatchObject({ page_missing: 1 });
  });
  it('rejects a name that is not in the quote', async () => {
    const ex = goodExtraction(REPORT_A);
    (ex.observations[0] as Record<string, unknown>).name_as_written = 'Ferritin';
    const r = await built(REPORT_A, ex);
    expect(r.stats.rejected).toMatchObject({ name_not_in_quote: 1 });
  });
  it('a unit that is not in the quote is dropped and the fact needs review', async () => {
    const ex = goodExtraction(REPORT_A);
    (ex.observations[1] as Record<string, unknown>).unit_as_written = 'mmol/L';
    const r = await built(REPORT_A, ex);
    const ldl = r.payload.observations.find((o) => o.code === 'ldl_cholesterol')!;
    expect(ldl).toMatchObject({ unit_as_written: null, value_normalized: null, review_status: 'needs_review', review_reason: 'unit_not_in_quote' });
    expect(ldl.confidence as number).toBeLessThanOrEqual(0.5);
  });
});

describe('pipeline: confidence thresholds', () => {
  it('low confidence is stored as needs_review, never silently trusted', async () => {
    const ex = goodExtraction(REPORT_A);
    (ex.observations[0] as Record<string, unknown>).confidence = 0.6;
    const r = await built(REPORT_A, ex);
    const o = r.payload.observations.find((x) => x.code === 'hba1c')!;
    expect(o).toMatchObject({ review_status: 'needs_review', review_reason: 'low_confidence' });
    expect(r.stats.needs_review).toEqual({ low_confidence: 1 });
  });
  it('threshold is configurable and boundary-inclusive', async () => {
    const ex = goodExtraction(REPORT_A);
    (ex.observations[0] as Record<string, unknown>).confidence = 0.75;
    const ok = await built(REPORT_A, ex);
    expect(ok.payload.observations.find((x) => x.code === 'hba1c')!.review_status).toBe('unreviewed');
    const strict = await built(REPORT_A, ex, { confidenceThreshold: 0.9 });
    expect(strict.payload.observations.find((x) => x.code === 'hba1c')!.review_status).toBe('needs_review');
  });
});

describe('pipeline: ambiguity is never guessed', () => {
  it('range or approximate values are ambiguous → review, raw value kept', async () => {
    const f = labReport({ id: 'X', date: '2026-01-15', dateLabel: '15 Jan 2026', hba1c: '5.8-6.1', ldl: '120' });
    const r = await built(f, goodExtraction(f));
    const o = r.payload.observations.find((x) => x.code === 'hba1c')!;
    expect(o).toMatchObject({ value_numeric: null, value_normalized: null, value_text: '5.8-6.1', review_status: 'needs_review', review_reason: 'ambiguous_value' });
  });
  it('ambiguous dd/mm dates → review, no effective date invented', async () => {
    const f = labReport({ id: 'X', date: '', dateLabel: '05/06/2026', hba1c: '5.8', ldl: '120' });
    const r = await built(f, goodExtraction(f));
    for (const o of r.payload.observations) {
      expect(o).toMatchObject({ effective_date: null, effective_date_basis: 'none', review_status: 'needs_review', review_reason: 'ambiguous_date' });
    }
  });
  it('no date anywhere → missing_date review', async () => {
    const f = labReport({ id: 'X', date: '', dateLabel: 'not stated', hba1c: '5.8', ldl: '120' });
    const r = await built(f, goodExtraction(f));
    expect(r.payload.observations[0]).toMatchObject({ review_status: 'needs_review', review_reason: 'missing_date' });
  });
  it('a missing value (—) is not a fact', async () => {
    const f = labReport({ id: 'X', date: '2026-01-15', dateLabel: '15 Jan 2026', hba1c: '5.8', ldl: '120' });
    const ex = goodExtraction(f);
    (ex.observations[0] as Record<string, unknown>).value_as_written = null;
    const r = await built(f, ex);
    expect(r.stats.rejected).toMatchObject({ schema_invalid: 1 });
    expect(r.payload.observations).toHaveLength(1);
  });
  it('mmol/mol HbA1c is converted by the published rule only', async () => {
    const f = { ...REPORT_A, pages: [{ pageNumber: 1, text: REPORT_A.pages[0].text.replace('HbA1c 5.8 % 4.0 - 5.6', 'HbA1c 42 mmol/mol 20 - 38') }] };
    const ex = goodExtraction(f);
    Object.assign(ex.observations[0] as object, { source_text: 'HbA1c 42 mmol/mol 20 - 38', value_as_written: '42', unit_as_written: 'mmol/mol', reference_range_as_written: '20 - 38' });
    const r = await built(f, ex);
    const o = r.payload.observations.find((x) => x.code === 'hba1c')!;
    expect(o).toMatchObject({ value_numeric: 42, unit_as_written: 'mmol/mol', unit_normalized: '%', normalization_rule: 'hba1c_mmol_mol_to_percent_v1' });
    expect(o.value_normalized as number).toBeCloseTo(5.99, 2);
    expect(o.reference_low as number).toBeCloseTo(3.98, 2);
  });
});

describe('pipeline: wrong patient', () => {
  it('explicit patient conflict → patient_mismatch, nothing committed', async () => {
    const r = await build(REPORT_WRONG_PATIENT, goodExtraction(REPORT_WRONG_PATIENT, { name: 'Ravi Notyou', dob: '03 Nov 1971' }));
    expect(r.kind).toBe('patient_mismatch');
  });
  it('a model-invented patient name that is not on the page is ignored (cannot cause a false mismatch)', async () => {
    const r = await build(REPORT_A, goodExtraction(REPORT_A, { name: 'Somebody Else', dob: '01 Jan 1960' }));
    expect(r.kind).toBe('built');
    if (r.kind === 'built') expect(r.identity).toBe('unverifiable');
  });
  it('no identity on the report → unverifiable but processed', async () => {
    const f = { ...REPORT_A, pages: [{ pageNumber: 1, text: REPORT_A.pages[0].text.replace(/Patient:.*\n|DOB:.*\n/g, '') }] };
    const r = await built(f, goodExtraction(f, { name: '', dob: '' } as never));
    expect(r.identity).toBe('unverifiable');
  });
});

describe('pipeline: conditions, allergies, medications, procedures', () => {
  const pages = [{
    pageNumber: 1,
    text: [
      'Patient: Asha Synthetic', 'Family history of diabetes', 'Diagnosis: Hypothyroidism', 'History of hypertension',
      'NKDA', 'Allergic to penicillin (rash)', 'Metformin 500 mg twice daily after food', 'Hepatitis B vaccine dose 2 on 02 Feb 2026',
    ].join('\n'),
  }];
  const base = { page_number: 1, confidence: 0.9 };
  const ex: RawExtraction = {
    document: { title: null, document_type: null, report_date_as_written: null, collection_date_as_written: null, provider_name: null, patient_name_as_written: null, patient_dob_as_written: null },
    encounters: [],
    observations: [],
    conditions: [
      { ...base, source_text: 'Family history of diabetes', name_as_written: 'diabetes', assertion: 'diagnosed', status_as_written: null, recorded_date_as_written: null, encounter_key: null },
      { ...base, source_text: 'Diagnosis: Hypothyroidism', name_as_written: 'Hypothyroidism', assertion: 'diagnosed', status_as_written: null, recorded_date_as_written: null, encounter_key: null },
      { ...base, source_text: 'History of hypertension', name_as_written: 'hypertension', assertion: 'diagnosed', status_as_written: null, recorded_date_as_written: null, encounter_key: null },
    ],
    allergies: [
      { ...base, source_text: 'NKDA', substance_as_written: 'NKDA', assertion: 'reported', reaction_as_written: null, severity_as_written: null, recorded_date_as_written: null, encounter_key: null },
      { ...base, source_text: 'Allergic to penicillin (rash)', substance_as_written: 'penicillin', assertion: 'reported', reaction_as_written: 'rash', severity_as_written: null, recorded_date_as_written: null, encounter_key: null },
    ],
    medications: [
      { ...base, source_text: 'Metformin 500 mg twice daily after food', name_as_written: 'Metformin', strength_as_written: '500 mg', dose_as_written: null, frequency_as_written: 'twice daily', route_as_written: null, duration_as_written: null, instructions_as_written: 'after food', status_as_written: null, start_date_as_written: null, end_date_as_written: null, prescribed_date_as_written: null, prescriber_name: null, encounter_key: null },
    ],
    procedures: [
      { ...base, source_text: 'Hepatitis B vaccine dose 2 on 02 Feb 2026', name_as_written: 'Hepatitis B vaccine', procedure_kind: 'immunization', performed_date_as_written: '02 Feb 2026', performer_name: null, facility_name: null, dose_number_as_written: '2', encounter_key: null },
    ],
  };
  it('"Family history of diabetes" never becomes diagnosed diabetes; assertions are evidence-capped', async () => {
    const r = await built({ ...REPORT_A, pages }, ex);
    const names = r.payload.conditions.map((c) => [c.name_as_written, c.assertion]);
    expect(names).toEqual([['Hypothyroidism', 'diagnosed'], ['hypertension', 'reported']]);
    expect(r.stats.rejected).toMatchObject({ not_patient_condition: 1, not_an_allergy: 1 });
  });
  it('allergies, medications, procedures kept with their evidence', async () => {
    const r = await built({ ...REPORT_A, pages }, ex);
    expect(r.payload.allergies).toHaveLength(1);
    expect(r.payload.allergies[0]).toMatchObject({ substance_as_written: 'penicillin', assertion: 'reported', reaction_as_written: 'rash' });
    expect(r.payload.medications[0]).toMatchObject({ name_as_written: 'Metformin', strength_as_written: '500 mg', frequency_as_written: 'twice daily' });
    expect(r.payload.procedures[0]).toMatchObject({ procedure_kind: 'immunization', performed_date: '2026-02-02', dose_number_as_written: '2' });
  });
  it('a medication field not present in the quote is dropped, not invented', async () => {
    const bad: RawExtraction = { ...ex, conditions: [], allergies: [], procedures: [], medications: [{ ...(ex.medications[0] as object), strength_as_written: '850 mg' }] };
    const r = await built({ ...REPORT_A, pages }, bad);
    expect(r.payload.medications[0].strength_as_written).toBeNull();
  });
});

describe('pipeline: blood pressure and duplicates', () => {
  it('splits 120/80 into two observations', async () => {
    const pages = [{ pageNumber: 1, text: 'Collection date: 15 Jan 2026\nBlood Pressure 120/80 mmHg' }];
    const ex = goodExtraction(REPORT_A);
    ex.observations = [{
      page_number: 1, source_text: 'Blood Pressure 120/80 mmHg', confidence: 0.9, name_as_written: 'Blood Pressure', value_as_written: '120/80',
      unit_as_written: 'mmHg', reference_range_as_written: null, abnormal_flag_as_written: null, date_as_written: null, specimen: null, category: 'vital_sign', encounter_key: null,
    }] as never;
    const r = await built({ ...REPORT_A, pages }, ex);
    expect(r.payload.observations.map((o) => [o.code, o.value_numeric])).toEqual([['bp_systolic', 120], ['bp_diastolic', 80]]);
  });
  it('the same fact proposed twice is stored once', async () => {
    const ex = goodExtraction(REPORT_A);
    ex.observations = [ex.observations[0], ex.observations[0]];
    const r = await built(REPORT_A, ex);
    expect(r.payload.observations).toHaveLength(1);
    expect(r.stats.rejected).toMatchObject({ duplicate: 1 });
  });
});

describe('mergeExtractions', () => {
  it('namespaces encounter keys per chunk and takes the first non-null document field', () => {
    const e = (key: string, title: string | null): RawExtraction => ({
      ...goodExtraction(REPORT_A),
      document: { ...goodExtraction(REPORT_A).document, title },
      encounters: [{ key } as never], observations: [{ encounter_key: key } as never],
    });
    const m = mergeExtractions([e('k', null), e('k', 'T')]);
    expect(m.document.title).toBe('T');
    expect((m.encounters as { key: string }[]).map((x) => x.key)).toEqual(['c0_k', 'c1_k']);
    expect((m.observations as { encounter_key: string }[]).map((x) => x.encounter_key)).toEqual(['c0_k', 'c1_k']);
  });
});

describe('pipeline never leaks identity into stats', () => {
  it('stats contain only counts', async () => {
    const r = await built();
    expect(JSON.stringify(r.stats)).not.toMatch(/Synthetic|Asha|1985/);
  });
});
