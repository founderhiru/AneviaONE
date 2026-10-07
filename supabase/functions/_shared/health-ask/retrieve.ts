/**
 * Minimal retrieval for one classified question, plus a deterministic,
 * record-grounded answer.
 *
 * Each retrieved unit becomes a citable item (R = record, T = trend,
 * C = change, E = timeline event) mapped to the trusted record ids and
 * evidence behind it. Only these items can be cited; the server maps every
 * citation back to them.
 *
 * Text sent to the model is minimal: names, values, units, dates and page
 * numbers — no verbatim quotes, no file names, no account data.
 */

import { buildChanges } from '../health-memory/changes.ts';
import { formatDate, withUnit } from '../health-memory/format.ts';
import { ALL_KINDS, loadTrustedRecords, type RecordKind, type TrustedRecord, type TrustedRecordSource } from '../health-memory/records.ts';
import { buildTimeline } from '../health-memory/timeline.ts';
import { buildTrends } from '../health-memory/trends.ts';
import type { Intent } from './classify.ts';

export type Source = {
  recordId: string;
  documentId: string | null;
  documentName: string | null;
  pageNumber: number | null;
  date: string | null;
  /** Verbatim quote from the report page (shown in the app, not sent to the model). */
  excerpt: string | null;
};

export type Citable = { id: string; text: string; recordIds: string[]; sources: Source[] };
export type Sentence = { text: string; citations: string[] };
export type Retrieval = { items: Citable[]; deterministic: Sentence[]; recordCount: number };

export const MAX_ITEMS = 40;

const KINDS: Record<Intent['type'], RecordKind[]> = {
  medications: ['medication'],
  medication_mentions: ['medication', 'condition', 'allergy', 'procedure', 'immunization', 'observation'],
  last_test: ['observation'],
  trend: ['observation'],
  changes: ALL_KINDS,
  condition_first: ['condition'],
  conditions: ['condition'],
  allergies: ['allergy'],
  procedures: ['procedure'],
  vaccinations: ['immunization'],
  history: ALL_KINDS,
};

const LABEL: Record<RecordKind, string> = {
  observation: 'Test result',
  condition: 'Condition',
  medication: 'Medication',
  allergy: 'Allergy',
  procedure: 'Procedure',
  immunization: 'Vaccination',
  encounter: 'Visit',
};

export function toSource(r: TrustedRecord): Source {
  return {
    recordId: r.id,
    documentId: r.evidence.documentId,
    documentName: r.evidence.documentName,
    pageNumber: r.evidence.pageNumber,
    date: r.date,
    excerpt: r.evidence.sourceText,
  };
}

function where(r: TrustedRecord): string {
  const report = r.evidence.reportDate ? `report dated ${formatDate(r.evidence.reportDate)}` : r.evidence.documentId ? 'an undated report' : 'entered by you';
  return `${report}${r.evidence.pageNumber ? `, page ${r.evidence.pageNumber}` : ''}`;
}

function describeRecord(r: TrustedRecord): string {
  const date = r.date ? formatDate(r.date) : 'date not recorded';
  switch (r.kind) {
    case 'observation':
      return `${LABEL[r.kind]}: ${r.name} ${withUnit(r.value, r.unit)}${r.referenceRange ? ` (range printed: ${r.referenceRange})` : ''}; ${date}; ${where(r)}`;
    case 'medication':
      return `${LABEL[r.kind]}: ${r.name}${r.dose ? ` ${r.dose}` : ''}${r.frequency ? ` ${r.frequency}` : ''}${r.status !== 'unknown' ? ` (${r.status.replace('_', ' ')})` : ''}; ${date}; ${where(r)}`;
    case 'condition':
      return `${LABEL[r.kind]}: ${r.name} (recorded as ${r.assertion}); ${date}; ${where(r)}`;
    case 'allergy':
      return `${LABEL[r.kind]}: ${r.name}${r.reaction ? ` (reaction: ${r.reaction})` : ''}; ${date}; ${where(r)}`;
    default:
      return `${LABEL[r.kind]}: ${r.name}; ${date}; ${where(r)}`;
  }
}

const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export async function retrieve(intent: Intent, source: TrustedRecordSource): Promise<Retrieval> {
  const term = 'term' in intent ? (intent.term ?? undefined) : undefined;
  const records = await loadTrustedRecords(source, KINDS[intent.type], { nameContains: term });
  const items: Citable[] = [];
  const deterministic: Sentence[] = [];
  const recordItem = new Map<string, string>();
  const cite = (r: TrustedRecord): string => {
    const existing = recordItem.get(r.id);
    if (existing) return existing;
    const id = `R${recordItem.size + 1}`;
    recordItem.set(r.id, id);
    items.push({ id, text: describeRecord(r), recordIds: [r.id], sources: [toSource(r)] });
    return id;
  };
  const byId = new Map(records.map((r) => [r.id, r]));
  const derived = (prefix: string, n: number, text: string, recordIds: string[]): string => {
    const id = `${prefix}${n}`;
    items.push({ id, text, recordIds, sources: recordIds.map((rid) => byId.get(rid)).filter((r): r is TrustedRecord => Boolean(r)).map(toSource) });
    return id;
  };

  if (records.length === 0) return { items, deterministic, recordCount: 0 };

  switch (intent.type) {
    case 'medications':
    case 'conditions':
    case 'allergies':
    case 'procedures':
    case 'vaccinations': {
      const groups = new Map<string, TrustedRecord[]>();
      for (const r of records) groups.set(r.key, [...(groups.get(r.key) ?? []), r]);
      const noun = { medications: 'Medications', conditions: 'Conditions', allergies: 'Allergies', procedures: 'Procedures', vaccinations: 'Vaccinations' }[intent.type];
      deterministic.push({ text: `${noun} recorded in your reports:`, citations: [] });
      for (const recs of [...groups.values()].slice(0, MAX_ITEMS)) {
        const dates = recs.map((r) => r.date).filter((d): d is string => Boolean(d)).sort();
        const latest = recs[0];
        const extra = latest.kind === 'condition' ? ` (recorded as ${latest.assertion})` : latest.kind === 'medication' && latest.dose ? ` ${latest.dose}` : '';
        const when = dates.length === 0 ? 'date not recorded' : dates[0] === dates[dates.length - 1] ? formatDate(dates[0]) : `${formatDate(dates[0])} to ${formatDate(dates[dates.length - 1])}`;
        deterministic.push({ text: `${latest.name}${extra} — ${when}.`, citations: recs.slice(0, 5).map(cite) });
      }
      break;
    }
    case 'medication_mentions': {
      const docs = new Map<string, TrustedRecord[]>();
      for (const r of records) if (r.evidence.documentId) docs.set(r.evidence.documentId, [...(docs.get(r.evidence.documentId) ?? []), r]);
      if (docs.size === 0) break;
      deterministic.push({ text: `“${intent.term}” appears in ${docs.size} report${docs.size === 1 ? '' : 's'}:`, citations: [] });
      for (const recs of [...docs.values()].slice(0, MAX_ITEMS)) {
        const r = recs[0];
        deterministic.push({ text: `${r.evidence.documentName ?? 'A report'}${r.evidence.reportDate ? ` (${formatDate(r.evidence.reportDate)})` : ''}${r.evidence.pageNumber ? `, page ${r.evidence.pageNumber}` : ''}.`, citations: recs.slice(0, 3).map(cite) });
      }
      break;
    }
    case 'last_test': {
      const dated = records.filter((r) => r.date);
      if (dated.length === 0) break;
      const latestDate = dated[0].date!;
      const latest = dated.filter((r) => r.date === latestDate).slice(0, 15);
      const doc = latest[0].evidence.documentName;
      deterministic.push({
        text: `Your most recent recorded test results are from ${formatDate(latestDate)}${doc ? ` (${doc})` : ''}: ${list(latest.map((r) => (r.kind === 'observation' ? `${r.name} ${withUnit(r.value, r.unit)}` : r.name)))}.`,
        citations: latest.map(cite),
      });
      break;
    }
    case 'trend': {
      const trends = buildTrends(records).slice(0, 5);
      trends.forEach((t, i) => {
        const recIds = t.points.flatMap((p) => p.recordIds);
        const id = derived('T', i + 1, `Trend for ${t.name}${t.unit ? ` (${t.unit})` : ''}: ${t.summary}${t.referenceRange ? ` Range printed on the latest report: ${t.referenceRange}.` : ''}`, recIds);
        deterministic.push({ text: `${t.name}: ${t.summary}`, citations: [id] });
      });
      break;
    }
    case 'changes': {
      const result = buildChanges(records);
      if (result.status !== 'ok') break;
      deterministic.push({ text: `Comparing your latest report (${formatDate(result.latest!.date)}) with earlier records:`, citations: [] });
      if (result.changes.length === 0) deterministic.push({ text: 'No differences were found in the recorded items that can be compared.', citations: [] });
      result.changes.slice(0, MAX_ITEMS).forEach((c, i) => {
        const id = derived('C', i + 1, `Change: ${c.summary}`, c.sources.map((s) => s.recordId));
        deterministic.push({ text: c.summary, citations: [id] });
      });
      break;
    }
    case 'condition_first': {
      const groups = new Map<string, TrustedRecord[]>();
      for (const r of records) groups.set(r.key, [...(groups.get(r.key) ?? []), r]);
      for (const recs of [...groups.values()].slice(0, 10)) {
        const dated = recs.filter((r) => r.date).sort((a, b) => a.date!.localeCompare(b.date!) || a.id.localeCompare(b.id));
        const first = dated[0];
        if (!first || first.kind !== 'condition') {
          deterministic.push({ text: `${recs[0].name} is recorded, but its first date isn’t recorded.`, citations: [cite(recs[0])] });
          continue;
        }
        deterministic.push({
          text: `${first.name} was first recorded on ${formatDate(first.date)} (recorded as ${first.assertion}${first.evidence.documentName ? `, ${first.evidence.documentName}` : ''}${first.evidence.pageNumber ? `, page ${first.evidence.pageNumber}` : ''}).`,
          citations: [cite(first)],
        });
      }
      break;
    }
    case 'history': {
      const events = buildTimeline(records).filter((e) => e.date).slice(0, 8);
      if (events.length === 0) break;
      deterministic.push({ text: 'Your most recent recorded health history:', citations: [] });
      events.forEach((e, i) => {
        const id = derived('E', i + 1, `Timeline event: ${formatDate(e.date)} — ${e.type === 'report' ? 'report' : e.title} (${e.summary})`, e.recordIds.slice(0, 20));
        deterministic.push({ text: `${formatDate(e.date)} — ${e.title}: ${e.summary}.`, citations: [id] });
      });
      break;
    }
  }
  return { items: items.slice(0, MAX_ITEMS * 2), deterministic, recordCount: records.length };
}
