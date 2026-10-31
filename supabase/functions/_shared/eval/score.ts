/**
 * Scores an extraction against a corpus answer key.
 *
 * Matching and comparison reuse the pipeline's own deterministic parsers
 * (normalize.ts), so the score reflects what the app would actually store.
 *
 * Definitions, per case and in total:
 *  - recall    = key observations correctly found (name matched) / key observations
 *  - precision = extracted observations that match a key observation / extracted observations
 *  - field accuracy (value, unit, range, date) = correct fields / matched observations
 *  - wrongValue = matched observations whose value is wrong. This is the dangerous
 *    error (a plausible but wrong number) and is reported on its own.
 */
import { canonicalUnit, parseDateAsWritten, parseNumericValue, parseReferenceRange } from '../health-engine/normalize.ts';
import { ANALYTES, type EvalCase, type KeyObservation } from './corpus.ts';

export type Extracted = {
  test_name: string;
  raw_value: string;
  raw_unit?: string | null;
  reference_range?: string | null;
  observation_date?: string | null;
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

const NAME_TO_CANONICAL = new Map<string, string>();
for (const a of ANALYTES) {
  NAME_TO_CANONICAL.set(squash(a.name), a.name);
  for (const alias of a.aliases) NAME_TO_CANONICAL.set(squash(alias), a.name);
}

/** Canonical analyte name for a printed or extracted name, or null if unknown. */
export function canonicalName(printed: string): string | null {
  return NAME_TO_CANONICAL.get(squash(printed)) ?? null;
}

export type FieldChecks = { value: boolean; unit: boolean; range: boolean; date: boolean };

export function compareFields(key: KeyObservation, got: Extracted): FieldChecks {
  const kv = parseNumericValue(key.value);
  const gv = parseNumericValue(got.raw_value ?? '');
  const value = kv.kind === 'number' && gv.kind === 'number' && kv.value === gv.value;

  const ku = canonicalUnit(key.unit) ?? key.unit.toLowerCase();
  const gu = canonicalUnit(got.raw_unit) ?? (got.raw_unit ?? '').toLowerCase();
  const unit = ku === gu;

  const kr = parseReferenceRange(key.range);
  const gr = parseReferenceRange(got.reference_range);
  const range = !!kr && !!gr && kr.low === gr.low && kr.high === gr.high;

  const gd = parseDateAsWritten(got.observation_date, new Date('2026-12-31T00:00:00Z'), 'DMY');
  const date = gd?.kind === 'date' && gd.iso === key.date;

  return { value, unit, range, date };
}

export type CaseScore = {
  id: string;
  keyCount: number;
  extractedCount: number;
  found: number;
  matchedExtracted: number;
  value: number;
  unit: number;
  range: number;
  date: number;
  wrongValue: number;
};

export function scoreCase(c: EvalCase, extracted: Extracted[]): CaseScore {
  const used = new Set<number>();
  let found = 0;
  const s = { value: 0, unit: 0, range: 0, date: 0, wrongValue: 0 };
  for (const k of c.key) {
    const idx = extracted.findIndex((e, i) => !used.has(i) && canonicalName(e.test_name) === k.name);
    if (idx < 0) continue;
    used.add(idx);
    found++;
    const f = compareFields(k, extracted[idx]);
    if (f.value) s.value++;
    else s.wrongValue++;
    if (f.unit) s.unit++;
    if (f.range) s.range++;
    if (f.date) s.date++;
  }
  return { id: c.id, keyCount: c.key.length, extractedCount: extracted.length, found, matchedExtracted: used.size, ...s };
}

export type CorpusScore = {
  cases: number;
  keyCount: number;
  extractedCount: number;
  recall: number;
  precision: number;
  valueAccuracy: number;
  unitAccuracy: number;
  rangeAccuracy: number;
  dateAccuracy: number;
  wrongValueRate: number;
};

const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b);

export function scoreCorpus(scores: CaseScore[]): CorpusScore {
  const sum = (f: (s: CaseScore) => number) => scores.reduce((t, s) => t + f(s), 0);
  const found = sum((s) => s.found);
  return {
    cases: scores.length,
    keyCount: sum((s) => s.keyCount),
    extractedCount: sum((s) => s.extractedCount),
    recall: ratio(found, sum((s) => s.keyCount)),
    precision: ratio(sum((s) => s.matchedExtracted), sum((s) => s.extractedCount)),
    valueAccuracy: ratio(sum((s) => s.value), found),
    unitAccuracy: ratio(sum((s) => s.unit), found),
    rangeAccuracy: ratio(sum((s) => s.range), found),
    dateAccuracy: ratio(sum((s) => s.date), found),
    wrongValueRate: ratio(sum((s) => s.wrongValue), found),
  };
}

export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function formatReport(c: CorpusScore): string {
  return [
    `Cases: ${c.cases}   Key observations: ${c.keyCount}   Extracted: ${c.extractedCount}`,
    `Recall (found):        ${pct(c.recall)}`,
    `Precision:             ${pct(c.precision)}`,
    `Value accuracy:        ${pct(c.valueAccuracy)}   (wrong-value rate ${pct(c.wrongValueRate)})`,
    `Unit accuracy:         ${pct(c.unitAccuracy)}`,
    `Range accuracy:        ${pct(c.rangeAccuracy)}`,
    `Date accuracy:         ${pct(c.dateAccuracy)}`,
  ].join('\n');
}
