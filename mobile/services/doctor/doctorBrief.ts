import type { Allergy, Condition, Medication, RecordedObservation, StoredDocument } from '../../types';
import { reportNames } from '../documents/reportName';
import { resultPosition, shortDate, trustedResults } from '../health/homeDashboard';
import { buildComparisons, needsReview } from '../health/whatChanged';

/**
 * The Doctor brief: a one-page summary of the person's own trusted records,
 * built deterministically — no AI, no medical thresholds, no interpretation.
 * A result counts as outside range ONLY against the range printed on its own
 * report; everything else is shown as written, with the report it came from.
 * Held results are never included; they are counted, and marked unverified.
 */

export type BriefPerson = { name: string | null; dateOfBirth: string | null };

export type BriefResult = {
  id: string;
  name: string;
  /** Value with its printed unit, e.g. "10.8 g/dL". */
  value: string;
  range: string | null;
  position: 'above' | 'below' | 'within' | null;
  /** A flag printed on the report next to the result, as written. */
  flag: string | null;
  date: string | null;
  documentId: string;
  /** "Blood test · 15 Jan 2026", or the file name when the kind isn't clear. */
  reportTitle: string;
  /** The same test on the report before this one (same printed unit), when there is one. */
  previous: { value: string; date: string } | null;
};

export type BriefReport = { documentId: string; title: string; date: string | null; results: BriefResult[] };

export type BriefTrend = { name: string; unit: string | null; points: Array<{ date: string; value: string; position: BriefResult['position'] }> };

export type DoctorBrief = {
  preparedOn: string;
  person: BriefPerson;
  reportCount: number;
  resultCount: number;
  outsideRange: BriefResult[];
  reports: BriefReport[];
  trends: BriefTrend[];
  medications: string[];
  conditions: string[];
  allergies: string[];
  /** Reports with results held for checking (not included above). */
  heldReports: number;
};

const withUnit = (value: string, unit: string | null | undefined) => (unit ? `${value} ${unit}` : value);

/** Newest first; undated last. */
const byDateDesc = (a: string | null, b: string | null) => (a && b ? b.localeCompare(a) : a ? -1 : b ? 1 : 0);

export function buildDoctorBrief(input: {
  person: BriefPerson;
  results: RecordedObservation[];
  documents: StoredDocument[];
  medications: Medication[];
  conditions: Condition[];
  allergies: Allergy[];
  now?: Date;
}): DoctorBrief {
  const trusted = trustedResults(input.results);
  const names = reportNames(trusted);

  const series = buildComparisons(input.results).numeric;
  const previousOf = (r: RecordedObservation): BriefResult['previous'] => {
    const key = (n: string) => n.trim().toLowerCase();
    const unit = (u: string | null | undefined) => (u ?? '').replace(/\s+/g, '').toLowerCase();
    const s = series.find((c) => key(c.name) === key(r.name) && unit(c.unit) === unit(r.unit));
    if (!s || !r.date) return null;
    const at = s.points.findIndex((p) => p.resultId === r.id);
    const before = at > 0 ? s.points[at - 1] : null;
    return before ? { value: before.valueText, date: before.date } : null;
  };

  const toResult = (r: RecordedObservation): BriefResult => ({
    id: r.id,
    name: r.name,
    value: withUnit(r.value, r.unit),
    range: r.referenceRange,
    position: resultPosition(r),
    flag: r.abnormalFlag?.trim() || null,
    date: r.date,
    documentId: r.source.documentId,
    reportTitle: names.get(r.source.documentId) ?? r.source.documentName,
    previous: previousOf(r),
  });

  const all = trusted.map(toResult);
  const outsideRange = all
    .filter((r) => r.position === 'above' || r.position === 'below')
    .sort((a, b) => byDateDesc(a.date, b.date) || a.name.localeCompare(b.name));

  const byDocument = new Map<string, BriefResult[]>();
  for (const r of all) {
    if (!byDocument.has(r.documentId)) byDocument.set(r.documentId, []);
    byDocument.get(r.documentId)!.push(r);
  }
  const reports: BriefReport[] = [...byDocument.entries()]
    .map(([documentId, results]) => {
      const dates = results.map((r) => r.date).filter((d): d is string => Boolean(d)).sort();
      return { documentId, title: results[0].reportTitle, date: dates.length ? dates[dates.length - 1] : null, results };
    })
    .sort((a, b) => byDateDesc(a.date, b.date) || a.title.localeCompare(b.title));

  // Same test, same printed unit, two or more dates — shown as values by date, never a verdict.
  const trends: BriefTrend[] = series.map((c) => ({
    name: c.name,
    unit: c.unit,
    points: c.points.map((p) => ({ date: p.date, value: p.valueText, position: p.position })),
  }));

  const listed = new Map(input.documents.map((d) => [d.id, d]));
  const heldReports = [...listed.values()].filter(needsReview).length;

  const unique = (items: string[]) => [...new Set(items.map((s) => s.trim()).filter(Boolean))];

  return {
    preparedOn: (input.now ?? new Date()).toISOString().slice(0, 10),
    person: input.person,
    reportCount: reports.length,
    resultCount: all.length,
    outsideRange,
    reports,
    trends,
    medications: unique(
      input.medications
        .filter((m) => m.status !== 'past')
        .map((m) => [m.name, m.dosage, m.frequency].filter(Boolean).join(' · '))
    ),
    conditions: unique(input.conditions.filter((c) => c.assertion !== 'mentioned').map((c) => c.name)),
    allergies: unique(input.allergies.map((a) => (a.reaction ? `${a.substance} (${a.reaction})` : a.substance))),
    heldReports,
  };
}

export const briefDate = (iso: string | null | undefined) => shortDate(iso) ?? 'Date not clear';
