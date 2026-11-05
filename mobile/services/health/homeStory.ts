import type { RecordedObservation } from '../../types';
import { resultPosition, trustedResults } from './homeDashboard';
import { resultGroup, type ResultGroup } from './whatChanged';

/**
 * "Your health story" for Home when there is nothing to chart yet (no test
 * appears on two dates, or the reports are narrative: imaging, summaries).
 * Everything is read from the person's own trusted results: the newest
 * report with a few of its results as written, a strip of the reports by
 * date, and the mix of kinds. Nothing is interpreted or scored.
 */

export type StoryHighlight = { id: string; name: string; value: string; outside: 'above' | 'below' | null };
export type StoryReport = { documentId: string; title: string; date: string | null; group: ResultGroup; count: number };
export type HealthStory = {
  latest: (StoryReport & { highlights: StoryHighlight[] }) | null;
  /** Oldest to newest; reports with no clear date come last. */
  strip: StoryReport[];
  mix: Record<ResultGroup, number>;
  total: number;
};

const MAX_HIGHLIGHTS = 3;

export function buildHealthStory(results: RecordedObservation[], names: Map<string, string>): HealthStory {
  const trusted = trustedResults(results);
  const byDoc = new Map<string, RecordedObservation[]>();
  for (const r of trusted) byDoc.set(r.source.documentId, [...(byDoc.get(r.source.documentId) ?? []), r]);

  const reports: StoryReport[] = [...byDoc.entries()].map(([documentId, rs]) => {
    const tally: Record<ResultGroup, number> = { lab: 0, imaging: 0, other: 0 };
    for (const r of rs) tally[resultGroup(r)] += 1;
    const group = (['lab', 'imaging', 'other'] as const).reduce((a, g) => (tally[g] > tally[a] ? g : a), 'other' as ResultGroup);
    const dates = rs.map((r) => r.date).filter((d): d is string => Boolean(d)).sort();
    return { documentId, title: names.get(documentId) ?? rs[0].source.documentName, date: dates.length ? dates[dates.length - 1] : null, group, count: rs.length };
  });

  const asc = (a: StoryReport, b: StoryReport) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0);
  const strip = [...reports].sort(asc);
  const dated = strip.filter((r) => r.date);
  const newest = dated.length ? dated[dated.length - 1] : strip[strip.length - 1] ?? null;

  let latest: HealthStory['latest'] = null;
  if (newest) {
    const rank = (r: RecordedObservation) => (resultPosition(r) === 'above' || resultPosition(r) === 'below' ? 0 : 1);
    const picked = [...(byDoc.get(newest.documentId) ?? [])].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_HIGHLIGHTS);
    latest = {
      ...newest,
      highlights: picked.map((r) => {
        const p = resultPosition(r);
        return { id: r.id, name: r.name, value: [r.value, r.unit].filter(Boolean).join(' '), outside: p === 'above' || p === 'below' ? p : null };
      }),
    };
  }

  const mix: Record<ResultGroup, number> = { lab: 0, imaging: 0, other: 0 };
  for (const r of trusted) mix[resultGroup(r)] += 1;
  return { latest, strip, mix, total: trusted.length };
}
