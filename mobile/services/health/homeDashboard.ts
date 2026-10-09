import type { HealthChange, HealthEvent, Medication, RecordedObservation, StoredDocument, Trend } from '../../types';
import { metricKey } from './healthMemoryApi';

/**
 * Home dashboard, derived deterministically from the person's own trusted
 * records as the services return them. Nothing here is a default or a
 * sample, nothing is inferred by a model, and no medical threshold is
 * imported: a result is compared only with the reference range printed on
 * its own report. Results still held for review are never used.
 */

// ----------------------------------------------------------------- stages --

/**
 * new         — nothing added yet: an intentional start, no figures at all.
 * early       — a report or a few, not yet enough to compare over time.
 * established — the same test recorded in more than one report.
 */
export type HomeStage = 'new' | 'early' | 'established';

export const trustedResults = (results: RecordedObservation[]) => results.filter((r) => !r.needsReview);

export function homeStage(input: { documents: StoredDocument[]; results: RecordedObservation[]; timeline: HealthEvent[]; trends: Trend[] }): HomeStage {
  const results = trustedResults(input.results);
  if (input.documents.length === 0 && results.length === 0 && input.timeline.length === 0) return 'new';
  const reportsWithResults = new Set(results.map((r) => r.source.documentId)).size;
  const comparable = input.trends.some((t) => t.points.length >= 2);
  return reportsWithResults >= 2 && comparable ? 'established' : 'early';
}

// ---------------------------------------------------------------- summary --

/** Areas named only from the classification stored with each result; "other" is not an area. */
const AREA_LABELS: Record<string, string> = {
  laboratory: 'Lab tests',
  blood: 'Blood tests',
  urine: 'Urine tests',
  vital_sign: 'Vital signs',
  vitals: 'Vital signs',
  imaging: 'Imaging',
};

export type DashboardSummary = {
  reportCount: number;
  /** Trusted results (test values) in Health Memory. */
  resultCount: number;
  /** Health areas the results can be reliably placed in; null when there are
   * results but none of them could be classified (shown as a neutral "—"). */
  healthAreas: string[] | null;
  medicationCount: number;
};

export function summarizeDashboard(input: { documents: StoredDocument[]; results: RecordedObservation[]; medications: Medication[] }): DashboardSummary {
  const results = trustedResults(input.results);
  const areas = [...new Set(results.map((r) => AREA_LABELS[r.category ?? '']).filter((a): a is string => Boolean(a)))];
  return {
    reportCount: input.documents.length,
    resultCount: results.length,
    healthAreas: results.length > 0 && areas.length === 0 ? null : areas,
    medicationCount: input.medications.length,
  };
}

// ------------------------------------------------- reported-range checks --

type Range = { low: number | null; high: number | null };

/**
 * Same rules as the server's range parser (health-engine/normalize.ts), used
 * when the server's bounds aren't on the row: "4.5 - 8.0", "1.010–1.030",
 * "< 100", "≥ 40". Anything else is not a comparable range.
 */
export function parseReportedRange(raw: string | null | undefined): Range | null {
  if (!raw) return null;
  const text = raw
    .normalize('NFKC')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[a-zA-Zµμ%/²]+.*$/, '')
    .trim();
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

/** A plain number only — "<0.5", "1,200" or "Nil" are never guessed at. */
function numericValue(r: RecordedObservation): number | null {
  if (typeof r.valueNumeric === 'number' && Number.isFinite(r.valueNumeric)) return r.valueNumeric;
  const text = r.value.trim();
  return /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
}

function rangeOf(r: RecordedObservation): Range | null {
  const low = r.referenceLow ?? null;
  const high = r.referenceHigh ?? null;
  if (low !== null || high !== null) return { low, high };
  return parseReportedRange(r.referenceRange);
}

export type RangePosition = 'above' | 'below' | 'within';

/** Where a result sits against the range printed on its own report; null when that can't be told. */
export function resultPosition(r: RecordedObservation): RangePosition | null {
  const value = numericValue(r);
  const range = rangeOf(r);
  if (value === null || !range) return null;
  if (range.high !== null && value > range.high) return 'above';
  if (range.low !== null && value < range.low) return 'below';
  return 'within';
}

/** A flag printed on the report next to the result. "Critical" only when the report says so in words. */
export function reportFlag(r: RecordedObservation): 'critical' | 'abnormal' | null {
  const flag = r.abnormalFlag?.trim();
  if (!flag) return null;
  if (/\b(critical|panic)\b/i.test(flag)) return 'critical';
  if (/^(h|l|hi|lo|high|low|abn|abnormal|a|\*+|h\*|l\*)$/i.test(flag)) return 'abnormal';
  return null;
}

// --------------------------------------------------------------- signals --

export type SignalKind = 'critical' | 'repeated' | 'moved_outside' | 'outside' | 'flagged';

export type HealthSignal = {
  id: string;
  kind: SignalKind;
  name: string;
  value: string;
  unit: string | null;
  date: string | null;
  /** The range exactly as printed on the report. */
  referenceRange: string | null;
  headline: string;
  detail: string;
  /** Professional follow-up only — never a diagnosis, medicine or treatment. */
  advice: string | null;
  sourceDocumentId: string;
};

export const SIGNAL_COPY = {
  above: 'Above the reported range',
  below: 'Below the reported range',
  aboveDetail: 'Higher than the reference range shown on your report.',
  belowDetail: 'Lower than the reference range shown on your report.',
  repeated: (reports: number) => `This result has remained outside the reported range across ${reports} reports.`,
  movedOutside: 'This result has changed from your previous report, where it was within the reported range.',
  flaggedHeadline: 'Flagged on your report',
  flagged: (flag: string) => `Your report marks this result “${flag}”.`,
  criticalHeadline: 'Flagged as critical on your report',
  critical: 'Your report flags this result as critical. Please follow the instructions on the report and contact your healthcare professional promptly.',
  discussResult: 'Consider discussing this result with your doctor.',
  discussPattern: 'Consider discussing this pattern with your doctor.',
  discussAll: 'Consider discussing these results with your doctor.',
  none: 'No results currently flagged for attention.',
} as const;

const PRIORITY: Record<SignalKind, number> = { critical: 0, repeated: 1, moved_outside: 2, outside: 3, flagged: 4 };

/** Newest first; undated results last (never given a date). */
const byDateDesc = (a: RecordedObservation, b: RecordedObservation) => (b.date ?? '').localeCompare(a.date ?? '');

/**
 * Results worth a conversation with a doctor, judged only on the latest
 * result of each test against its own report's printed range (or flag):
 * above/below range, outside it in consecutive reports, newly outside it
 * since the previous report, or flagged by the report itself.
 */
export function healthSignals(results: RecordedObservation[]): HealthSignal[] {
  const series = new Map<string, RecordedObservation[]>();
  for (const r of trustedResults(results)) {
    const key = metricKey(r.name);
    if (!series.has(key)) series.set(key, []);
    series.get(key)!.push(r);
  }

  const signals: HealthSignal[] = [];
  for (const list of series.values()) {
    const [latest, ...older] = [...list].sort(byDateDesc);
    // Earlier results are those from a different report on an earlier date.
    const previous = older.filter((o) => o.date && latest.date && o.date < latest.date && o.source.documentId !== latest.source.documentId);
    const flag = reportFlag(latest);
    const position = resultPosition(latest);
    const base = {
      id: latest.id,
      name: latest.name,
      value: latest.value,
      unit: latest.unit,
      date: latest.date,
      referenceRange: latest.referenceRange,
      sourceDocumentId: latest.source.documentId,
    };

    if (flag === 'critical') {
      signals.push({ ...base, kind: 'critical', headline: SIGNAL_COPY.criticalHeadline, detail: SIGNAL_COPY.critical, advice: null });
    } else if (position === 'above' || position === 'below') {
      const headline = position === 'above' ? SIGNAL_COPY.above : SIGNAL_COPY.below;
      let run = 1;
      while (run <= previous.length && resultPosition(previous[run - 1]) === position) run++;
      if (run >= 2) {
        signals.push({ ...base, kind: 'repeated', headline, detail: SIGNAL_COPY.repeated(run), advice: SIGNAL_COPY.discussPattern });
      } else if (previous[0] && resultPosition(previous[0]) === 'within') {
        signals.push({ ...base, kind: 'moved_outside', headline, detail: SIGNAL_COPY.movedOutside, advice: SIGNAL_COPY.discussResult });
      } else {
        const detail = position === 'above' ? SIGNAL_COPY.aboveDetail : SIGNAL_COPY.belowDetail;
        signals.push({ ...base, kind: 'outside', headline, detail, advice: SIGNAL_COPY.discussResult });
      }
    } else if (flag === 'abnormal') {
      signals.push({ ...base, kind: 'flagged', headline: SIGNAL_COPY.flaggedHeadline, detail: SIGNAL_COPY.flagged(latest.abnormalFlag!.trim()), advice: SIGNAL_COPY.discussResult });
    }
  }
  return signals.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || (b.date ?? '').localeCompare(a.date ?? ''));
}

// -------------------------------------------------------- health snapshot --

/** The area a result belongs to, from its stored classification; unclassified → null. */
export const areaOf = (r: RecordedObservation): string | null => AREA_LABELS[r.category ?? ''] ?? null;

/**
 * Home's snapshot: a few of the newest results, spread across health areas
 * so no single area fills Home, preferring (on the same date) results with a
 * number and a printed range over descriptive ones like "Clear". Only the latest result of each test is used;
 * results already shown under Worth Your Attention are left out; areas take
 * turns (the most recently updated first), at most `perArea` from each.
 */
export function healthSnapshot(
  results: RecordedObservation[],
  options: { exclude?: Iterable<string>; max?: number; perArea?: number } = {},
): RecordedObservation[] {
  const { max = 4, perArea = 2 } = options;
  const excluded = new Set(options.exclude ?? []);
  const latestPerTest = new Map<string, RecordedObservation>();
  // Newest first; on the same date, results that can be read against a printed range come first.
  const checkable = (r: RecordedObservation) => (resultPosition(r) === null ? 1 : 0);
  for (const r of [...trustedResults(results)].sort((a, b) => byDateDesc(a, b) || checkable(a) - checkable(b))) {
    const key = metricKey(r.name);
    if (!latestPerTest.has(key)) latestPerTest.set(key, r);
  }
  const byArea = new Map<string, RecordedObservation[]>();
  for (const r of latestPerTest.values()) {
    if (excluded.has(r.id)) continue;
    const area = areaOf(r) ?? 'other';
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area)!.push(r);
  }
  // Each list is already newest-first; areas are ordered by their newest result.
  const queues = [...byArea.values()].sort((x, y) => byDateDesc(x[0], y[0])).map((list) => list.slice(0, perArea));
  const picked: RecordedObservation[] = [];
  for (let round = 0; picked.length < max && queues.some((q) => q.length > round); round++) {
    for (const q of queues) {
      if (picked.length >= max) break;
      if (q[round]) picked.push(q[round]);
    }
  }
  return picked;
}

// --------------------------------------------------------- history/change --

/** The newest dated event up to today; an undated one only if nothing is dated. */
export function latestActivity(timeline: HealthEvent[], now = new Date()): HealthEvent | null {
  const today = now.toISOString().slice(0, 10);
  const dated = timeline.filter((e) => e.date && e.date.slice(0, 10) <= today).sort((a, b) => b.date!.localeCompare(a.date!));
  return dated[0] ?? timeline.find((e) => !e.date) ?? null;
}

/** Home shows one change: a measured value first, otherwise the newest item. */
export function pickChange(changes: HealthChange[]): HealthChange | null {
  return changes.find((c) => c.type === 'value_change') ?? changes[0] ?? null;
}

/** "Increased since your previous report." — only from two plain numbers. */
export function describeChange(change: HealthChange): string | null {
  if (change.type !== 'value_change') return change.summary ?? null;
  const prev = Number(change.previousValue);
  const curr = Number(change.currentValue);
  if (!change.previousValue || !change.currentValue || !Number.isFinite(prev) || !Number.isFinite(curr)) return change.summary ?? null;
  if (curr > prev) return 'Increased since your previous report.';
  if (curr < prev) return 'Decreased since your previous report.';
  return 'Unchanged since your previous report.';
}

/** "06 Oct 2026". */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace('Sept', 'Sep');
}
