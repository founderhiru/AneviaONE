import type { HealthEvent } from '../../types';

export const UNDATED_LABEL = 'Date not recorded';

/** Groups timeline events by year (newest first); undated events last, never given a date. */
export function groupTimelineByYear(events: HealthEvent[]): { year: string; events: HealthEvent[] }[] {
  const dated = events.filter((e) => e.date).sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());
  const byYear = new Map<string, HealthEvent[]>();
  for (const e of dated) {
    const year = e.date!.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(e);
  }
  const groups = Array.from(byYear.entries()).map(([year, yearEvents]) => ({ year, events: yearEvents }));
  const undated = events.filter((e) => !e.date);
  return undated.length ? [...groups, { year: UNDATED_LABEL, events: undated }] : groups;
}
