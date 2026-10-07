import type { HealthEvent, Medication, StoredDocument, Trend } from '../../types';

/**
 * Home's Health Snapshot, derived only from the person's own data as the
 * services return it. Nothing here is a default or a sample: a count is the
 * length of a real list, a date is a real record date, and anything the
 * records don't support is `null` so Home shows a neutral state instead.
 */
export type HomeSummary = {
  /** Stored documents (every upload the person has added). */
  documentCount: number;
  /** Measures with at least two dated results — something to compare. */
  trendMeasureCount: number;
  /** Medications recorded in reports. Reports rarely say whether a medicine
   * is still taken, so these are "recorded", never "active". */
  medicationCount: number;
  /** Earliest visit/check-up dated after today, or null. */
  nextCheckupDate: string | null;
  /** Newest dated record on the timeline, or null. */
  latestRecordDate: string | null;
};

/** Event types that are a visit or check-up (not a report or result). */
const VISIT_TYPES = new Set<HealthEvent['type']>(['encounter', 'annual_check', 'consultation']);

const dayOf = (iso: string) => iso.slice(0, 10);

export function summarizeHome(input: {
  documents: StoredDocument[];
  trends: Trend[];
  medications: Medication[];
  timeline: HealthEvent[];
  now?: Date;
}): HomeSummary {
  const today = dayOf((input.now ?? new Date()).toISOString());
  const dated = input.timeline.filter((e): e is HealthEvent & { date: string } => Boolean(e.date));
  const upcoming = dated
    .filter((e) => VISIT_TYPES.has(e.type) && dayOf(e.date) > today)
    .map((e) => dayOf(e.date))
    .sort();
  const past = dated.map((e) => dayOf(e.date)).filter((d) => d <= today).sort();
  return {
    documentCount: input.documents.length,
    trendMeasureCount: input.trends.filter((t) => t.points.length >= 2).length,
    medicationCount: input.medications.length,
    nextCheckupDate: upcoming[0] ?? null,
    latestRecordDate: past[past.length - 1] ?? null,
  };
}

/**
 * The years shown on Home's timeline line: all of them when they fit,
 * otherwise the first year and the most recent ones — always real years,
 * oldest first, never filled in.
 */
export function visibleYears(years: string[], max = 5): string[] {
  if (years.length <= max) return years;
  return [years[0], ...years.slice(-(max - 1))];
}

/** "Mar 2027" — month and year only, for the snapshot cards. */
export function monthYear(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).replace('Sept', 'Sep');
}
