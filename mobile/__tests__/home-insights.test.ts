import { agoLabel, familyDigest, keyNumbers, rangeBarOf } from '../services/health/homeInsights';
import type { RecordedObservation } from '../types';

const obs = (o: Partial<RecordedObservation> & { id: string }): RecordedObservation => ({
  name: 'LDL Cholesterol', value: '120', unit: 'mg/dL', referenceRange: '0 - 100', date: '2026-03-10', needsReview: false,
  category: 'laboratory', valueNumeric: 120, referenceLow: 0, referenceHigh: 100,
  source: { documentId: 'd1', documentName: 'lab.pdf', pageNumber: 1 }, ...o,
});

describe('range bar', () => {
  it('puts a value above the printed band to the right of it, and a value inside it inside', () => {
    const above = rangeBarOf(obs({ id: 'a' }))!;
    expect(above.position).toBe('above');
    expect(above.marker).toBeGreaterThan(above.bandEnd);
    const inside = rangeBarOf(obs({ id: 'b', value: '80', valueNumeric: 80 }))!;
    expect(inside.position).toBe('within');
    expect(inside.marker).toBeGreaterThan(inside.bandStart);
    expect(inside.marker).toBeLessThan(inside.bandEnd);
  });
  it('reads "<130" style ranges, and refuses a value with no plain number or no printed range', () => {
    const upper = rangeBarOf(obs({ id: 'c', value: '97', valueNumeric: 97, referenceRange: 'Desirable : <130', referenceLow: null, referenceHigh: null }));
    expect(upper === null || upper.position === 'within').toBe(true); // "Desirable : <130" is not a plain range: never guessed
    expect(rangeBarOf(obs({ id: 'd', referenceRange: null, referenceLow: null, referenceHigh: null }))).toBeNull();
    expect(rangeBarOf(obs({ id: 'e', value: 'NORMAL', valueNumeric: null }))).toBeNull();
    const plain = rangeBarOf(obs({ id: 'f', value: '97', valueNumeric: 97, referenceRange: '<130', referenceLow: null, referenceHigh: null }))!;
    expect(plain.position).toBe('within');
  });
});

describe('time since', () => {
  const now = new Date('2026-08-14T00:00:00Z');
  it('says it in plain words from the result date only', () => {
    expect(agoLabel('2026-08-14', now)).toBe('today');
    expect(agoLabel('2026-08-01', now)).toBe('13 days ago');
    expect(agoLabel('2026-03-14', now)).toBe('5 months ago');
    expect(agoLabel('2024-08-14', now)).toBe('2 years ago');
  });
});

describe('key numbers and family digest', () => {
  it('lists outside-range results first, with when they were done', () => {
    const rs = [obs({ id: 'in', name: 'HDL', value: '50', valueNumeric: 50, referenceRange: '40 - 100', referenceLow: 40, referenceHigh: 100 }), obs({ id: 'out' })];
    const k = keyNumbers(rs, 4, new Date('2026-08-14T00:00:00Z'));
    expect(k.map((x) => x.id)).toEqual(['out', 'in']);
    expect(k[0].when).toContain('5 months ago');
  });
  it('counts what a family member needs at a glance', () => {
    const rs = [obs({ id: 'a' }), obs({ id: 'b', date: '2025-03-10', value: '130', valueNumeric: 130 }), obs({ id: 'c', name: 'HDL', value: '50', valueNumeric: 50, referenceLow: 40, referenceHigh: 100 })];
    const d = familyDigest(rs);
    expect(d).toMatchObject({ latestDate: '2026-03-10', outsideCount: 1, trackedCount: 1, resultCount: 3 });
  });
  it('never counts a held result', () => {
    expect(familyDigest([obs({ id: 'h', needsReview: true })])).toMatchObject({ outsideCount: 0, resultCount: 0 });
  });
});
