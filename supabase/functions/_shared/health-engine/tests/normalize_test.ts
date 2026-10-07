import { assertEquals } from '@std/assert';

import { canonicalUnit, detectDateOrder, normalizeText, parseDateAsWritten, parseNumericValue, parseReferenceRange } from '../normalize.ts';

const TODAY = new Date('2026-10-06T12:00:00Z');

Deno.test('numbers: plain, separators, comparators, text and ambiguity', () => {
  assertEquals(parseNumericValue('5.8'), { kind: 'number', value: 5.8 });
  assertEquals(parseNumericValue(' 120 '), { kind: 'number', value: 120 });
  assertEquals(parseNumericValue('1,250,000'), { kind: 'number', value: 1250000 });
  assertEquals(parseNumericValue('1,50,000'), { kind: 'number', value: 150000 }); // Indian grouping
  assertEquals(parseNumericValue('<0.5'), { kind: 'comparator', text: '<0.5' });
  assertEquals(parseNumericValue('> 90'), { kind: 'comparator', text: '> 90' });
  assertEquals(parseNumericValue('Negative'), { kind: 'text', text: 'Negative' });
  assertEquals(parseNumericValue('1,20'), { kind: 'ambiguous', text: '1,20' }); // decimal comma or separator?
  assertEquals(parseNumericValue('5.8 approx'), { kind: 'ambiguous', text: '5.8 approx' });
});

Deno.test('units: canonical spelling only — never a conversion', () => {
  assertEquals(canonicalUnit('mg/dl'), 'mg/dL');
  assertEquals(canonicalUnit('MG/DL'), 'mg/dL');
  assertEquals(canonicalUnit('%'), '%');
  assertEquals(canonicalUnit('mmol/L'), 'mmol/L');
  assertEquals(canonicalUnit('uIU/ml'), 'µIU/mL');
  assertEquals(canonicalUnit('furlongs'), null); // unknown: kept raw only
  assertEquals(canonicalUnit(null), null);
});

Deno.test('reference ranges', () => {
  assertEquals(parseReferenceRange('4.0 - 5.6'), { low: 4, high: 5.6 });
  assertEquals(parseReferenceRange('70–100 mg/dL'), { low: 70, high: 100 });
  assertEquals(parseReferenceRange('< 100'), { low: null, high: 100 });
  assertEquals(parseReferenceRange('>40'), { low: 40, high: null });
  assertEquals(parseReferenceRange('10 - 5'), null); // inverted
  assertEquals(parseReferenceRange('see note'), null);
});

Deno.test('dates: unambiguous forms parse; ambiguous day/month is not guessed', () => {
  assertEquals(parseDateAsWritten('2026-03-12', TODAY), { kind: 'date', iso: '2026-03-12' });
  assertEquals(parseDateAsWritten('15/09/2026', TODAY), { kind: 'date', iso: '2026-09-15' }); // DD/MM
  assertEquals(parseDateAsWritten('09/15/2026', TODAY), { kind: 'date', iso: '2026-09-15' }); // MM/DD
  assertEquals(parseDateAsWritten('12/03/2026', TODAY), { kind: 'ambiguous' }); // 12 Mar or 3 Dec?
  assertEquals(parseDateAsWritten('03/03/2026', TODAY), { kind: 'date', iso: '2026-03-03' });
  assertEquals(parseDateAsWritten('12 Mar 2026', TODAY), { kind: 'date', iso: '2026-03-12' });
  assertEquals(parseDateAsWritten('12-Mar-2026', TODAY), { kind: 'date', iso: '2026-03-12' });
  assertEquals(parseDateAsWritten('March 12, 2026', TODAY), { kind: 'date', iso: '2026-03-12' });
  assertEquals(parseDateAsWritten('31/02/2026', TODAY), { kind: 'invalid' });
  assertEquals(parseDateAsWritten('01/01/2099', TODAY), { kind: 'invalid' }); // future
  assertEquals(parseDateAsWritten('01/01/1800', TODAY), { kind: 'invalid' });
  // A word is not a wrong date — it is just not one we can read (kept undated, held for review).
  assertEquals(parseDateAsWritten('yesterday', TODAY), { kind: 'unrecognized' });
  assertEquals(parseDateAsWritten(null, TODAY), null);
});

Deno.test('text normalization for quote matching', () => {
  assertEquals(normalizeText('  HbA1c\n 5.8   %  4.0 – 5.6 '), 'HbA1c 5.8 % 4.0 - 5.6');
});

Deno.test('dates: day/month order is resolved only when the document proves it', () => {
  assertEquals(detectDateOrder(['DOB: 14/08/1985', 'Report Date: 12/03/2026']), 'DMY');
  assertEquals(detectDateOrder(['DOB: 08/14/1985']), 'MDY');
  assertEquals(detectDateOrder(['Report Date: 12/03/2026']), null); // no proof
  assertEquals(detectDateOrder(['14/08/1985', '08/14/1985']), null); // contradictory
  assertEquals(parseDateAsWritten('12/03/2026', TODAY, 'DMY'), { kind: 'date', iso: '2026-03-12' });
  assertEquals(parseDateAsWritten('05/03/2026', TODAY, 'MDY'), { kind: 'date', iso: '2026-05-03' });
  assertEquals(parseDateAsWritten('09/15/2026', TODAY, 'DMY'), { kind: 'date', iso: '2026-09-15' }); // unambiguous wins
});

Deno.test('dates as real reports print them: times, 2-digit years, ordinals, month names', () => {
  // TODAY is 2026-10-06; day/month order proven DMY by the document.
  const dmy = 'DMY' as const;
  assertEquals(parseDateAsWritten('07/09/2026 10:45 AM', TODAY, dmy), { kind: 'date', iso: '2026-09-07' });
  assertEquals(parseDateAsWritten('07/09/2026 10:45:12', TODAY, dmy), { kind: 'date', iso: '2026-09-07' });
  assertEquals(parseDateAsWritten('15/09/2026 09:30 hrs', TODAY), { kind: 'date', iso: '2026-09-15' });
  assertEquals(parseDateAsWritten('15-09-2026 at 9:30 pm IST', TODAY), { kind: 'date', iso: '2026-09-15' });
  assertEquals(parseDateAsWritten('15/09/26', TODAY), { kind: 'date', iso: '2026-09-15' });
  assertEquals(parseDateAsWritten('14/08/85', TODAY), { kind: 'date', iso: '1985-08-14' });
  assertEquals(parseDateAsWritten('15-Sep-26', TODAY), { kind: 'date', iso: '2026-09-15' });
  assertEquals(parseDateAsWritten('15 Sept. 2026', TODAY), { kind: 'date', iso: '2026-09-15' });
  assertEquals(parseDateAsWritten('15th September, 2026', TODAY), { kind: 'date', iso: '2026-09-15' });
  assertEquals(parseDateAsWritten('Sep 15th, 2026 11:02 AM', TODAY), { kind: 'date', iso: '2026-09-15' });
  assertEquals(parseDateAsWritten('2026-09-15 10:45', TODAY), { kind: 'date', iso: '2026-09-15' });
  // Still strict: impossible, future and still-ambiguous dates are not accepted as dates.
  assertEquals(parseDateAsWritten('31/02/26', TODAY), { kind: 'invalid' });
  assertEquals(parseDateAsWritten('15/09/2027 10:45', TODAY), { kind: 'invalid' });
  assertEquals(parseDateAsWritten('07/09/2026 10:45 AM', TODAY), { kind: 'ambiguous' });
  // A time alone, or text around a date, is not silently trimmed into one.
  assertEquals(parseDateAsWritten('10:45 AM', TODAY), { kind: 'unrecognized' });
  assertEquals(parseDateAsWritten('Collected on 15/09/2026', TODAY), { kind: 'unrecognized' });
});
