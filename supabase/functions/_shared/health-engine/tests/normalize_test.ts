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
  assertEquals(parseDateAsWritten('yesterday', TODAY), { kind: 'invalid' });
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
