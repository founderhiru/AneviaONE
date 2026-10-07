import { assertEquals } from '@std/assert';

import { buildChanges } from '../changes.ts';
import { createHealthMemoryHandler } from '../handler.ts';
import { buildHealthMemory } from '../memory.ts';
import { loadTrustedRecords, type TrustedRecord } from '../records.ts';
import { buildTimeline } from '../timeline.ts';
import { buildTrends, describe } from '../trends.ts';
import { DOCS, MemorySource, OTHER, USER } from './fixtures.ts';

const load = (user = USER) => loadTrustedRecords(MemorySource.seeded(user));
const silent = { info() {}, error() {} };

Deno.test('loading: only the caller’s records, with document, report date and page', async () => {
  const records = await load();
  assertEquals(records.some((r) => r.evidence.documentId === DOCS.X), false);
  assertEquals(records.some((r) => r.name === 'Insulin'), false);
  const a1c = records.find((r) => r.kind === 'observation' && r.evidence.documentId === DOCS.A && r.name === 'HbA1c')!;
  assertEquals([a1c.date, a1c.dateSource, a1c.evidence.documentName, a1c.evidence.pageNumber], ['2026-03-12', 'report', 'Report A.pdf', 1]);
  const vitD = records.find((r) => r.name === 'Vitamin D')!;
  assertEquals([vitD.date, vitD.dateSource], [null, null]); // never invented
  // The other person sees only theirs.
  assertEquals((await load(OTHER)).map((r) => r.name).sort(), ['HbA1c', 'Insulin']);
});

Deno.test('trends: grouped by name AND unit, ordered by date, neutral wording', async () => {
  const trends = buildTrends(await load());
  const a1c = trends.find((t) => t.nameKey === 'hba1c')!;
  assertEquals(a1c.points.map((p) => [p.date, p.value]), [['2026-03-12', 5.8], ['2026-06-10', 6.1], ['2026-09-15', 5.9]]);
  assertEquals(a1c.direction, 'varied');
  assertEquals(a1c.summary, 'The recorded values went up and down between 5.8% and 6.1% across 3 measurements (12 Mar 2026 to 15 Sep 2026); the latest was 5.9%.');
  assertEquals(a1c.referenceRange, '4.0 - 5.6'); // as printed, never invented
  const glucose = trends.filter((t) => t.nameKey === 'glucose');
  assertEquals(glucose.map((t) => [t.unit, t.points.length, t.direction, t.otherUnits]), [
    ['mmol/L', 1, 'insufficient_data', ['mg/dL']], // newest series first
    ['mg/dL', 1, 'insufficient_data', ['mmol/L']],
  ]);
  assertEquals(trends.some((t) => t.nameKey === 'vitamind'), false); // undated → not plotted
  for (const t of trends) assertEquals(/worse|better|improv|normal|abnormal|risk|diagnos/i.test(t.summary), false, t.summary);
});

Deno.test('trends: direction only when every step agrees; duplicates merged', () => {
  const p = (date: string, value: number) => ({ date, value, recordIds: [date], evidence: {} as never });
  assertEquals(describe([p('2026-01-01', 1), p('2026-02-01', 2), p('2026-03-01', 2)], 'mg/dL').direction, 'increased');
  assertEquals(describe([p('2026-01-01', 3), p('2026-02-01', 2)], 'mg/dL').summary, 'The recorded value decreased from 3 mg/dL to 2 mg/dL across 2 measurements (1 Jan 2026 to 1 Feb 2026).');
  assertEquals(describe([p('2026-01-01', 2), p('2026-02-01', 2)], null).direction, 'unchanged');
  assertEquals(describe([p('2026-01-01', 2)], null).direction, 'insufficient_data');

  const rec = (id: string, doc: string, date: string, v: number): TrustedRecord => ({
    id, kind: 'observation', name: 'HbA1c', key: 'hba1c', date, dateSource: 'report', value: String(v), unit: '%', valueNumeric: v, unitNormalized: '%', referenceRange: null,
    evidence: { documentId: doc, documentName: doc, reportDate: date, pageNumber: 1, sourceText: null, confidence: 1, extractionRunId: null },
  });
  const [t] = buildTrends([rec('x1', 'd1', '2026-01-01', 6), rec('x2', 'd2', '2026-01-01', 6), rec('x3', 'd3', '2026-02-01', 7)]);
  assertEquals(t.points.map((pt) => pt.recordIds), [['x1', 'x2'], ['x3']]);
  assertEquals(t.direction, 'increased');
});

Deno.test('timeline: report events by date, own-dated vaccination separate, undated last', async () => {
  const timeline = buildTimeline(await load());
  assertEquals(timeline.map((e) => [e.type, e.date, e.title]), [
    ['report', '2026-09-15', 'Report C.pdf'],
    ['report', '2026-06-10', 'Report B.pdf'],
    ['report', '2026-03-12', 'Report A.pdf'],
    ['immunization', '2025-11-02', 'Influenza vaccine'],
    ['report', null, 'Undated note.pdf'],
  ]);
  assertEquals(timeline[0].summary, '3 test results · 2 medications · 1 allergy · 1 procedure');
  for (const e of timeline) assertEquals(e.recordIds.length > 0 && e.evidence.length > 0, true);
});

Deno.test('what changed: latest report vs earlier records, every change cites records', async () => {
  const result = buildChanges(await load());
  assertEquals([result.latest?.documentId, result.previous?.documentId], [DOCS.C, DOCS.B]);
  assertEquals(result.changes.map((c) => c.summary), [
    'Recorded HbA1c decreased from 6.1% (10 Jun 2026) to 5.9% (15 Sep 2026).',
    'Recorded LDL Cholesterol decreased from 135 mg/dL (10 Jun 2026) to 128 mg/dL (15 Sep 2026).',
    'Telmisartan appears as a medication in the latest report (15 Sep 2026) and not in earlier records.',
    'Atorvastatin appears in the earlier report (10 Jun 2026) but not in the later report (15 Sep 2026).',
    'Penicillin appears as an allergy in the latest report (15 Sep 2026) and not in earlier records.',
    'Cataract surgery appears as a procedure in the latest report (15 Sep 2026) and not in earlier records.',
    'Influenza vaccine appears as a vaccination in the latest report (15 Sep 2026) and not in earlier records.',
  ]);
  // Glucose changed unit (mg/dL → mmol/L): not compared.
  assertEquals(result.changes.some((c) => c.name === 'Glucose'), false);
  // Metformin is in both B and C: not reported as new.
  assertEquals(result.changes.some((c) => c.name === 'Metformin'), false);
  for (const c of result.changes) {
    assertEquals(c.sources.length > 0, true);
    assertEquals(/worse|better|improv|because|caus|diagnos|treat/i.test(c.summary), false, c.summary);
  }
  const a1c = result.changes[0];
  assertEquals(a1c.sources.map((s) => [s.role, s.evidence.documentId]), [['current', DOCS.C], ['previous', DOCS.B]]);
});

Deno.test('what changed: a lab-only latest report does not make medications "disappear"; new condition keeps its assertion', async () => {
  const records = (await load()).filter((r) => !(r.evidence.documentId === DOCS.C && r.kind === 'medication'));
  const result = buildChanges(records);
  assertEquals(result.changes.some((c) => c.type === 'medication_not_in_latest'), false);
  const onlyAB = (await load()).filter((r) => r.evidence.documentId === DOCS.A || r.evidence.documentId === DOCS.B);
  const ab = buildChanges(onlyAB);
  assertEquals(ab.changes.find((c) => c.type === 'new_condition')!.summary, 'Hypertension (recorded as diagnosed) appears as a condition in the latest report (10 Jun 2026) and not in earlier records.');
});

Deno.test('what changed / trends: insufficient data and an empty account', async () => {
  const onlyA = (await load()).filter((r) => r.evidence.documentId === DOCS.A);
  assertEquals(buildChanges(onlyA).status, 'insufficient_data');
  assertEquals(buildChanges([]), { status: 'insufficient_data', latest: null, previous: null, changes: [] });
  assertEquals(buildTrends([]), []);
  assertEquals(buildTimeline([]), []);
  assertEquals(buildHealthMemory([], []).counts, { records: 0, reports: 0 });
});

Deno.test('health memory: grouped by kind, family history kept as "mentioned", sources retained', async () => {
  const records = await load();
  const memory = buildHealthMemory(records, buildTrends(records));
  assertEquals(memory.conditions.map((c) => [c.name, c.detail]), [['Hypertension', 'Recorded as diagnosed'], ['Diabetes', 'Recorded as mentioned']]);
  const metformin = memory.medications.find((m) => m.name === 'Metformin')!;
  assertEquals([metformin.firstRecorded, metformin.lastRecorded, metformin.sources.length], ['2026-06-10', '2026-09-15', 2]);
  assertEquals(memory.vaccinations.map((v) => v.name), ['Influenza vaccine']);
  assertEquals(memory.procedures.map((v) => v.name), ['Cataract surgery']);
  assertEquals(memory.allergies.map((a) => [a.name, a.detail]), [['Penicillin', 'rash']]);
  assertEquals(memory.counts, { records: records.length, reports: 4 });
});

Deno.test('handler: 401 without a JWT; reads only as the caller', async () => {
  const handler = createHealthMemoryHandler({
    authenticate: (jwt) => Promise.resolve(jwt === 'jwt-user' ? USER : jwt === 'jwt-other' ? OTHER : null),
    sourceFor: (jwt) => MemorySource.seeded(jwt === 'jwt-user' ? USER : OTHER),
    log: silent,
  });
  const call = (token?: string) => handler(new Request('http://x', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} }));
  assertEquals((await call()).status, 401);
  assertEquals((await call('forged')).status, 401);
  const other = await (await call('jwt-other')).json();
  assertEquals(other.memory.medications.map((m: { name: string }) => m.name), ['Insulin']);
  const mine = await (await call('jwt-user')).json();
  assertEquals(JSON.stringify(mine).includes('Insulin'), false);
});
