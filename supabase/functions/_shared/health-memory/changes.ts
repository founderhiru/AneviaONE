/**
 * What Changed — deterministic comparison of the latest dated report with
 * earlier records. Every change cites the trusted records it came from.
 * Wording is neutral: what appears where, and recorded values — never
 * causes, diagnoses or judgements.
 */

import { formatDate, formatNumber, withUnit } from './format.ts';
import type { Evidence, ObservationRecord, TrustedRecord } from './records.ts';

export type ChangeType =
  | 'value_change'
  | 'new_medication'
  | 'medication_not_in_latest'
  | 'new_condition'
  | 'new_allergy'
  | 'new_procedure'
  | 'new_immunization'
  | 'new_encounter';

export type ChangeSource = { recordId: string; role: 'current' | 'previous'; evidence: Evidence; date: string | null };

export type HealthChange = {
  id: string;
  type: ChangeType;
  name: string;
  summary: string;
  previousValue: string | null;
  currentValue: string | null;
  unit: string | null;
  date: string;
  comparedWithDate: string | null;
  sources: ChangeSource[];
};

export type ReportSnapshot = { documentId: string; documentName: string | null; date: string };

export type ChangesResult = {
  status: 'ok' | 'insufficient_data';
  latest: ReportSnapshot | null;
  previous: ReportSnapshot | null;
  changes: HealthChange[];
};

/** Reports (documents) with at least one trusted record, newest first. A
 * report's date is its printed report date, else its latest record date;
 * reports with neither are left out (never dated by guesswork). */
export function datedReports(records: TrustedRecord[]): ReportSnapshot[] {
  const byDoc = new Map<string, ReportSnapshot>();
  for (const r of records) {
    const id = r.evidence.documentId;
    if (!id) continue;
    const date = r.evidence.reportDate ?? r.date;
    if (!date) continue;
    const existing = byDoc.get(id);
    if (!existing || (!r.evidence.reportDate && date > existing.date)) {
      byDoc.set(id, { documentId: id, documentName: r.evidence.documentName, date });
    }
  }
  return [...byDoc.values()].sort((a, b) => b.date.localeCompare(a.date) || a.documentId.localeCompare(b.documentId));
}

const source = (r: TrustedRecord, role: ChangeSource['role']): ChangeSource => ({ recordId: r.id, role, evidence: r.evidence, date: r.date });
const unitOf = (o: ObservationRecord) => o.unitNormalized ?? o.unit;

const NEW_TYPE: Partial<Record<TrustedRecord['kind'], ChangeType>> = {
  medication: 'new_medication',
  condition: 'new_condition',
  allergy: 'new_allergy',
  procedure: 'new_procedure',
  immunization: 'new_immunization',
  encounter: 'new_encounter',
};

const KIND_WORD: Record<string, string> = {
  medication: 'a medication',
  condition: 'a condition',
  allergy: 'an allergy',
  procedure: 'a procedure',
  immunization: 'a vaccination',
  encounter: 'a visit',
};

export function buildChanges(records: TrustedRecord[]): ChangesResult {
  const reports = datedReports(records);
  if (reports.length < 2) return { status: 'insufficient_data', latest: reports[0] ?? null, previous: null, changes: [] };
  const [latest, previous] = reports;
  const inLatest = records.filter((r) => r.evidence.documentId === latest.documentId);
  const earlier = records.filter((r) => r.evidence.documentId !== latest.documentId && r.date !== null && r.date < latest.date);
  const inPrevious = records.filter((r) => r.evidence.documentId === previous.documentId);
  const changes: HealthChange[] = [];

  // 1. Observations: latest value vs the most recent earlier value, same name AND unit.
  const latestObs = inLatest.filter((r): r is ObservationRecord => r.kind === 'observation' && r.valueNumeric !== null);
  const seen = new Set<string>();
  for (const cur of latestObs.sort((a, b) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id))) {
    const unit = unitOf(cur);
    const seriesKey = `${cur.key}|${(unit ?? '').toLowerCase()}`;
    if (seen.has(seriesKey)) continue;
    seen.add(seriesKey);
    const prev = earlier
      .filter((r): r is ObservationRecord => r.kind === 'observation' && r.key === cur.key && r.valueNumeric !== null && (unitOf(r) ?? '').toLowerCase() === (unit ?? '').toLowerCase())
      .sort((a, b) => b.date!.localeCompare(a.date!) || a.id.localeCompare(b.id))[0];
    if (!prev || prev.valueNumeric === cur.valueNumeric) continue;
    const verb = cur.valueNumeric! > prev.valueNumeric! ? 'increased' : 'decreased';
    changes.push({
      id: `value:${cur.id}`,
      type: 'value_change',
      name: cur.name,
      summary: `Recorded ${cur.name} ${verb} from ${withUnit(formatNumber(prev.valueNumeric!), unit)} (${formatDate(prev.date)}) to ${withUnit(formatNumber(cur.valueNumeric!), unit)} (${formatDate(cur.date)}).`,
      previousValue: formatNumber(prev.valueNumeric!),
      currentValue: formatNumber(cur.valueNumeric!),
      unit,
      date: cur.date ?? latest.date,
      comparedWithDate: prev.date,
      sources: [source(cur, 'current'), source(prev, 'previous')],
    });
  }

  // 2. Items that appear in the latest report and in no earlier record.
  const earlierKeys = new Set(earlier.map((r) => `${r.kind}|${r.key}`));
  const added = new Set<string>();
  for (const cur of inLatest.sort((a, b) => a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key) || a.id.localeCompare(b.id))) {
    const type = NEW_TYPE[cur.kind];
    const k = `${cur.kind}|${cur.key}`;
    if (!type || earlierKeys.has(k) || added.has(k)) continue;
    added.add(k);
    const detail = cur.kind === 'condition' ? ` (recorded as ${cur.assertion})` : '';
    changes.push({
      id: `new:${cur.id}`,
      type,
      name: cur.name,
      summary: `${cur.name}${detail} appears as ${KIND_WORD[cur.kind]} in the latest report (${formatDate(latest.date)}) and not in earlier records.`,
      previousValue: null,
      currentValue: null,
      unit: null,
      date: latest.date,
      comparedWithDate: null,
      sources: [source(cur, 'current')],
    });
  }

  // 3. Medications listed in the previous report but not the latest — only
  //    when both reports list medications (a lab-only report says nothing).
  const latestMeds = inLatest.filter((r) => r.kind === 'medication');
  const previousMeds = inPrevious.filter((r) => r.kind === 'medication');
  if (latestMeds.length > 0 && previousMeds.length > 0) {
    const latestKeys = new Set(latestMeds.map((r) => r.key));
    const done = new Set<string>();
    for (const prev of previousMeds.sort((a, b) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id))) {
      if (latestKeys.has(prev.key) || done.has(prev.key)) continue;
      done.add(prev.key);
      changes.push({
        id: `missing:${prev.id}`,
        type: 'medication_not_in_latest',
        name: prev.name,
        summary: `${prev.name} appears in the earlier report (${formatDate(previous.date)}) but not in the later report (${formatDate(latest.date)}).`,
        previousValue: null,
        currentValue: null,
        unit: null,
        date: latest.date,
        comparedWithDate: previous.date,
        sources: [source(prev, 'previous')],
      });
    }
  }

  const order: ChangeType[] = ['value_change', 'new_medication', 'medication_not_in_latest', 'new_condition', 'new_allergy', 'new_procedure', 'new_immunization', 'new_encounter'];
  changes.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { status: 'ok', latest, previous, changes };
}
