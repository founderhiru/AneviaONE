/**
 * Phase 2 · M1 — corrections and confirmations through Health Memory, against
 * a REAL local Supabase (migrations, current_* views, RLS, triggers, RPC).
 *
 * Runs only when pointed at a LOCAL stack — it refuses any other URL:
 *
 *   HI_LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
 *   HI_LOCAL_SUPABASE_ANON_KEY=… HI_LOCAL_SUPABASE_SERVICE_ROLE_KEY=… \
 *   deno test --allow-net --allow-env --allow-read _shared/health-memory/tests/corrections_local_test.ts
 *
 * (values from `supabase status -o env`). Without them the test is skipped.
 * Synthetic users and reports only; both users are deleted afterwards.
 *
 * Facts are written exactly as the extraction engine writes them (claim →
 * run → engine_complete_document, service role), then corrected / confirmed
 * as the person would (correct_fact RPC, review update) through their own
 * JWT. Health Memory, Trends, What Changed, Timeline and Ask then read as
 * that person through RLS.
 */
import { assert, assertEquals } from '@std/assert';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { answerQuestion } from '../../health-ask/ask.ts';
import { loadTrustedRecords, supabaseRecordSource, type ObservationRecord, type TrustedRecord } from '../records.ts';
import { buildSnapshot } from '../snapshot.ts';

const URL = Deno.env.get('HI_LOCAL_SUPABASE_URL') ?? '';
const ANON = Deno.env.get('HI_LOCAL_SUPABASE_ANON_KEY') ?? '';
const SERVICE = Deno.env.get('HI_LOCAL_SUPABASE_SERVICE_ROLE_KEY') ?? '';
const IS_LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(URL) && Boolean(ANON && SERVICE);

const fp = (c: string) => c.repeat(64);
const RUN = Math.random().toString(36).slice(2, 8);
const CONSENT = 'ai-2026-10';
const noLog = { info: () => {}, error: () => {} };

type Obs = { quote: string; conf: number; gate: 'passed' | 'needs_review'; fp: string; name: string; value: string; unit: string; range: string | null; date: string; num: number };
const obs = (o: Obs) => ({
  page_number: 1, source_text: o.quote, confidence: o.conf, confidence_gate: o.gate, fact_fingerprint: o.fp,
  name_as_written: o.name, value_as_written: o.value, unit_as_written: o.unit, reference_range_as_written: o.range,
  effective_date: o.date, category: 'laboratory', value_numeric: o.num, value_normalized: o.num, unit_normalized: o.unit,
  interpretation_version: 'it1',
});

async function signedIn(admin: SupabaseClient, label: string): Promise<{ id: string; client: SupabaseClient }> {
  const email = `m1-it-${label}-${RUN}@example.com`;
  const password = `Local-only-${RUN}-pw!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`create user ${label}: ${error?.message}`);
  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error: e2 } = await anon.auth.signInWithPassword({ email, password });
  if (e2 || !s.session) throw new Error(`sign in ${label}: ${e2?.message}`);
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${s.session.access_token}` } },
  });
  return { id: data.user.id, client };
}

/** Writes one report the way the extraction engine does (service role only). */
async function readReport(admin: SupabaseClient, user: string, name: string, sha: string, identity: string, reportDate: string, page: string, observations: Obs[]) {
  const { data: doc, error } = await admin.from('documents')
    .insert({ user_id: user, original_filename: name, mime_type: 'application/pdf', file_size_bytes: 1000, status: 'uploaded', uploaded_at: new Date().toISOString() })
    .select('id').single();
  if (error) throw new Error(`document: ${error.message}`);
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  await call('engine_claim_document', { p_document_id: doc.id, p_user_id: user });
  await call('engine_record_original', { p_document_id: doc.id, p_user_id: user, p_sha256: sha, p_page_count: 1 });
  const run = await call('engine_start_run', {
    p_document_id: doc.id, p_user_id: user, p_pipeline_version: 'g1.1', p_model_provider: 'synthetic', p_model_name: 'it', p_prompt_version: 'it', p_consent_version: CONSENT,
  });
  await call('engine_complete_document', {
    p_run_id: run, p_user_id: user,
    p_payload: { report_date: reportDate, identity_check: identity, text_layer: 'present', chunk_count: 1, facts_discarded: 0,
      pages: [{ page_number: 1, text: page }], observations: observations.map(obs) },
  });
  return doc.id as string;
}

const observations = (records: TrustedRecord[]) => records.filter((r): r is ObservationRecord => r.kind === 'observation');

Deno.test({
  name: 'local Supabase: corrected and confirmed results through Health Memory, Trends, What Changed, Timeline and Ask',
  ignore: !IS_LOCAL,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const a = await signedIn(admin, 'a');
    const b = await signedIn(admin, 'b');
    try {
      await a.client.from('consents').insert([
        { consent_type: 'ai_processing', policy_version: CONSENT, granted: true },
        { consent_type: 'health_data_processing', policy_version: CONSENT, granted: true },
      ]);

      const march = await readReport(admin, a.id, 'IT March panel.pdf', fp('1'), 'consistent', '2026-03-12',
        'HbA1c 5.8 % (4.0-5.6)  Vitamin D 18 ng/mL (30-100)  LDL Cholesterol 120 mg/dL (< 100)', [
          { quote: 'HbA1c 5.8 % (4.0-5.6)', conf: 0.95, gate: 'passed', fp: fp('a'), name: 'HbA1c', value: '5.8', unit: '%', range: '4.0-5.6', date: '2026-03-12', num: 5.8 },
          { quote: 'Vitamin D 18 ng/mL (30-100)', conf: 0.62, gate: 'needs_review', fp: fp('b'), name: 'Vitamin D', value: '18', unit: 'ng/mL', range: '30-100', date: '2026-03-12', num: 18 },
          { quote: 'LDL Cholesterol 120 mg/dL (< 100)', conf: 0.6, gate: 'needs_review', fp: fp('c'), name: 'LDL Cholesterol', value: '120', unit: 'mg/dL', range: '< 100', date: '2026-03-12', num: 120 },
        ]);
      const september = await readReport(admin, a.id, 'IT September panel.pdf', fp('2'), 'consistent', '2026-09-20',
        'HbA1c 6.1 % (4.0-5.6)', [
          { quote: 'HbA1c 6.1 % (4.0-5.6)', conf: 0.95, gate: 'passed', fp: fp('d'), name: 'HbA1c', value: '6.1', unit: '%', range: '4.0-5.6', date: '2026-09-20', num: 6.1 },
        ]);
      const unmatched = await readReport(admin, a.id, 'IT unmatched report.pdf', fp('3'), 'unverifiable', '2026-10-01',
        'Patient: A. Sharma  Haemoglobin 13.9 g/dL', [
          { quote: 'Haemoglobin 13.9 g/dL', conf: 0.97, gate: 'needs_review', fp: fp('e'), name: 'Haemoglobin', value: '13.9', unit: 'g/dL', range: null, date: '2026-10-01', num: 13.9 },
        ]);

      const idOf = async (name: string, doc: string) => {
        const { data } = await a.client.from('observations').select('id').eq('document_id', doc).eq('name_as_written', name).is('superseded_at', null).single();
        return (data as { id: string }).id;
      };
      const hba1cMarch = await idOf('HbA1c', march);
      const vitdMarch = await idOf('Vitamin D', march);
      const ldlMarch = await idOf('LDL Cholesterol', march);
      const hbUnmatched = await idOf('Haemoglobin', unmatched);

      // The person corrects HbA1c (March) and confirms Vitamin D as read.
      const { data: correctionId, error: corrErr } = await a.client.rpc('correct_fact', {
        p_table: 'observations', p_fact_id: hba1cMarch, p_fields: { value: '6.8' }, p_reason: 'Misread',
      });
      assertEquals(corrErr, null);
      const { data: confirmed, error: confErr } = await a.client.from('observations').update({ review_status: 'confirmed' }).eq('id', vitdMarch).select('id');
      assertEquals([confErr, (confirmed ?? []).length], [null, 1]);

      const records = await loadTrustedRecords(supabaseRecordSource(a.client));
      const snapshot = buildSnapshot(records);
      const obsRecords = observations(records);
      const values = obsRecords.map((r) => `${r.name} ${r.value} ${r.date}`).sort();

      await t.step('Health Memory holds the current trusted facts only', () => {
        assertEquals(values, ['HbA1c 6.1 2026-09-20', 'HbA1c 6.8 2026-03-12', 'Vitamin D 18 2026-03-12']);
        // Excluded: the superseded original (5.8), the still-held LDL, and the identity-held Haemoglobin.
        assert(!obsRecords.some((r) => r.id === hba1cMarch || r.id === ldlMarch || r.id === hbUnmatched));
      });

      await t.step('the correction keeps its source evidence; it carries no AI confidence', () => {
        const corr = obsRecords.find((r) => r.id === correctionId)!;
        assertEquals(corr.evidence.documentId, march);
        assertEquals(corr.evidence.documentName, 'IT March panel.pdf');
        assertEquals(corr.evidence.pageNumber, 1);
        assertEquals(corr.evidence.sourceText, 'HbA1c 5.8 % (4.0-5.6)');
        assertEquals([corr.evidence.confidence, corr.evidence.extractionRunId], [null, null]);
        const vitd = obsRecords.find((r) => r.id === vitdMarch)!;
        assertEquals([vitd.evidence.confidence, vitd.evidence.documentId], [0.62, march]);
      });

      await t.step('Trends: the correction is the March point; one series with September', () => {
        const hba1c = snapshot.trends.filter((s) => s.name === 'HbA1c');
        assertEquals(hba1c.length, 1);
        assertEquals(hba1c[0].points.map((p) => [p.date, p.value, p.recordIds]), [
          ['2026-03-12', 6.8, [correctionId]],
          ['2026-09-20', 6.1, [obsRecords.find((r) => r.evidence.documentId === september)!.id]],
        ]);
      });

      await t.step('What Changed and Timeline use the corrected value and cite it', () => {
        const changes = JSON.stringify(snapshot.changes);
        assert(changes.includes(correctionId as string));
        assert(!changes.includes(hba1cMarch));
        const marchEvent = JSON.stringify(snapshot.timeline.find((e) => e.date === '2026-03-12'));
        assert(marchEvent.includes(correctionId as string) && marchEvent.includes(vitdMarch));
        assert(!marchEvent.includes(ldlMarch) && !marchEvent.includes(hba1cMarch));
      });

      await t.step('Ask (no AI call) answers from the corrected value and cites its report', async () => {
        const r = await answerQuestion('How has my HbA1c changed?', {
          source: supabaseRecordSource(a.client), hasAiConsent: () => Promise.resolve(false), model: null, log: noLog,
        });
        assert(r.answer.includes('6.8') && r.answer.includes('6.1'), r.answer);
        assert(!r.answer.includes('5.8'), r.answer);
        const cited = r.sources.find((s) => s.recordId === correctionId)!;
        assertEquals([cited.documentId, cited.pageNumber], [march, 1]);
      });

      await t.step('correction history: the original is kept, superseded, and linked; the action is audited', async () => {
        const { data: rows } = await a.client.from('observations')
          .select('id, value_as_written, origin, supersedes_id, superseded_at, correction_reason, review_status')
          .eq('document_id', march).eq('name_as_written', 'HbA1c').order('created_at');
        assertEquals((rows ?? []).map((r) => [r.value_as_written, r.origin, r.superseded_at !== null, r.correction_reason]), [
          ['5.8', 'extracted', true, null],
          ['6.8', 'user_corrected', false, 'Misread'],
        ]);
        assertEquals(rows![1].supersedes_id, hba1cMarch);
        const { data: audit } = await a.client.from('audit_logs').select('action, entity_id').in('entity_id', [correctionId, hba1cMarch]);
        const actions = (audit ?? []).map((x) => x.action).sort();
        assert(actions.includes('fact.user_corrected') && actions.includes('fact.superseded'), JSON.stringify(actions));
      });

      await t.step('ownership: another person sees nothing and can change nothing', async () => {
        assertEquals((await loadTrustedRecords(supabaseRecordSource(b.client))).length, 0);
        const { data: seen } = await b.client.from('observations').select('id').in('id', [correctionId, hba1cMarch]);
        assertEquals(seen ?? [], []);
        const { error } = await b.client.rpc('correct_fact', { p_table: 'observations', p_fact_id: correctionId, p_fields: { value: '1' } });
        assertEquals(error?.code, 'P0002');
        const { data: upd } = await b.client.from('observations').update({ review_status: 'confirmed' }).eq('id', ldlMarch).select('id');
        assertEquals(upd ?? [], []);
        const { data: stillHeld } = await a.client.from('observations').select('review_status').eq('id', ldlMarch).single();
        assertEquals(stillHeld!.review_status, 'unreviewed');
      });

      await t.step('error handling: refusals are structured database errors and change nothing', async () => {
        const bad = await a.client.rpc('correct_fact', { p_table: 'observations', p_fact_id: correctionId, p_fields: { effective_date: '2999-01-01' } });
        assertEquals([bad.error?.code, bad.error?.message], ['22023', 'correct_fact: the date is not valid']);
        const again = await a.client.rpc('correct_fact', { p_table: 'observations', p_fact_id: hba1cMarch, p_fields: { value: '7.0' } });
        assertEquals(again.error?.code, '22023');
        const held = await a.client.rpc('correct_fact', { p_table: 'observations', p_fact_id: hbUnmatched, p_fields: { value: '13.4' } });
        assertEquals([held.error?.code, held.error?.message], ['22023', 'correct_fact: that report has not been confirmed as yours']);
        const heldConfirm = await a.client.from('observations').update({ review_status: 'confirmed' }).eq('id', hbUnmatched).select('id');
        assertEquals(heldConfirm.error?.code, '22023');
        const after = observations(await loadTrustedRecords(supabaseRecordSource(a.client))).map((r) => `${r.name} ${r.value}`).sort();
        assertEquals(after, ['HbA1c 6.1', 'HbA1c 6.8', 'Vitamin D 18']);
      });
    } finally {
      await admin.auth.admin.deleteUser(a.id).catch(() => {});
      await admin.auth.admin.deleteUser(b.id).catch(() => {});
    }
  },
});
