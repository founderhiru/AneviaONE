/** Deterministic number and reference-range parsing. */

export type ParsedValue =
  | { kind: 'number'; value: number; comparator: null }
  | { kind: 'bounded'; value: number; comparator: '<' | '>' | '<=' | '>=' }
  | { kind: 'ambiguous' }
  | { kind: 'text' };

const NUM = String.raw`[+-]?\d{1,9}(?:\.\d{1,6})?`;

/**
 * Classifies a value exactly as written.
 *  "5.8"      → number
 *  "<0.5"     → bounded (an inequality is not an exact value)
 *  "5.8-6.1", "~6", "approx 6", "6 or 7", "5.8 6.1" → ambiguous
 *  "Positive" → text
 * Thousands separators ("1,200") are not interpreted — they are ambiguous.
 */
export function parseValueAsWritten(raw: string): ParsedValue {
  const s = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!s) return { kind: 'text' };

  const plain = s.match(new RegExp(`^(${NUM})$`));
  if (plain) {
    const value = Number(plain[1]);
    return Number.isFinite(value) ? { kind: 'number', value, comparator: null } : { kind: 'ambiguous' };
  }

  const bounded = s.match(new RegExp(`^(<=|>=|≤|≥|<|>)\\s*(${NUM})$`));
  if (bounded) {
    const op = bounded[1] === '≤' ? '<=' : bounded[1] === '≥' ? '>=' : (bounded[1] as '<' | '>' | '<=' | '>=');
    const value = Number(bounded[2]);
    return Number.isFinite(value) ? { kind: 'bounded', value, comparator: op } : { kind: 'ambiguous' };
  }

  if (/\d/.test(s)) return { kind: 'ambiguous' }; // digits mixed with anything else
  return { kind: 'text' };
}

export type ParsedRange = { low: number | null; high: number | null };

/**
 * Parses a reference range written as "4.0 - 5.6", "4.0 to 5.6", "<200",
 * "≥ 40", optionally followed by a unit. Anything else (labels, multiple
 * bands such as "Desirable <200 / Borderline 200-239") returns null — we keep
 * the text as written and do not guess numbers from it.
 */
export function parseReferenceRange(raw: string): ParsedRange | null {
  const s = raw
    .normalize('NFKC')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  // Remove one trailing unit-like token (letters, %, /, digits after a slash).
  const noUnit = s.replace(/\s*(?:%|[A-Za-zµμ][A-Za-zµμ0-9./²^]*(?:\/[A-Za-zµμ0-9.²^ ]+)?)$/, '').trim();

  let m = noUnit.match(new RegExp(`^(${NUM})\\s*(?:-|to)\\s*(${NUM})$`, 'i'));
  if (m) {
    const low = Number(m[1]);
    const high = Number(m[2]);
    if (Number.isFinite(low) && Number.isFinite(high) && low <= high) return { low, high };
    return null;
  }
  m = noUnit.match(new RegExp(`^(<=|≤|<)\\s*(${NUM})$`));
  if (m) return { low: null, high: Number(m[2]) };
  m = noUnit.match(new RegExp(`^(>=|≥|>)\\s*(${NUM})$`));
  if (m) return { low: Number(m[2]), high: null };
  return null;
}

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}
