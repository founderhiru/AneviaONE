/**
 * Deterministic normalization — plain TypeScript, no AI.
 *
 * Raw values are never altered or discarded: callers store the as-written
 * text AND the normalized form. Anything ambiguous yields `null` (plus a
 * flag) rather than a guess, and no unit conversion between different units
 * is ever performed — the model is never asked to convert either.
 */

export const NORMALIZATION_VERSION = 'g1-norm-1';

/** Whitespace/dash/Unicode-normalized text used to compare quotes with page text. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[‐-―−]/g, '-') // hyphens, en/em dashes, minus sign
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Comparison key for EVIDENCE MATCHING ONLY (never stored, never shown).
 * Both the page text and the model's quote / value go through it, so a
 * match still means "this text is on the page, in this order". It only
 * absorbs layout artifacts that PDF text extraction introduces:
 *   - whitespace runs, line breaks and table-column gaps (via normalizeText);
 *   - invisible characters (soft hyphen, zero-width space/joiners, BOM);
 *   - spaces PDF word-spacing puts INSIDE a word ("Haemo globin") — only
 *     between two letters;
 *   - spaces around / ( ) : %  ("g / dL" ↔ "g/dL", "13.5 %" ↔ "13.5%").
 * It never touches spaces next to digits, decimal points, minus signs or
 * commas, so it cannot join separate numbers ("1 3.5" stays two numbers,
 * "4 - 5" never yields "-5", "1, 200" never becomes "1,200").
 */
export function evidenceKey(value: string): string {
  return normalizeText(value)
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/ ?([/():%]) ?/g, '$1')
    .replace(/(\p{L}) (?=\p{L})/gu, '$1');
}

// ---------------------------------------------------------------- numbers ---

export type ParsedNumber =
  | { kind: 'number'; value: number }
  /** "<0.5", ">90": a valid result, but not a plain number for trends. */
  | { kind: 'comparator'; text: string }
  /** "Positive", "Not detected", … */
  | { kind: 'text'; text: string }
  /** Could be read more than one way (e.g. "5,8"). */
  | { kind: 'ambiguous'; text: string };

export function parseNumericValue(raw: string): ParsedNumber {
  const text = normalizeText(raw);
  if (/^[<>≤≥]=?\s*-?\d/.test(text)) return { kind: 'comparator', text };
  if (/^-?\d+(\.\d+)?$/.test(text)) return { kind: 'number', value: Number(text) };
  // Thousands separators, Western (1,250,000) or Indian (1,50,000).
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text) || /^\d{1,2}(,\d{2})*,\d{3}(\.\d+)?$/.test(text)) {
    return { kind: 'number', value: Number(text.replace(/,/g, '')) };
  }
  // A lone comma between digits could be a decimal comma or a separator.
  if (/^-?\d+,\d+$/.test(text)) return { kind: 'ambiguous', text };
  if (/\d/.test(text)) return { kind: 'ambiguous', text };
  return { kind: 'text', text };
}

// ------------------------------------------------------------------ units ---

/** Canonical spellings only — the same unit written differently. Never a conversion. */
const UNIT_SPELLINGS: Record<string, string> = {
  '%': '%',
  'mg/dl': 'mg/dL',
  'g/dl': 'g/dL',
  'gm/dl': 'g/dL',
  'g/l': 'g/L',
  'mg/l': 'mg/L',
  'mmol/l': 'mmol/L',
  'µmol/l': 'µmol/L',
  'μmol/l': 'µmol/L',
  'umol/l': 'µmol/L',
  'meq/l': 'mEq/L',
  'ng/ml': 'ng/mL',
  'pg/ml': 'pg/mL',
  'µg/dl': 'µg/dL',
  'μg/dl': 'µg/dL',
  'ug/dl': 'µg/dL',
  'µiu/ml': 'µIU/mL',
  'μiu/ml': 'µIU/mL',
  'uiu/ml': 'µIU/mL',
  'miu/l': 'mIU/L',
  'iu/l': 'IU/L',
  'u/l': 'U/L',
  'mmhg': 'mmHg',
  'mm hg': 'mmHg',
  'bpm': 'bpm',
  'kg': 'kg',
  'cm': 'cm',
  'mm/hr': 'mm/hr',
  'mm/h': 'mm/hr',
  'fl': 'fL',
  'pg': 'pg',
  'ml/min/1.73m2': 'mL/min/1.73m²',
  'ml/min/1.73 m2': 'mL/min/1.73m²',
  'ml/min/1.73m²': 'mL/min/1.73m²',
};

/** Canonical unit spelling, or null when the unit is unknown (kept raw only). */
export function canonicalUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return UNIT_SPELLINGS[normalizeText(raw).toLowerCase()] ?? null;
}

// ------------------------------------------------------- reference ranges ---

export type ParsedRange = { low: number | null; high: number | null } | null;

/** "4.0-5.6", "70 – 100 mg/dL", "<5.7", "> 40". Null when unreadable or inverted. */
export function parseReferenceRange(raw: string | null | undefined): ParsedRange {
  if (!raw) return null;
  const text = normalizeText(raw).replace(/[a-zA-Zµμ%/²]+.*$/, '').trim();
  const between = /^(-?\d+(?:\.\d+)?)\s*(?:-|to)\s*(-?\d+(?:\.\d+)?)$/.exec(text);
  if (between) {
    const low = Number(between[1]);
    const high = Number(between[2]);
    return low <= high ? { low, high } : null;
  }
  const upper = /^(?:<|≤|<=|upto|up to)\s*(-?\d+(?:\.\d+)?)$/i.exec(text);
  if (upper) return { low: null, high: Number(upper[1]) };
  const lower = /^(?:>|≥|>=)\s*(-?\d+(?:\.\d+)?)$/.exec(text);
  if (lower) return { low: Number(lower[1]), high: null };
  return null;
}

// ------------------------------------------------------------------ dates ---

export type ParsedDate = { kind: 'date'; iso: string } | { kind: 'ambiguous' } | { kind: 'invalid' };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10,
  november: 11, december: 12,
};

function toIso(year: number, month: number, day: number, today: Date): ParsedDate {
  if (year < 1900 || month < 1 || month > 12 || day < 1) return { kind: 'invalid' };
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { kind: 'invalid' };
  }
  // A health record can't be dated in the future (one day of timezone slack).
  if (date.getTime() > today.getTime() + 86_400_000) return { kind: 'invalid' };
  return { kind: 'date', iso: date.toISOString().slice(0, 10) };
}

/**
 * Parses a date exactly as written in the report. Numeric day/month orders
 * are resolved only when unambiguous (one part > 12); "03/04/2026" is
 * reported as ambiguous rather than guessed.
 */
export type DateOrder = 'DMY' | 'MDY';

/**
 * The day/month order a document itself proves: some numeric date on its
 * pages can only be read one way (e.g. 14/08/1985 must be DD/MM) and no date
 * contradicts it. Returns null when the document gives no proof or mixes
 * both orders — ambiguous dates then stay unresolved.
 */
export function detectDateOrder(texts: string[]): DateOrder | null {
  let dmy = false;
  let mdy = false;
  for (const text of texts) {
    for (const m of normalizeText(text).matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/g)) {
      const first = Number(m[1]);
      const second = Number(m[2]);
      if (first > 12 && first <= 31 && second >= 1 && second <= 12) dmy = true;
      if (second > 12 && second <= 31 && first >= 1 && first <= 12) mdy = true;
    }
  }
  return dmy === mdy ? null : dmy ? 'DMY' : 'MDY';
}

export function parseDateAsWritten(
  raw: string | null | undefined,
  today: Date = new Date(),
  order: DateOrder | null = null,
): ParsedDate | null {
  if (!raw) return null;
  const text = normalizeText(raw).replace(/,/g, ' ').replace(/\s+/g, ' ');

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]), today);

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (m) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    const year = Number(m[3]);
    if (first > 12 && second <= 12) return toIso(year, second, first, today); // DD/MM/YYYY
    if (second > 12 && first <= 12) return toIso(year, first, second, today); // MM/DD/YYYY
    if (first === second) return toIso(year, first, second, today);
    if (first <= 12 && second <= 12 && order) {
      return order === 'DMY' ? toIso(year, second, first, today) : toIso(year, first, second, today);
    }
    return first > 12 && second > 12 ? { kind: 'invalid' } : { kind: 'ambiguous' };
  }

  m = /^(\d{1,2})[-\s.]([A-Za-z]{3,9})[-\s.](\d{4})$/.exec(text); // 12 Mar 2026 / 12-Mar-2026
  if (m && MONTHS[m[2].toLowerCase()]) return toIso(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]), today);

  m = /^([A-Za-z]{3,9})\s(\d{1,2})\s(\d{4})$/.exec(text); // March 12 2026
  if (m && MONTHS[m[1].toLowerCase()]) return toIso(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]), today);

  return { kind: 'invalid' };
}
