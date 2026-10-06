/**
 * Deterministic date parsing from the text exactly as written in a report.
 * The model never interprets dates. Numeric day/month order is only resolved
 * when the digits make it unambiguous; otherwise the result is 'ambiguous'.
 */

export type DateParse =
  | { kind: 'ok'; iso: string }
  | { kind: 'ambiguous' }
  | { kind: 'invalid' }
  | { kind: 'none' };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function isRealDate(y: number, m: number, d: number): boolean {
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

function iso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function ok(y: number, m: number, d: number): DateParse {
  return isRealDate(y, m, d) ? { kind: 'ok', iso: iso(y, m, d) } : { kind: 'invalid' };
}

/** All ISO dates a numeric day/month pair could mean (0, 1 or 2 results). */
export function numericDateCandidates(a: number, b: number, y: number): string[] {
  const out: string[] = [];
  if (isRealDate(y, b, a)) out.push(iso(y, b, a)); // dd/mm
  if (a !== b && isRealDate(y, a, b)) out.push(iso(y, a, b)); // mm/dd
  return out;
}

export function parseDateAsWritten(raw: string | null | undefined): DateParse {
  if (typeof raw !== 'string') return { kind: 'none' };
  const s = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!s) return { kind: 'none' };

  // 2026-03-12 · 2026/03/12 · 2026.03.12 (year first is unambiguous)
  let m = s.match(/(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/);
  if (m) return ok(Number(m[1]), Number(m[2]), Number(m[3]));

  // 12 Mar 2026 · 12-Mar-2026 · 12th March, 2026
  m = s.match(/(?<!\d)(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]*([A-Za-z]{3,9})\.?[\s\-/.,]*(\d{4})(?!\d)/);
  if (m && MONTHS[m[2].toLowerCase()]) return ok(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));

  // Mar 12, 2026 · March 12th 2026
  m = s.match(/(?<![A-Za-z])([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)/);
  if (m && MONTHS[m[1].toLowerCase()]) return ok(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));

  // 12/03/2026 · 12-03-2026 · 12.03.2026 — only when the digits decide the order.
  m = s.match(/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    const candidates = numericDateCandidates(a, b, y);
    if (candidates.length === 0) return { kind: 'invalid' };
    if (candidates.length === 1) return { kind: 'ok', iso: candidates[0] };
    return { kind: 'ambiguous' };
  }

  // Two-digit years and anything else are never guessed.
  return /\d/.test(s) ? { kind: 'invalid' } : { kind: 'none' };
}

/** True when `raw` could mean `isoDate` under any valid reading. */
export function dateCouldMatch(raw: string, isoDate: string): boolean {
  const parsed = parseDateAsWritten(raw);
  if (parsed.kind === 'ok') return parsed.iso === isoDate;
  if (parsed.kind !== 'ambiguous') return false;
  const m = raw.match(/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/);
  if (!m) return false;
  return numericDateCandidates(Number(m[1]), Number(m[2]), Number(m[3])).includes(isoDate);
}
