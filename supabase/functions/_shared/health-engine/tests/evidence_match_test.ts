/**
 * Evidence matching against REAL-WORLD PDF text (synthetic content only).
 *
 * Text pulled from real report PDFs carries layout artifacts — line wraps,
 * table-column gaps, spaces inside words, spaces around "/" or "%". A fact
 * whose quote really is on the page must not be rejected because of them;
 * a fact whose value is NOT on the page (or not in its quote) must still be
 * rejected. These tests pin both sides of that line.
 */
import { assertEquals } from '@std/assert';

import type { ExtractedObservation, StructuredExtraction } from '../extraction-schema.ts';
import { evidenceKey } from '../normalize.ts';
import { rejectionCounts } from '../pipeline.ts';
import { validateExtraction, type Page } from '../validate.ts';

const TODAY = new Date('2026-10-06T12:00:00Z');

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

const obs = (over: Partial<ExtractedObservation> & Record<string, unknown>): ExtractedObservation =>
  ({
    test_name: 'Haemoglobin',
    raw_value: '13.5',
    raw_unit: 'g/dL',
    reference_range: '',
    observation_date: null,
    category: 'laboratory',
    page: 1,
    source_text: 'Haemoglobin 13.5 g/dL',
    confidence: 0.95,
    ...over,
  }) as ExtractedObservation;

function run(pageText: string, o: ExtractedObservation) {
  const pages: Page[] = [{ page_number: 1, text: pageText }];
  return validateExtraction({ ...empty(), observations: [o] }, pages, { today: TODAY });
}

const accepted = (r: ReturnType<typeof run>) => r.facts.length === 1 && r.rejected.length === 0;
const rejectedFor = (r: ReturnType<typeof run>) => r.rejected.map((x) => x.reason);

// ------------------------------------------------------------- accepted --

Deno.test('normal single-line evidence is accepted', () => {
  assertEquals(accepted(run('Haemoglobin 13.5 g/dL 13.0 - 17.0', obs({}))), true);
});

Deno.test('line-wrapped evidence (quote spans a line break) is accepted', () => {
  assertEquals(accepted(run('Haemoglobin\n13.5 g/dL\n13.0 - 17.0', obs({ source_text: 'Haemoglobin 13.5 g/dL' }))), true);
});

Deno.test('table-column whitespace and multiple spaces are accepted', () => {
  const page = 'Test            Result      Unit\nHaemoglobin     13.5        g/dL     13.0 - 17.0';
  assertEquals(accepted(run(page, obs({ source_text: 'Haemoglobin 13.5 g/dL' }))), true);
  assertEquals(accepted(run(page, obs({ source_text: 'Haemoglobin     13.5        g/dL' }))), true);
});

Deno.test('value and unit separated by whitespace, and spaced unit symbols, are accepted', () => {
  assertEquals(accepted(run('Haemoglobin 13.5   g / dL', obs({ source_text: 'Haemoglobin 13.5 g/dL' }))), true);
  assertEquals(accepted(run('HbA1c 5.9 %', obs({ test_name: 'HbA1c', raw_value: '5.9', raw_unit: '%', source_text: 'HbA1c 5.9%' }))), true);
});

Deno.test('a PDF word-spacing artifact inside a name is accepted', () => {
  assertEquals(accepted(run('Haemo globin 13.5 g/dL', obs({ source_text: 'Haemoglobin 13.5 g/dL' }))), true);
});

Deno.test('invisible characters (soft hyphen, zero-width space) are ignored', () => {
  assertEquals(accepted(run('Haemo­globin​ 13.5 g/dL', obs({}))), true);
});

Deno.test('a reference range on another line is accepted (checked against the page)', () => {
  const page = 'Haemoglobin 13.5 g/dL\nRef. interval:\n13.0 - 17.0';
  assertEquals(accepted(run(page, obs({ reference_range: '13.0 - 17.0' }))), true);
});

Deno.test('decimal values keep their decimal point', () => {
  const r = run('Creatinine 0.84 mg/dL', obs({ test_name: 'Creatinine', raw_value: '0.84', raw_unit: 'mg/dL', source_text: 'Creatinine 0.84 mg/dL' }));
  assertEquals(accepted(r), true);
  assertEquals(r.facts[0].row.value_as_written, '0.84');
});

Deno.test('negative values are accepted when written', () => {
  const r = run('Base excess -2.1 mmol/L', obs({ test_name: 'Base excess', raw_value: '-2.1', raw_unit: 'mmol/L', source_text: 'Base excess -2.1 mmol/L' }));
  assertEquals(accepted(r), true);
});

Deno.test('dates written on the page are accepted', () => {
  const page = 'Collected: 12 Mar 2026\nHaemoglobin 13.5 g/dL';
  const r = run(page, obs({ observation_date: '12 Mar 2026' }));
  assertEquals(accepted(r), true);
  assertEquals(r.facts[0].row.effective_date, '2026-03-12');
});

// ------------------------------------------------------------- rejected --

Deno.test('a value genuinely absent from the page is rejected', () => {
  const r = run('Haemoglobin 13.5 g/dL', obs({ raw_value: '15.2', source_text: 'Haemoglobin 15.2 g/dL' }));
  assertEquals(r.facts.length, 0);
  assertEquals(rejectedFor(r), ['quote_not_on_page']);
});

Deno.test('a quote that is on the page but does not contain the value is rejected', () => {
  const r = run('Haemoglobin 13.5 g/dL\nPlatelets 250', obs({ raw_value: '250', source_text: 'Haemoglobin 13.5 g/dL' }));
  assertEquals(rejectedFor(r), ['value_not_in_quote']);
});

Deno.test('spacing never creates a negative value: "4 - 5" does not support "-5"', () => {
  const r = run('Potassium 4 - 5', obs({ test_name: 'Potassium', raw_value: '-5', raw_unit: '', source_text: 'Potassium 4 - 5' }));
  assertEquals(rejectedFor(r), ['value_not_in_quote']);
});

Deno.test('spacing never joins separate numbers: "1 3.5" does not support "13.5"', () => {
  const r = run('Haemoglobin 1 3.5 g/dL', obs({ source_text: 'Haemoglobin 1 3.5 g/dL' }));
  assertEquals(rejectedFor(r), ['value_not_in_quote']);
});

Deno.test('a different decimal is not accepted: "13.5" does not support "135"', () => {
  const r = run('Haemoglobin 13.5 g/dL', obs({ raw_value: '135', source_text: 'Haemoglobin 13.5 g/dL' }));
  assertEquals(rejectedFor(r), ['value_not_in_quote']);
});

Deno.test('a unit not in the quote is rejected', () => {
  const r = run('Haemoglobin 13.5 g/dL', obs({ raw_unit: 'mmol/L' }));
  assertEquals(rejectedFor(r), ['value_not_in_quote']);
});

// ----------------------------------------------------------- the key itself --

Deno.test('evidenceKey: only layout is absorbed; digits, signs and decimals are untouched', () => {
  assertEquals(evidenceKey('Haemo  globin\n 13.5   g / dL'), 'Haemoglobin 13.5 g/dL');
  assertEquals(evidenceKey('4 - 5'), '4 - 5');
  assertEquals(evidenceKey('1 3.5'), '1 3.5');
  assertEquals(evidenceKey('1, 200'), '1, 200');
  assertEquals(evidenceKey('−2.1'), '-2.1');
});

Deno.test('rejections are counted by reason for the log (counts only)', () => {
  assertEquals(rejectionCounts([{ reason: 'quote_not_on_page' }, { reason: 'quote_not_on_page' }, { reason: 'empty' }]), {
    rejected_quote_not_on_page: 2,
    rejected_empty: 1,
  });
});

Deno.test('the log keeps per-reason counts but drops any text under that name', async () => {
  const { redact } = await import('../log.ts');
  assertEquals(redact({ event: 'document_completed', rejected_quote_not_on_page: 3, rejected_note: 'Haemoglobin 13.5', rejected_X: 1 }), {
    event: 'document_completed',
    rejected_quote_not_on_page: 3,
  });
});
