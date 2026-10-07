/** Gate 2 in one call: everything derived deterministically from trusted records. */
import { buildChanges, type ChangesResult } from './changes.ts';
import { buildHealthMemory, type HealthMemory } from './memory.ts';
import type { TrustedRecord } from './records.ts';
import { buildTimeline, type TimelineEvent } from './timeline.ts';
import { buildTrends, type TrendSeries } from './trends.ts';

export const HEALTH_MEMORY_VERSION = 'g2.0';

export type HealthSnapshot = {
  version: string;
  memory: HealthMemory;
  timeline: TimelineEvent[];
  trends: TrendSeries[];
  changes: ChangesResult;
};

export function buildSnapshot(records: TrustedRecord[]): HealthSnapshot {
  const trends = buildTrends(records);
  return {
    version: HEALTH_MEMORY_VERSION,
    memory: buildHealthMemory(records, trends),
    timeline: buildTimeline(records),
    trends,
    changes: buildChanges(records),
  };
}
