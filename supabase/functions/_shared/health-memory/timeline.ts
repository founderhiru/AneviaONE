/**
 * Timeline — one event per report (dated by its printed report date, else
 * its records' dates) plus separate events for procedures, vaccinations and
 * visits whose own date differs from their report's date. Every event lists
 * the trusted records behind it. Missing dates are never invented: undated
 * events are returned last, flagged `date: null`.
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
    const first = recs[0];
    const ownDates = recs.map((r) => r.date).filter((d): d is string => d !== null).sort();
    const date = first.evidence.reportDate ?? ownDates[ownDates.length - 1] ?? null;
    events.push({
      id: `report:${docId}`,
      type: 'report',
      date,
      title: first.evidence.documentName ?? 'Report',
      summary: countSummary(recs),
      documentId: docId,
      recordIds: recs.map((r) => r.id).sort(),
      evidence: [first.evidence],
    });
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
