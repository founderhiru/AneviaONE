import { parseDateAsWritten, dateCouldMatch } from '../../../supabase/functions/_shared/dates.ts';
import { parseValueAsWritten, parseReferenceRange, roundTo } from '../../../supabase/functions/_shared/numbers.ts';
import { findAnalyte, normalizeObservation, unitKey } from '../../../supabase/functions/_shared/normalization.ts';
import { assessAllergy, assessCondition, looksLikeImmunization } from '../../../supabase/functions/_shared/assertion.ts';
import { checkQuote, indexPages, valueInQuote, optionalInQuote, textOnAnyPage } from '../../../supabase/functions/_shared/evidence.ts';
import { checkReportPerson } from '../../../supabase/functions/_shared/identity.ts';
import { confidenceBand, decideGate } from '../../../supabase/functions/_shared/confidence.ts';
import { chunkPages, splitLongText, formatChunkForPrompt } from '../../../supabase/functions/_shared/chunking.ts';
import { factFingerprint, sha256Hex } from '../../../supabase/functions/_shared/fingerprint.ts';
import { normalizeText, visibleCharCount } from '../../../supabase/functions/_shared/text.ts';
import { loadRuntimeConfig, DATA_FLOW_VERSION } from '../../../supabase/functions/_shared/config.ts';
import {
  parseExtraction, parseObservation, parseCondition, parseMedication, parseAllergy, parseProcedure, parseEncounter,
} from '../../../supabase/functions/_shared/schema.ts';

describe('dates', () => {
  it.each([
    ['2026-03-12', '2026-03-12'],
    ['12 Mar 2026', '2026-03-12'],
    ['12th March, 2026', '2026-03-12'],
    ['Mar 12, 2026', '2026-03-12'],
    ['25/03/2026', '2026-03-25'],
    ['03/25/2026', '2026-03-25'],
  ])('parses %s', (raw, iso) => {
    expect(parseDateAsWritten(raw)).toEqual({ kind: 'ok', iso });
  });
  it('never guesses an ambiguous numeric date', () => {
    expect(parseDateAsWritten('05/06/2026')).toEqual({ kind: 'ambiguous' });
  });
  it('same-day/month is not ambiguous', () => {
    expect(parseDateAsWritten('05/05/2026')).toEqual({ kind: 'ok', iso: '2026-05-05' });
  });
  it('rejects impossible dates, two-digit years and nothing', () => {
    expect(parseDateAsWritten('31/02/2026').kind).toBe('invalid');
    expect(parseDateAsWritten('12/03/26').kind).toBe('invalid');
    expect(parseDateAsWritten('').kind).toBe('none');
    expect(parseDateAsWritten(null).kind).toBe('none');
    expect(parseDateAsWritten('Fasting').kind).toBe('none');
  });
  it('dateCouldMatch accepts either reading of an ambiguous date', () => {
    expect(dateCouldMatch('05/06/1980', '1980-06-05')).toBe(true);
    expect(dateCouldMatch('05/06/1980', '1980-05-06')).toBe(true);
    expect(dateCouldMatch('05/06/1980', '1981-05-06')).toBe(false);
    expect(dateCouldMatch('15/06/1980', '1980-06-15')).toBe(true);
    expect(dateCouldMatch('15/06/1980', '1980-15-06')).toBe(false);
  });
});

describe('numbers', () => {
  it('classifies values', () => {
    expect(parseValueAsWritten('5.8')).toMatchObject({ kind: 'number', value: 5.8 });
    expect(parseValueAsWritten('<0.5')).toMatchObject({ kind: 'bounded', comparator: '<' });
    expect(parseValueAsWritten('≥ 40')).toMatchObject({ kind: 'bounded', comparator: '>=', value: 40 });
    expect(parseValueAsWritten('5.8-6.1').kind).toBe('ambiguous');
    expect(parseValueAsWritten('approx 6').kind).toBe('ambiguous');
    expect(parseValueAsWritten('1,200').kind).toBe('ambiguous');
    expect(parseValueAsWritten('Positive').kind).toBe('text');
    expect(parseValueAsWritten('').kind).toBe('text');
  });
  it('parses reference ranges and refuses multi-band text', () => {
    expect(parseReferenceRange('4.0 - 5.6 %')).toEqual({ low: 4, high: 5.6 });
    expect(parseReferenceRange('70 to 100 mg/dL')).toEqual({ low: 70, high: 100 });
    expect(parseReferenceRange('<200')).toEqual({ low: null, high: 200 });
    expect(parseReferenceRange('≥ 40 mg/dL')).toEqual({ low: 40, high: null });
    expect(parseReferenceRange('Desirable <200 / Borderline 200-239')).toBeNull();
    expect(parseReferenceRange('10 - 5')).toBeNull();
  });
  it('rounds', () => expect(roundTo(1.005, 2)).toBe(1.01));
});

describe('normalization', () => {
  it('finds analytes by exact alias only', () => {
    expect(findAnalyte('HbA1c')?.key).toBe('hba1c');
    expect(findAnalyte('  Glycated   Hemoglobin ')?.key).toBe('hba1c');
    expect(findAnalyte('Fasting Blood Sugar')?.key).toBe('glucose_fasting');
    expect(findAnalyte('Glucose')).toBeNull(); // ambiguous: fasting? random?
    expect(findAnalyte('HbA1c-ish')).toBeNull();
  });
  it('identity conversion keeps the number', () => {
    const n = normalizeObservation('LDL Cholesterol', 120, 'mg/dL');
    expect(n).toMatchObject({ status: 'normalized', valueNormalized: 120, unitNormalized: 'mg/dL' });
  });
  it('applies published factors with a rule id', () => {
    const g = normalizeObservation('Fasting glucose', 5.5, 'mmol/L');
    expect(g).toMatchObject({ status: 'normalized', valueNormalized: 99.1, rule: 'glucose_mmol_l_to_mg_dl_v1' });
    const h = normalizeObservation('HbA1c', 42, 'mmol/mol');
    expect(h).toMatchObject({ status: 'normalized', unitNormalized: '%', rule: 'hba1c_mmol_mol_to_percent_v1' });
    if (h.status === 'normalized') expect(h.valueNormalized).toBeCloseTo(5.99, 2);
  });
  it('refuses ambiguous conversions', () => {
    expect(normalizeObservation('HbA1c', 5.8, null).status).toBe('missing_unit');
    expect(normalizeObservation('HbA1c', 5.8, 'furlongs').status).toBe('unknown_unit');
    expect(normalizeObservation('HbA1c', 5.8, 'mg/dL').status).toBe('unit_unexpected');
    expect(normalizeObservation('Mystery', 5.8, '%').status).toBe('unknown_analyte');
  });
  it('folds unit spellings', () => {
    expect(unitKey('µmol/L')).toBe('umol/l');
    expect(unitKey('gm/dl')).toBe('g/dl');
    expect(unitKey('parsecs')).toBeNull();
  });
});

describe('assertions (a mention is not a diagnosis)', () => {
  it('rejects family history', () => {
    expect(assessCondition('diagnosed', 'Family history of diabetes')).toEqual({ ok: false, reason: 'not_patient_condition' });
    expect(assessCondition('reported', 'Mother has hypertension')).toMatchObject({ ok: false });
  });
  it('rejects negation', () => {
    expect(assessCondition('reported', 'No history of asthma')).toMatchObject({ ok: false });
    expect(assessCondition('reported', 'Denies chest pain')).toMatchObject({ ok: false });
  });
  it('caps hypothetical conditions at mentioned', () => {
    expect(assessCondition('diagnosed', 'Suspected hypothyroidism')).toMatchObject({ ok: true, assertion: 'mentioned' });
  });
  it('allows diagnosed only with a diagnosis cue', () => {
    expect(assessCondition('diagnosed', 'Diagnosis: Type 2 diabetes mellitus')).toMatchObject({ ok: true, assertion: 'diagnosed' });
    expect(assessCondition('diagnosed', 'Type 2 diabetes mellitus')).toMatchObject({ ok: true, assertion: 'mentioned' });
    expect(assessCondition('diagnosed', 'History of hypertension')).toMatchObject({ ok: true, assertion: 'reported' });
    expect(assessCondition(null, 'Diagnosis: Anaemia')).toMatchObject({ ok: true, assertion: 'mentioned' });
  });
  it('allergies: NKDA is not an allergy', () => {
    expect(assessAllergy('reported', 'NKDA', 'NKDA')).toEqual({ ok: false, reason: 'not_an_allergy' });
    expect(assessAllergy('reported', 'No known allergies', 'allergies')).toMatchObject({ ok: false });
    expect(assessAllergy('reported', 'Allergic to penicillin (rash)', 'penicillin')).toMatchObject({ ok: true, assertion: 'reported' });
    expect(assessAllergy('reported', 'Father allergic to penicillin', 'penicillin')).toMatchObject({ ok: false });
  });
  it('spots immunisations', () => {
    expect(looksLikeImmunization('Hepatitis B vaccine dose 2')).toBe(true);
    expect(looksLikeImmunization('Appendectomy')).toBe(false);
  });
});

describe('evidence', () => {
  const pages = indexPages([
    { pageNumber: 1, text: 'HbA1c   5.8 %   4.0 - 5.6\nLDL Cholesterol 120 mg/dL' },
    { pageNumber: 2, text: 'Patient: Test Person' },
  ]);
  it('accepts a quote on its page (whitespace-insensitive)', () => {
    expect(checkQuote(pages, 1, 'HbA1c 5.8 % 4.0 - 5.6')).toMatchObject({ ok: true });
  });
  it('rejects missing page, wrong page, invented, too short, too long', () => {
    expect(checkQuote(pages, 9, 'HbA1c 5.8 %')).toEqual({ ok: false, reason: 'page_missing' });
    expect(checkQuote(pages, 2, 'HbA1c 5.8 %')).toEqual({ ok: false, reason: 'quote_not_on_page' });
    expect(checkQuote(pages, 1, 'HbA1c 5.9 %')).toEqual({ ok: false, reason: 'quote_not_on_page' });
    expect(checkQuote(pages, 1, 'Hb')).toEqual({ ok: false, reason: 'quote_too_short' });
    expect(checkQuote(pages, 1, 'x'.repeat(501))).toEqual({ ok: false, reason: 'quote_too_long' });
  });
  it('value must be in the quote', () => {
    expect(valueInQuote('HbA1c 5.8 %', '5.8')).toBe(true);
    expect(valueInQuote('HbA1c 5.8 %', '5.9')).toBe(false);
    expect(optionalInQuote('LDL 120 mg/dL', 'mg/dL')).toBe('mg/dL');
    expect(optionalInQuote('LDL 120 mg/dL', 'mmol/L')).toBeNull();
    expect(textOnAnyPage(pages, 'test person')).toBe(true);
    expect(textOnAnyPage(pages, 'other')).toBe(false);
  });
});

describe('report-person check', () => {
  const profile = { fullName: 'Asha Rao', dateOfBirth: '1985-04-12' };
  it('matches', () => {
    expect(checkReportPerson({ name: 'Mrs. Asha Rao', dateOfBirth: '12/04/1985' }, profile)).toBe('match');
    expect(checkReportPerson({ name: 'Asha K Rao', dateOfBirth: null }, profile)).toBe('match');
    expect(checkReportPerson({ name: 'A Rao', dateOfBirth: null }, profile)).toBe('match');
  });
  it('flags a different person', () => {
    expect(checkReportPerson({ name: 'Ravi Kumar', dateOfBirth: null }, profile)).toBe('mismatch');
    expect(checkReportPerson({ name: null, dateOfBirth: '01/01/1970' }, profile)).toBe('mismatch');
    expect(checkReportPerson({ name: 'Asha Rao', dateOfBirth: '1990-01-01' }, profile)).toBe('mismatch');
  });
  it('unverifiable when nothing to compare; no fuzzy matching', () => {
    expect(checkReportPerson({ name: null, dateOfBirth: null }, profile)).toBe('unverifiable');
    expect(checkReportPerson({ name: 'Asha Rao', dateOfBirth: null }, { fullName: null, dateOfBirth: null })).toBe('unverifiable');
    expect(checkReportPerson({ name: 'Ashaa Rao', dateOfBirth: null }, profile)).toBe('mismatch');
  });
});

describe('confidence gate', () => {
  it('bands', () => {
    expect(confidenceBand(0.95, 0.75)).toBe('high');
    expect(confidenceBand(0.8, 0.75)).toBe('medium');
    expect(confidenceBand(0.74, 0.75)).toBe('low');
  });
  it('low confidence → needs_review', () => {
    expect(decideGate(0.6, 0.75, [])).toEqual({ gate: 'needs_review', reason: 'low_confidence' });
    expect(decideGate(0.75, 0.75, [])).toEqual({ gate: 'unreviewed', reason: null });
  });
  it('a forced reason wins even at high confidence', () => {
    expect(decideGate(0.99, 0.75, ['ambiguous_value'])).toEqual({ gate: 'needs_review', reason: 'ambiguous_value' });
  });
});

describe('chunking', () => {
  const page = (n: number, len: number) => ({ pageNumber: n, text: `p${n} ` + 'x'.repeat(len) });
  it('is deterministic and keeps whole pages together', () => {
    const pages = [page(1, 100), page(2, 100), page(3, 100)];
    const a = chunkPages(pages, 250);
    const b = chunkPages([...pages].reverse(), 250);
    expect(a).toEqual(b);
    expect(a.map((c) => c.segments.map((s) => s.pageNumber))).toEqual([[1, 2], [3]]);
  });
  it('skips pages without text and splits an over-long page', () => {
    expect(chunkPages([page(1, 100), { pageNumber: 2, text: '   ' }], 1000, 20)).toHaveLength(1);
    const parts = splitLongText(('line\n').repeat(100), 120);
    expect(parts.every((p) => p.length <= 120)).toBe(true);
    expect(parts.join('\n').replace(/\n+/g, '\n')).toContain('line');
    const chunks = chunkPages([page(1, 500)], 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(formatChunkForPrompt(chunks[0])).toContain('=== PAGE 1 (part 1 of');
  });
});

describe('fingerprints and hashing', () => {
  it('are stable and sensitive', async () => {
    const a = await factFingerprint(['observation', 1, 'hba1c', '5.8', '%', '2026-01-01']);
    expect(a).toBe(await factFingerprint(['observation', 1, 'hba1c', '5.8', '%', '2026-01-01']));
    expect(a).not.toBe(await factFingerprint(['observation', 1, 'hba1c', '5.9', '%', '2026-01-01']));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('sha256 known vector', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('text helpers', () => {
  it('normalises', () => {
    expect(normalizeText('  “Hi”  there\u0000 ')).toBe('"Hi" there');
    expect(visibleCharCount(' a b \n c ')).toBe(3);
  });
});

describe('runtime config', () => {
  const base: Record<string, string> = {
    SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', ANTHROPIC_API_KEY: 'k',
  };
  it('reports missing secret NAMES only', () => {
    const r = loadRuntimeConfig((n) => (n === 'SUPABASE_URL' ? 'u' : undefined));
    expect(r).toEqual({ ok: false, missing: ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY'] });
  });
  it('provider is not approved unless the exact version is set', () => {
    const off = loadRuntimeConfig((n) => base[n]);
    expect(off.ok && off.config.dataFlowApproved).toBe(false);
    const wrong = loadRuntimeConfig((n) => ({ ...base, AI_DATA_FLOW_APPROVED: 'yes' })[n]);
    expect(wrong.ok && wrong.config.dataFlowApproved).toBe(false);
    const on = loadRuntimeConfig((n) => ({ ...base, AI_DATA_FLOW_APPROVED: DATA_FLOW_VERSION })[n]);
    expect(on.ok && on.config.dataFlowApproved).toBe(true);
    expect(on.ok && on.config.inferenceGeo).toBe('us');
  });
});

describe('schema validators', () => {
  const base = { page_number: 1, source_text: 'HbA1c 5.8 %', confidence: 0.9 };
  it('accepts a valid observation and rejects bad ones individually', () => {
    expect(parseObservation({ ...base, name_as_written: 'HbA1c', value_as_written: '5.8', unit_as_written: '%' })).toMatchObject({ ok: true });
    expect(parseObservation({ ...base, name_as_written: 'HbA1c' })).toMatchObject({ ok: false, reason: 'schema_invalid' });
    expect(parseObservation({ ...base, confidence: 1.4, name_as_written: 'a', value_as_written: '1' })).toMatchObject({ ok: false, reason: 'confidence_invalid' });
    expect(parseObservation({ ...base, page_number: 0, name_as_written: 'a', value_as_written: '1' })).toMatchObject({ ok: false });
    expect(parseObservation({ ...base, name_as_written: 'x'.repeat(301), value_as_written: '1' })).toMatchObject({ ok: false, reason: 'field_too_long' });
    expect(parseObservation('nope')).toMatchObject({ ok: false });
    expect(parseObservation({ ...base, confidence: '0.9', name_as_written: 'a', value_as_written: '1' })).toMatchObject({ ok: false });
  });
  it('drops over-long optional fields instead of failing', () => {
    const r = parseObservation({ ...base, name_as_written: 'HbA1c', value_as_written: '5.8', specimen: 'x'.repeat(500) });
    expect(r).toMatchObject({ ok: true, dropped: 1 });
  });
  it('null for missing values is accepted', () => {
    const r = parseObservation({ ...base, name_as_written: 'HbA1c', value_as_written: '5.8', unit_as_written: null, specimen: null });
    expect(r).toMatchObject({ ok: true });
  });
  it('other entity types', () => {
    expect(parseCondition({ ...base, name_as_written: 'T2DM', assertion: 'diagnosed' })).toMatchObject({ ok: true });
    expect(parseMedication({ ...base, name_as_written: 'Metformin' })).toMatchObject({ ok: true });
    expect(parseAllergy({ ...base, substance_as_written: 'Penicillin' })).toMatchObject({ ok: true });
    expect(parseProcedure({ ...base, name_as_written: 'Appendectomy' })).toMatchObject({ ok: true });
    expect(parseEncounter({ ...base, key: 'e1' })).toMatchObject({ ok: true });
    expect(parseEncounter({ ...base })).toMatchObject({ ok: false });
  });
  it('whole-document shape', () => {
    expect(parseExtraction(null)).toEqual({ ok: false });
    expect(parseExtraction({ observations: 'x' })).toEqual({ ok: false });
    const r = parseExtraction({ document: { document_type: 'blood_test', title: 'Lab' }, observations: [{}] });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) { expect(r.value.document.document_type).toBe('blood_test'); expect(r.value.encounters).toEqual([]); }
    const bad = parseExtraction({ document: { document_type: 'made_up' } });
    expect(bad.ok && bad.value.document.document_type).toBeNull();
  });
});
