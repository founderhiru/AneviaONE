/**
 * Timeline — report events plus separate events for procedures, vaccinations
 * and visits whose own date differs from their report's date. Every event
 * lists the trusted records behind it.
 *
 * Report events are dated by the records they summarise. Each record's date
 * is its own (a result's sample/test date), else its document's printed
 * report date, else none (records.ts). A document's records are grouped by
 * that date: one event per date. An upload holding several report sections
 * (e.g. blood tests sampled 05 Oct and a urine test sampled 06 Oct) gives one
 * event per section date — never every result under the document's single
 * report date. A document whose records share one date keeps a single event
 * with its usual id; extra date groups get the date appended to the id.
 * Missing dates are never invented: undated events are returned last,
 * flagged `date: null`.
 *
 * A report event is labelled by the health area of its results when they
 * all share one classified area (e.g. "Urine tests"), else "Health report" —
 * never by the uploaded file's technical name (still in `evidence`).
 */

import type { Evidence, TrustedRecord } from './records.ts';

export type TimelineEventType = 'report' | 'procedure' | 'immunization' | 'encounter';

export type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  date: string | null;
  title: string;
  /** Neutral counts, e.g. "2 test results · 1 medication". */
  summary: string;
  documentId: string | null;
  recordIds: string[];
  evidence: Evidence[];
};

const NOUNS: Record<TrustedRecord['kind'], [string, string]> = {
  observation: ['test result', 'test results'],
  medication: ['medication', 'medications'],
  condition: ['condition', 'conditions'],
  allergy: ['allergy', 'allergies'],
  procedure: ['procedure', 'procedures'],
  immunization: ['vaccination', 'vaccinations'],
  encounter: ['visit', 'visits'],
};
/** Areas named only from the classification stored with each result; "other" is not an area. */
const AREA_LABELS: Record<string, string> = {
  laboratory: 'Lab tests',
  urine: 'Urine tests',
  vital_sign: 'Vital signs',
  imaging: 'Imaging',
};
export const NEUTRAL_REPORT_LABEL = 'Health report';

/** "Urine tests" when every result is in that one area; otherwise the neutral label. */
function reportLabel(records: TrustedRecord[]): string {
  const observations = records.filter((r) => r.kind === 'observation');
  if (observations.length === 0) return NEUTRAL_REPORT_LABEL;
  const areas = new Set(observations.map((r) => AREA_LABELS[r.category ?? ''] ?? null));
  const [only] = [...areas];
  return areas.size === 1 && only ? only : NEUTRAL_REPORT_LABEL;
}

const KIND_ORDER: TrustedRecord['kind'][] = ['observation', 'medication', 'condition', 'allergy', 'procedure', 'immunization', 'encounter'];

function countSummary(records: TrustedRecord[]): string {
  return KIND_ORDER.map((k) => [k, records.filter((r) => r.kind === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${NOUNS[k][n === 1 ? 0 : 1]}`)
    .join(' · ');
}

export function buildTimeline(records: TrustedRecord[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const byDoc = new Map<string, TrustedRecord[]>();
  const separate: TrustedRecord[] = [];

  for (const r of records) {
    const docId = r.evidence.documentId;
    const ownDated = r.dateSource === 'record' && r.date !== r.evidence.reportDate;
    if ((r.kind === 'procedure' || r.kind === 'immunization' || r.kind === 'encounter') && ownDated) separate.push(r);
    else if (docId) byDoc.set(docId, [...(byDoc.get(docId) ?? []), r]);
    else separate.push(r);
  }

  for (const [docId, recs] of byDoc) {
    const byDate = new Map<string | null, TrustedRecord[]>();
    for (const r of recs) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
    for (const [date, group] of byDate) {
      events.push({
        id: byDate.size === 1 ? `report:${docId}` : `report:${docId}:${date ?? 'undated'}`,
        type: 'report',
        date,
        title: reportLabel(group),
        summary: countSummary(group),
        documentId: docId,
        recordIds: group.map((r) => r.id).sort(),
        evidence: [group[0].evidence],
      });
    }
  }

  for (const r of separate) {
    events.push({
      id: `${r.kind}:${r.id}`,
      type: r.kind === 'immunization' ? 'immunization' : r.kind === 'encounter' ? 'encounter' : 'procedure',
      date: r.date,
      title: r.name,
      summary: r.evidence.documentName ? `Recorded in ${r.evidence.documentName}` : 'Recorded by you',
      documentId: r.evidence.documentId,
      recordIds: [r.id],
      evidence: [r.evidence],
    });
  }

  return events.sort((a, b) => {
    if (a.date !== b.date) {
      if (a.date === null) return 1;
      if (b.date === null) return -1;
      return a.date < b.date ? 1 : -1;
    }
    return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
}
