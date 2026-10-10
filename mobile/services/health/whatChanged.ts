import type { RecordedObservation, StoredDocument } from '../../types';
import { isListedStatus } from '../documents/documentStatus';
import { metricKey } from './healthMemoryApi';
import { resultPosition, shortDate, trustedResults, type RangePosition } from './homeDashboard';

/**
 * "What changed?" and Home's summary — derived on the device, deterministically,
 * from the person's own TRUSTED current results (`current_observations`: never
 * superseded, never held for review) and their documents. Nothing here is
 * stored, and nothing is inferred clinically:
 *   - numbers are compared only for the same test in the same unit (as printed;
 *     no conversion), on two different dates;
 *   - written findings (imaging) are never turned into numbers or trends — the
 *     same finding on two dated reports is shown side by side, as written;
 *   - each result keeps its own report's range; crossing it is stated, never
 *     interpreted.
 */

// ---------------------------------------------------------------- groups --

export type ResultGroup = 'lab' | 'imaging' | 'other';

export const GROUP_LABEL: Record<ResultGroup, string> = { lab: 'Lab', imaging: 'Imaging', other: 'Other' };

/** Filter group from the category stored when the report was read. */
export function resultGroup(r: Pick<RecordedObservation, 'category'>): ResultGroup {
  if (r.category === 'laboratory' || r.category === 'urine') return 'lab';
  if (r.category === 'imaging') return 'imaging';
  return 'other';
}

/** The filter chips worth showing: "All" plus only the groups present. */
export function availableGroups(results: RecordedObservation[]): ResultGroup[] {
  const present = new Set(trustedResults(results).map(resultGroup));
  return (['lab', 'imaging', 'other'] as const).filter((g) => present.has(g));
}

export type GroupFilter = ResultGroup | 'all';

export const inGroup = (filter: GroupFilter) => (r: Pick<RecordedObservation, 'category'>) => filter === 'all' || resultGroup(r) === filter;

// --------------------------------------------------------- home summary --

export type HomeCounts = {
  /** Reports stored (one per document, however many times it was read). */
  reports: number;
  /** Trusted current results in Health Memory. */
  results: number;
  /** Reports with results held until they can be confirmed (or flagged as possibly someone else's). */
  needsReview: number;
  /** Reports whose reading failed (not a review question). */
  couldNotRead: number;
};

/** A report awaiting review: results were read but held, or it may belong to someone else. */
export function needsReview(d: StoredDocument): boolean {
  if (d.status === 'failed') return d.failureKind === 'identity_mismatch';
  return d.status === 'completed' && (d.heldForReviewCount ?? 0) > 0;
}

/** Reading failed for a reason other than identity or consent (those are handled elsewhere). */
export function couldNotRead(d: StoredDocument): boolean {
  return d.status === 'failed' && d.failureKind !== 'identity_mismatch' && d.failureKind !== 'consent_required';
}

export function homeCounts(documents: StoredDocument[], results: RecordedObservation[]): HomeCounts {
  const listed = [...new Map(documents.filter((d) => isListedStatus(d.status)).map((d) => [d.id, d])).values()];
  return {
    reports: listed.length,
    results: trustedResults(results).length,
    needsReview: listed.filter(needsReview).length,
    couldNotRead: listed.filter(couldNotRead).length,
  };
}

// ---------------------------------------------------------- comparisons --

export type ComparisonPoint = {
  resultId: string;
  date: string;
  value: number;
  /** As printed. */
  valueText: string;
  referenceRange: string | null;
  position: RangePosition | null;
  documentId: string;
  documentName: string;
};

export type NumericComparison = {
  kind: 'numeric';
  key: string;
  name: string;
  group: ResultGroup;
  /** As printed; null when no unit was printed on any of these reports. */
  unit: string | null;
  /** Oldest first; one per date. */
  points: ComparisonPoint[];
  previous: ComparisonPoint;
  latest: ComparisonPoint;
  difference: number;
  /** null when the earlier value is 0 (no meaningful percentage). */
  percentChange: number | null;
  direction: 'up' | 'down' | 'same';
  /** Plain statement about each report's own range, or null. Never a diagnosis. */
  rangeNote: string | null;
  summary: string;
};

export type FindingEntry = { resultId: string; date: string; text: string; documentId: string; documentName: string };

/** The same written finding on dated reports, shown as written — never a trend. */
export type FindingHistory = { kind: 'findings'; key: string; name: string; group: ResultGroup; entries: FindingEntry[] };

export type Comparisons = {
  numeric: NumericComparison[];
  findings: FindingHistory[];
  /** Trusted results without a readable date: never compared. */
  undated: number;
};

const unitKey = (unit: string | null | undefined) => (unit ?? '').replace(/\s+/g, '').toLowerCase();

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

function rangeNote(previous: ComparisonPoint, latest: ComparisonPoint): string | null {
  const before = previous.position;
  const now = latest.position;
  if (!before || !now || before === now) return null;
  if (now === 'within') return 'Now within the range printed on its report.';
  return `Now ${now} the range printed on its report.`;
}

/** Comparisons for every test and written finding with history on at least two dates. */
export function buildComparisons(results: RecordedObservation[]): Comparisons {
  const trusted = trustedResults(results);
  const undated = trusted.filter((r) => !r.date).length;
  const numericGroups = new Map<string, RecordedObservation[]>();
  const findingGroups = new Map<string, RecordedObservation[]>();

  for (const r of trusted) {
    if (!r.date) continue;
    const group = resultGroup(r);
    const value = r.valueNumeric;
    if (group !== 'imaging' && typeof value === 'number' && Number.isFinite(value)) {
      // Same test AND same printed unit; a different unit is a different series.
      const key = `${group}|${metricKey(r.name)}|${unitKey(r.unit)}`;
      if (!numericGroups.has(key)) numericGroups.set(key, []);
      numericGroups.get(key)!.push(r);
    } else if (group === 'imaging' && r.value.trim()) {
      const key = `imaging|${metricKey(r.name)}`;
      if (!findingGroups.has(key)) findingGroups.set(key, []);
      findingGroups.get(key)!.push(r);
    }
  }

  const numeric: NumericComparison[] = [];
  for (const [key, list] of numericGroups) {
    // One point per date. Different values on the same date can't be ordered: that date is left out.
    const byDate = new Map<string, RecordedObservation[]>();
    for (const r of list) {
      const day = r.date!.slice(0, 10);
      if (!byDate.has(day)) byDate.set(day, []);
      byDate.get(day)!.push(r);
    }
    const points: ComparisonPoint[] = [];
    for (const [date, same] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
      if (new Set(same.map((r) => r.valueNumeric)).size > 1) continue;
      const r = same[0];
      points.push({
        resultId: r.id,
        date,
        value: r.valueNumeric as number,
        valueText: r.value,
        referenceRange: r.referenceRange,
        position: resultPosition(r),
        documentId: r.source.documentId,
        documentName: r.source.documentName,
      });
    }
    if (points.length < 2) continue;
    const previous = points[points.length - 2];
    const latest = points[points.length - 1];
    const difference = round(latest.value - previous.value, 6);
    const direction = difference > 0 ? 'up' : difference < 0 ? 'down' : 'same';
    const when = shortDate(previous.date);
    numeric.push({
      kind: 'numeric',
      key,
      name: list[0].name,
      group: resultGroup(list[0]),
      unit: list[0].unit,
      points,
      previous,
      latest,
      difference,
      percentChange: previous.value === 0 ? null : round(((latest.value - previous.value) / Math.abs(previous.value)) * 100, 1),
      direction,
      rangeNote: rangeNote(previous, latest),
      summary: direction === 'up' ? `Higher than on ${when}.` : direction === 'down' ? `Lower than on ${when}.` : `The same as on ${when}.`,
    });
  }

  const findings: FindingHistory[] = [];
  for (const [key, list] of findingGroups) {
    const entries = [...list]
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      .map((r) => ({ resultId: r.id, date: r.date!.slice(0, 10), text: r.value, documentId: r.source.documentId, documentName: r.source.documentName }));
    if (new Set(entries.map((e) => e.date)).size < 2) continue;
    findings.push({ kind: 'findings', key, name: list[0].name, group: 'imaging', entries });
  }

  // Most recent first.
  numeric.sort((a, b) => b.latest.date.localeCompare(a.latest.date) || a.name.localeCompare(b.name));
  findings.sort((a, b) => b.entries[b.entries.length - 1].date.localeCompare(a.entries[a.entries.length - 1].date) || a.name.localeCompare(b.name));
  return { numeric, findings, undated };
}

/** Home's preview: the most recent comparable numeric result, if any. */
export function pickHeroComparison(results: RecordedObservation[]): NumericComparison | null {
  return buildComparisons(results).numeric[0] ?? null;
}

/** "+0.3 (+5.2%)" — sign, difference in the printed unit, and percent only when meaningful. */
export function formatDifference(c: Pick<NumericComparison, 'difference' | 'percentChange' | 'unit'>): string {
  const sign = c.difference > 0 ? '+' : c.difference < 0 ? '−' : '';
  const abs = Math.abs(c.difference);
  const amount = `${sign}${Number.isInteger(abs) ? abs : round(abs, 3)}${c.unit ? ` ${c.unit}` : ''}`;
  if (c.percentChange === null || c.difference === 0) return amount;
  const pct = Math.abs(c.percentChange);
  return `${amount} (${sign}${pct}%)`;
}
