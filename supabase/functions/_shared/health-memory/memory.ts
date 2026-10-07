/**
 * Health Memory — the person's trusted records grouped by kind. Items with
 * the same name are grouped (case/punctuation-insensitive, no synonym
 * guessing) and keep every source record, so each can be traced to its
 * report and page.
 */

import type { AllergyRecord, ConditionRecord, Evidence, MedicationRecord, TrustedRecord } from './records.ts';
import type { TrendSeries } from './trends.ts';

export type MemoryItem = {
  key: string;
  name: string;
  /** Details from the most recent record, as written. */
  detail: string | null;
  firstRecorded: string | null;
  lastRecorded: string | null;
  recordIds: string[];
  sources: Evidence[];
};

export type HealthMemory = {
  conditions: MemoryItem[];
  medications: MemoryItem[];
  allergies: MemoryItem[];
  procedures: MemoryItem[];
  vaccinations: MemoryItem[];
  encounters: MemoryItem[];
  /** Latest value of each test (per unit), linked to its trend. */
  latestResults: { seriesId: string; name: string; value: number; unit: string | null; date: string; referenceRange: string | null; evidence: Evidence }[];
  counts: { records: number; reports: number };
};

function detailOf(r: TrustedRecord): string | null {
  switch (r.kind) {
    case 'condition':
      return `Recorded as ${(r as ConditionRecord).assertion}`;
    case 'medication': {
      const m = r as MedicationRecord;
      return [m.dose, m.frequency, m.status !== 'unknown' ? m.status.replace('_', ' ') : null].filter(Boolean).join(' · ') || null;
    }
    case 'allergy':
      return (r as AllergyRecord).reaction;
    case 'encounter':
      return [r.provider, r.facility].filter(Boolean).join(' · ') || null;
    default:
      return null;
  }
}

function group(records: TrustedRecord[]): MemoryItem[] {
  const byKey = new Map<string, TrustedRecord[]>();
  for (const r of records) byKey.set(r.key || r.id, [...(byKey.get(r.key || r.id) ?? []), r]);
  const items = [...byKey.entries()].map(([key, recs]) => {
    const dated = recs.filter((r) => r.date).map((r) => r.date!).sort();
    const latest = [...recs].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id))[0];
    return {
      key,
      name: latest.name,
      detail: detailOf(latest),
      firstRecorded: dated[0] ?? null,
      lastRecorded: dated[dated.length - 1] ?? null,
      recordIds: recs.map((r) => r.id).sort(),
      sources: recs.map((r) => r.evidence),
    };
  });
  return items.sort((a, b) => (b.lastRecorded ?? '').localeCompare(a.lastRecorded ?? '') || a.name.localeCompare(b.name));
}

export function buildHealthMemory(records: TrustedRecord[], trends: TrendSeries[]): HealthMemory {
  const of = (kind: TrustedRecord['kind']) => records.filter((r) => r.kind === kind);
  return {
    conditions: group(of('condition')),
    medications: group(of('medication')),
    allergies: group(of('allergy')),
    procedures: group(of('procedure')),
    vaccinations: group(of('immunization')),
    encounters: group(of('encounter')),
    latestResults: trends.map((t) => ({
      seriesId: t.id,
      name: t.name,
      value: t.latest.value,
      unit: t.unit,
      date: t.latest.date,
      referenceRange: t.referenceRange,
      evidence: t.latest.evidence,
    })),
    counts: { records: records.length, reports: new Set(records.map((r) => r.evidence.documentId).filter(Boolean)).size },
  };
}
