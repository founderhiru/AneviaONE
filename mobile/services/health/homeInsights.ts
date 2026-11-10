import type { RecordedObservation } from '../../types';
import { healthSnapshot, resultPosition, shortDate, trustedResults, type RangePosition } from './homeDashboard';
import { buildComparisons } from './whatChanged';

/**
 * Plain facts for Home, taken only from the person's own trusted results:
 * where a value sits against the range printed on its own report, and when a
 * test was last done. Nothing is scored, advised or diagnosed.
 */

export type RangeBarModel = {
  /** 0..1 along the bar (clamped). */
  marker: number;
  /** The printed normal band along the same bar, 0..1. */
  bandStart: number;
  bandEnd: number;
  position: RangePosition;
  low: number | null;
  high: number | null;
};

const num = (r: RecordedObservation): number | null => {
  if (typeof r.valueNumeric === 'number' && Number.isFinite(r.valueNumeric)) return r.valueNumeric;
  return /^-?\d+(?:\.\d+)?$/.test(r.value.trim()) ? Number(r.value.trim()) : null;
};

/** Bounds as printed: the stored low/high, else the "4.0 - 5.6" / "<130" text. */
function bounds(r: RecordedObservation): { low: number | null; high: number | null } | null {
  const low = r.referenceLow ?? null;
  const high = r.referenceHigh ?? null;
  if (low !== null || high !== null) return { low, high };
  const text = (r.referenceRange ?? '').normalize('NFKC').replace(/[‐-―−]/g, '-').replace(/[a-zA-Zµμ%/²]+.*$/, '').trim();
  const between = /^(-?\d+(?:\.\d+)?)\s*(?:-|to)\s*(-?\d+(?:\.\d+)?)$/.exec(text);
  if (between && Number(between[1]) <= Number(between[2])) return { low: Number(between[1]), high: Number(between[2]) };
  const upper = /^(?:<|≤|<=)\s*(-?\d+(?:\.\d+)?)$/.exec(text);
  if (upper) return { low: null, high: Number(upper[1]) };
  const lower = /^(?:>|≥|>=)\s*(-?\d+(?:\.\d+)?)$/.exec(text);
  if (lower) return { low: Number(lower[1]), high: null };
  return null;
}

/** A bar for one result, or null when it has no plain number or no printed range. */
export function rangeBarOf(r: RecordedObservation): RangeBarModel | null {
  const value = num(r);
  const b = bounds(r);
  const position = resultPosition(r);
  if (value === null || !b || position === null) return null;
  // Show the printed band in the middle ~half of the bar, with room either side for a value outside it.
  let lo: number;
  let hi: number;
  if (b.low !== null && b.high !== null) {
    const span = Math.max(b.high - b.low, 1e-9);
    lo = b.low - span * 0.6;
    hi = b.high + span * 0.6;
  } else if (b.high !== null) {
    lo = Math.min(0, value) < 0 ? value * 1.2 : 0;
    hi = b.high * 1.6;
  } else {
    const l = b.low as number;
    lo = l * 0.4;
    hi = l * 1.6;
  }
  if (hi <= lo) return null;
  const at = (x: number) => Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return { marker: at(value), bandStart: b.low !== null ? at(b.low) : 0, bandEnd: b.high !== null ? at(b.high) : 1, position, low: b.low, high: b.high };
}

/** "3 months ago", "2 weeks ago", "yesterday": only from the result's own date. */
export function agoLabel(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso.slice(0, 10) + 'T00:00:00Z').getTime()) / 86_400_000);
  if (days < 0) return 'recently';
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `${Math.round(days / 30.4)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

export type KeyNumber = { id: string; documentId: string; name: string; value: string; unit: string | null; date: string | null; when: string; bar: RangeBarModel };

/**
 * The latest result of each test that has a plain number and a printed range:
 * those outside the range first, then the rest, newest first. This is "where
 * you stand" for results that are not repeated yet, so there is nothing to chart.
 */
export function keyNumbers(results: RecordedObservation[], max = 4, now: Date = new Date()): KeyNumber[] {
  const latest = healthSnapshot(trustedResults(results), { max: Number.MAX_SAFE_INTEGER, perArea: Number.MAX_SAFE_INTEGER });
  const rows = latest
    .map((r) => ({ r, bar: rangeBarOf(r) }))
    .filter((x): x is { r: RecordedObservation; bar: RangeBarModel } => x.bar !== null);
  const outside = (x: { bar: RangeBarModel }) => (x.bar.position === 'within' ? 1 : 0);
  rows.sort((a, b) => outside(a) - outside(b) || (b.r.date ?? '').localeCompare(a.r.date ?? ''));
  return rows.slice(0, max).map(({ r, bar }) => ({
    id: r.id,
    documentId: r.source.documentId,
    name: r.name,
    value: r.value,
    unit: r.unit,
    date: r.date,
    when: r.date ? `${shortDate(r.date)} · ${agoLabel(r.date, now)}` : 'Date not clear',
    bar,
  }));
}

export type FamilyDigest = {
  /** Newest dated result, i.e. the newest report's date. */
  latestDate: string | null;
  /** Tests whose latest result is outside the range printed on its report. */
  outsideCount: number;
  /** Tests that appear on two or more dates (so they can be compared). */
  trackedCount: number;
  resultCount: number;
};

/** What changed for one person, in numbers a family member can read at a glance. */
export function familyDigest(results: RecordedObservation[]): FamilyDigest {
  const trusted = trustedResults(results);
  const dates = trusted.map((r) => r.date).filter((d): d is string => Boolean(d)).sort();
  const latest = healthSnapshot(trusted, { max: Number.MAX_SAFE_INTEGER, perArea: Number.MAX_SAFE_INTEGER });
  return {
    latestDate: dates.length ? dates[dates.length - 1] : null,
    outsideCount: latest.filter((r) => {
      const p = resultPosition(r);
      return p === 'above' || p === 'below';
    }).length,
    trackedCount: buildComparisons(trusted).numeric.length,
    resultCount: trusted.length,
  };
}
