import { assert, assertEquals, assertNotEquals } from '@std/assert';

import { buildTextPdf } from '../health-engine/tests/fixtures.ts';
import { ANALYTES, generateCorpus, LAYOUTS } from './corpus.ts';
import { canonicalName, compareFields, scoreCase, scoreCorpus, type Extracted } from './score.ts';

Deno.test('corpus is deterministic and covers every layout and date style', () => {
  const a = generateCorpus({ count: 30, seed: 1 });
  const b = generateCorpus({ count: 30, seed: 1 });
  assertEquals(a, b);
  assertNotEquals(a, generateCorpus({ count: 30, seed: 2 }));
  assertEquals(new Set(a.map((c) => c.layout)).size, LAYOUTS.length);
  assertEquals(new Set(a.map((c) => c.dateStyle)).size, 3);
});

Deno.test('every case has an answer key printed on its own pages', () => {
  for (const c of generateCorpus({ count: 50, seed: 3 })) {
    assert(c.key.length >= 6);
    const text = c.pages.flat().join('\n');
    for (const k of c.key) {
      assert(text.includes(k.value), `${c.id}: value ${k.value} not printed`);
      assert(text.includes(k.range), `${c.id}: range ${k.range} not printed`);
    }
  }
});

Deno.test('corpus pages build into real PDFs and contain no real-looking identifiers', () => {
  const [c] = generateCorpus({ count: 1, seed: 4 });
  const pdf = buildTextPdf(c.pages);
  assert(pdf.length > 200);
  assert(!/\b\d{10}\b/.test(c.pages.flat().join(' ')));
});

Deno.test('analyte table has unique names and aliases', () => {
  const seen = new Set<string>();
  for (const a of ANALYTES) for (const n of [a.name, ...a.aliases]) {
    const k = n.toLowerCase();
    assert(!seen.has(k), `duplicate ${n}`);
    seen.add(k);
  }
  assertEquals(canonicalName('Glycosylated Hemoglobin (HbA1c)'), 'HbA1c');
  assertEquals(canonicalName('not a test'), null);
});

/** A perfect reading, built from the key itself. */
function perfect(c: ReturnType<typeof generateCorpus>[number]): Extracted[] {
  return c.key.map((k) => ({ test_name: k.name, raw_value: k.value, raw_unit: k.unit, reference_range: k.range, observation_date: k.date }));
}

Deno.test('a perfect reading scores 100%', () => {
  const cases = generateCorpus({ count: 10, seed: 5 });
  const s = scoreCorpus(cases.map((c) => scoreCase(c, perfect(c))));
  assertEquals(s.recall, 1);
  assertEquals(s.precision, 1);
  assertEquals(s.valueAccuracy, 1);
  assertEquals(s.wrongValueRate, 0);
  assertEquals(s.dateAccuracy, 1);
});

Deno.test('a wrong value is counted as a wrong value, not as missing', () => {
  const [c] = generateCorpus({ count: 1, seed: 6 });
  const got = perfect(c);
  got[0] = { ...got[0], raw_value: '999' };
  const s = scoreCase(c, got);
  assertEquals(s.found, c.key.length);
  assertEquals(s.wrongValue, 1);
  assertEquals(s.value, c.key.length - 1);
});

Deno.test('missing and invented observations lower recall and precision', () => {
  const [c] = generateCorpus({ count: 1, seed: 7 });
  const got = perfect(c).slice(1);
  got.push({ test_name: 'Mystery Marker', raw_value: '1' });
  const s = scoreCorpus([scoreCase(c, got)]);
  assert(s.recall < 1);
  assert(s.precision < 1);
});

Deno.test('dates are compared by parsed calendar date, not text', () => {
  const k = { name: 'HbA1c', value: '5.8', unit: '%', range: '4.0 - 5.6', date: '2026-03-12' };
  const base = { test_name: 'HbA1c', raw_value: '5.80', raw_unit: '%', reference_range: '4.0-5.6' };
  assert(compareFields(k, { ...base, observation_date: '12/03/2026' }).date);
  assert(compareFields(k, { ...base, observation_date: '12-Mar-2026' }).date);
  assert(!compareFields(k, { ...base, observation_date: '13/03/2026' }).date);
  assert(compareFields(k, { ...base, observation_date: '12.03.2026' }).value);
});
