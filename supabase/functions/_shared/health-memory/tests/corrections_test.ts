/**
 * Phase 2 · M1 — corrected and confirmed facts in Health Memory (unit level).
 *
 * After a correction, current_observations holds the person's version in
 * place of the extracted reading: origin user_corrected, no AI confidence, no
 * extraction run, no normalised unit (the server does not canonicalise a
 * typed unit), but the original report, page and quote are inherited. A
 * confirmed held result is an ordinary extracted row (it keeps its run and
 * confidence). These tests check those rows flow through trends, What
 * Changed, Timeline, the memory groups and Ask with their evidence intact.
 *
 * Which rows the views return (superseded and held facts excluded) is proven
 * against a real database in corrections_local_test.ts.
 */
import { assertEquals } from '@std/assert';

import { answerQuestion } from '../../health-ask/ask.ts';
import { createHealthMemoryHandler } from '../handler.ts';
import { loadTrustedRecords, type TrustedRecordSource } from '../records.ts';
import { buildSnapshot } from '../snapshot.ts';
import { MemorySource, USER } from './fixtures.ts';

const MAR = 'doc-mar';
const SEP = 'doc-sep';

/** What current_observations returns after: HbA1c (March) corrected 5.8 → 6.8, Vitamin D (March) confirmed as read. */
function correctedSource(): MemorySource {
  const s = new MemorySource(USER);
  s.docs.push(
    { id: MAR, user_id: USER, original_filename: 'March panel.pdf', report_date: '2026-03-12' },
    { id: SEP, user_id: USER, original_filename: 'September panel.pdf', report_date: '2026-09-20' },
  );
  s.pageRows.push({ id: `${MAR}-p1`, page_number: 1, user_id: USER }, { id: `${SEP}-p1`, page_number: 1, user_id: USER });
  const base = { user_id: USER, category: 'laboratory', reference_range_as_written: '4.0-5.6' };
  s.views.set('current_observations', [
    // The person's correction: evidence inherited, no confidence / run / normalised unit.
    { ...base, id: 'corr-hba1c-mar', name_as_written: 'HbA1c', value_as_written: '6.8', unit_as_written: '%', unit_normalized: null,
      value_numeric: 6.8, effective_date: '2026-03-12', document_id: MAR, document_page_id: `${MAR}-p1`,
      source_text: 'HbA1c 5.8 % (4.0-5.6)', confidence: null, extraction_run_id: null },
    // A later extracted reading of the same test (normalised unit present).
    { ...base, id: 'ext-hba1c-sep', name_as_written: 'HbA1c', value_as_written: '6.1', unit_as_written: '%', unit_normalized: '%',
      value_numeric: 6.1, effective_date: '2026-09-20', document_id: SEP, document_page_id: `${SEP}-p1`,
      source_text: 'HbA1c 6.1 % (4.0-5.6)', confidence: 0.95, extraction_run_id: 'run-sep' },
    // Held, then confirmed by the person as read: unchanged extracted row.
    { ...base, id: 'conf-vitd-mar', name_as_written: 'Vitamin D', value_as_written: '18', unit_as_written: 'ng/ml', unit_normalized: 'ng/mL',
      value_numeric: 18, effective_date: '2026-03-12', reference_range_as_written: '30-100', document_id: MAR, document_page_id: `${MAR}-p1`,
      source_text: 'Vitamin D 18 ng/ml (30-100)', confidence: 0.62, extraction_run_id: 'run-mar' },
    // A corrected unit typed differently from the reader's canonical spelling.
    { ...base, id: 'corr-vitd-sep', name_as_written: 'Vitamin D', value_as_written: '24', unit_as_written: 'ng/ml', unit_normalized: null,
      value_numeric: 24, effective_date: '2026-09-20', reference_range_as_written: '30-100', document_id: SEP, document_page_id: `${SEP}-p1`,
      source_text: 'Vitamin D 21 ng/ml (30-100)', confidence: null, extraction_run_id: null },
  ]);
  return s;
}

Deno.test('a correction keeps its report, page and quote as evidence; it carries no AI confidence or run', async () => {
  const records = await loadTrustedRecords(correctedSource());
  const corr = records.find((r) => r.id === 'corr-hba1c-mar')!;
  assertEquals(corr.kind === 'observation' && corr.value, '6.8');
  assertEquals(corr.evidence, {
    documentId: MAR, documentName: 'March panel.pdf', reportDate: '2026-03-12', pageNumber: 1,
    sourceText: 'HbA1c 5.8 % (4.0-5.6)', confidence: null, extractionRunId: null,
  });
  assertEquals(corr.date, '2026-03-12');
});

Deno.test('trends: the corrected value is the point for its date and joins the same series (same written unit)', async () => {
  const { trends } = buildSnapshot(await loadTrustedRecords(correctedSource()));
  const hba1c = trends.filter((t) => t.name === 'HbA1c');
  assertEquals(hba1c.length, 1);
  assertEquals(hba1c[0].points.map((p) => [p.date, p.value, p.recordIds]), [
    ['2026-03-12', 6.8, ['corr-hba1c-mar']],
    ['2026-09-20', 6.1, ['ext-hba1c-sep']],
  ]);
  assertEquals(hba1c[0].points[0].evidence.documentId, MAR);
  // "ng/ml" typed in a correction vs the reader's canonical "ng/mL": one series, not two.
  const vitd = trends.filter((t) => t.name === 'Vitamin D');
  assertEquals(vitd.length, 1);
  assertEquals(vitd[0].points.map((p) => [p.value, p.recordIds[0]]), [[18, 'conf-vitd-mar'], [24, 'corr-vitd-sep']]);
});

Deno.test('what changed: compares the corrected value, citing the correction and the later reading', async () => {
  const { changes } = buildSnapshot(await loadTrustedRecords(correctedSource()));
  const hba1c = changes.changes.find((c) => JSON.stringify(c).includes('HbA1c'));
  const text = JSON.stringify(hba1c);
  assertEquals(text.includes('6.8') && text.includes('6.1'), true);
  assertEquals(text.includes('5.8%') || text.includes('"5.8"'), false);
  assertEquals(text.includes('corr-hba1c-mar') && text.includes('ext-hba1c-sep'), true);
});

Deno.test('timeline: the corrected and the confirmed results appear under their report date', async () => {
  const { timeline } = buildSnapshot(await loadTrustedRecords(correctedSource()));
  const march = timeline.find((e) => e.date === '2026-03-12')!;
  const ids = JSON.stringify(march);
  assertEquals(ids.includes('corr-hba1c-mar') && ids.includes('conf-vitd-mar'), true);
});

Deno.test('health memory: the latest result per test is the current trusted one, with its inherited evidence', async () => {
  const { memory } = buildSnapshot(await loadTrustedRecords(correctedSource()));
  const latest = Object.fromEntries(memory.latestResults.map((r) => [r.name, r]));
  assertEquals([latest['HbA1c'].value, latest['HbA1c'].date, latest['HbA1c'].evidence.documentId], [6.1, '2026-09-20', SEP]);
  // The latest Vitamin D is the person's correction: their value, the original report/page/quote, no confidence.
  assertEquals([latest['Vitamin D'].value, latest['Vitamin D'].unit], [24, 'ng/ml']);
  assertEquals(latest['Vitamin D'].evidence, {
    documentId: SEP, documentName: 'September panel.pdf', reportDate: '2026-09-20', pageNumber: 1,
    sourceText: 'Vitamin D 21 ng/ml (30-100)', confidence: null, extractionRunId: null,
  });
  assertEquals(memory.counts, { records: 4, reports: 2 });
});

Deno.test('Ask (no AI): a trend question is answered from the corrected value, cited to its report', async () => {
  const r = await answerQuestion('How has my HbA1c changed?', {
    source: correctedSource(),
    hasAiConsent: () => Promise.resolve(false),
    model: null,
    log: { info: () => {}, error: () => {} },
  });
  assertEquals(r.answer.includes('6.8') && r.answer.includes('6.1'), true);
  assertEquals(r.answer.includes('5.8'), false);
  assertEquals(r.sources.map((s) => s.recordId).sort(), ['corr-hba1c-mar', 'ext-hba1c-sep']);
  const corrSource = r.sources.find((s) => s.recordId === 'corr-hba1c-mar')!;
  assertEquals([corrSource.documentId, corrSource.pageNumber], [MAR, 1]);
});

Deno.test('error handling: a failing record source gives 500 "unavailable" without leaking details', async () => {
  const failing: TrustedRecordSource = {
    facts: () => Promise.reject(new Error('records_query_failed:current_observations')),
    documents: () => Promise.resolve([]),
    pages: () => Promise.resolve([]),
  };
  const logs: Record<string, unknown>[] = [];
  const handler = createHealthMemoryHandler({
    authenticate: () => Promise.resolve(USER),
    sourceFor: () => failing,
    log: { info: (f) => logs.push(f), error: (f) => logs.push(f) },
  });
  const res = await handler(new Request('http://local/health-memory', { method: 'POST', headers: { authorization: 'Bearer t' }, body: '{}' }));
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: 'unavailable' });
  assertEquals(JSON.stringify(logs).includes('current_observations'), false);
});
