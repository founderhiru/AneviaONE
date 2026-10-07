/**
 * Trends — deterministic, per observation name AND unit.
 *
 * - Only numeric, dated, trusted observations are used.
 * - Measurements in different units are NEVER combined or converted; each
 *   unit gets its own series and the others are listed.
 * - Direction is stated only when every step agrees; otherwise "varied".
 * - One measurement → insufficient data. Text is neutral and descriptive:
 *   it never says a value is good/bad, normal/abnormal or "worsening".
 */

import { formatDate, formatNumber, withUnit } from './format.ts';
import type { Evidence, ObservationRecord, TrustedRecord } from './records.ts';

export type TrendDirection = 'increased' | 'decreased' | 'unchanged' | 'varied' | 'insufficient_data';

export type TrendPoint = { date: string; value: number; recordIds: string[]; evidence: Evidence };

export type TrendSeries = {
  id: string;
  name: string;
  nameKey: string;
  unit: string | null;
  points: TrendPoint[];
  direction: TrendDirection;
  latest: TrendPoint;
  /** Neutral description of the recorded values. */
  summary: string;
  /** As printed on the latest report, if printed. Never invented. */
  referenceRange: string | null;
  /** Same test recorded in other units — shown separately, not combined. */
  otherUnits: string[];
  /** Matching measurements left out because they have no date or no numeric value. */
  excludedCount: number;
};

const unitOf = (o: ObservationRecord) => o.unitNormalized ?? o.unit;
const unitKey = (o: ObservationRecord) => (unitOf(o) ?? '').toLowerCase();

export function buildTrends(records: TrustedRecord[]): TrendSeries[] {
  const observations = records.filter((r): r is ObservationRecord => r.kind === 'observation');
  const byName = new Map<string, ObservationRecord[]>();
  for (const o of observations) byName.set(o.key, [...(byName.get(o.key) ?? []), o]);

  const series: TrendSeries[] = [];
  for (const [key, group] of byName) {
    const units = [...new Set(group.map(unitKey))].sort();
    for (const uk of units) {
      const inUnit = group.filter((o) => unitKey(o) === uk);
      const usable = inUnit.filter((o) => o.valueNumeric !== null && o.date !== null);
      if (usable.length === 0) continue;

      // Same date + same value (e.g. the same report uploaded twice) is one measurement.
      const merged = new Map<string, TrendPoint>();
      for (const o of [...usable].sort((a, b) => a.date!.localeCompare(b.date!) || a.id.localeCompare(b.id))) {
        const k = `${o.date}|${o.valueNumeric}`;
        const existing = merged.get(k);
        if (existing) existing.recordIds.push(o.id);
        else merged.set(k, { date: o.date!, value: o.valueNumeric!, recordIds: [o.id], evidence: o.evidence });
      }
      const points = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date) || a.value - b.value);
      const latestRecord = usable.filter((o) => o.date === points[points.length - 1].date).sort((a, b) => a.id.localeCompare(b.id))[0];
      const unit = unitOf(latestRecord);
      const { direction, summary } = describe(points, unit);
      series.push({
        id: `${key}|${uk}`,
        name: latestRecord.name,
        nameKey: key,
        unit,
        points,
        direction,
        latest: points[points.length - 1],
        summary,
        referenceRange: latestRecord.referenceRange,
        otherUnits: units.filter((u) => u !== uk).map((u) => group.find((o) => unitKey(o) === u)!).map((o) => unitOf(o) ?? 'no unit'),
        excludedCount: inUnit.length - usable.length,
      });
    }
  }
  return series.sort((a, b) => b.latest.date.localeCompare(a.latest.date) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function describe(points: TrendPoint[], unit: string | null): { direction: TrendDirection; summary: string } {
  const v = (n: number) => withUnit(formatNumber(n), unit);
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length < 2) {
    return { direction: 'insufficient_data', summary: `One measurement recorded (${v(last.value)} on ${formatDate(last.date)}). At least two are needed to describe a change.` };
  }
  const steps = points.slice(1).map((p, i) => p.value - points[i].value);
  const span = `across ${points.length} measurements (${formatDate(first.date)} to ${formatDate(last.date)})`;
  if (steps.every((s) => s === 0)) return { direction: 'unchanged', summary: `The recorded value was ${v(last.value)} in all ${points.length} measurements (${formatDate(first.date)} to ${formatDate(last.date)}).` };
  if (steps.every((s) => s >= 0)) return { direction: 'increased', summary: `The recorded value increased from ${v(first.value)} to ${v(last.value)} ${span}.` };
  if (steps.every((s) => s <= 0)) return { direction: 'decreased', summary: `The recorded value decreased from ${v(first.value)} to ${v(last.value)} ${span}.` };
  const values = points.map((p) => p.value);
  return {
    direction: 'varied',
    summary: `The recorded values went up and down between ${v(Math.min(...values))} and ${v(Math.max(...values))} ${span}; the latest was ${v(last.value)}.`,
  };
}
