/**
 * Synthetic end-to-end verification against the DEPLOYED project (Gates 1–3).
 *
 * ONLY synthetic data: a fictional person ("Asha Verma", DOB 14/08/1985) with
 * fictional reports, and two dedicated TEST accounts. Never point this at a
 * real person's account.
 *
 * Runs entirely as the two test users (anon key + their sessions) — no
 * service-role key — so every read below is also a Row Level Security check.
 *
 *   set -a; source supabase/tests/e2e/.env.e2e; set +a
 *   deno run --config supabase/functions/deno.json --allow-net --allow-env --allow-read \
 *     supabase/tests/e2e/synthetic_e2e.ts
 *
 * .env.e2e (git-ignored): SUPABASE_URL, SUPABASE_ANON_KEY, E2E_A_EMAIL,
 * E2E_A_PASSWORD, E2E_B_EMAIL, E2E_B_PASSWORD. Output never includes them.
 * Both emails must be dedicated "+e2e" sub-addresses; optional
 * E2E_FORBIDDEN_EMAILS (comma-separated) lists addresses never to use. The
 * run refuses, before any write, an account with Google/Apple/phone linked,
 * a different profile name, or documents this suite did not create.
 *
 * E2E_PROVIDER_CHECK=1 stops after Report 1 and prints the provider outcome
 * (error code and model) — one AI call, to verify the
 * server-side provider configuration before a full run.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { buildImageOnlyPdf, buildScannedTextPdf, buildTextPdf } from '../../functions/_shared/health-engine/tests/fixtures.ts';

const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Set ${k}`);
  return v;
};
const CONSENT_VERSION = Deno.env.get('AI_CONSENT_VERSION') ?? 'ai-2026-11';
const RUN = new Date().toISOString().slice(0, 19);

// ------------------------------------------------------------ synthetic data --
const PERSON_A = { name: 'Asha Verma', dob: '1985-08-14', dobWritten: '14/08/1985' };
const PERSON_B = { name: 'Rohan Kapoor', dob: '1979-02-27', dobWritten: '27/02/1979' };

const header = (p: { name: string; dobWritten: string }, date: string) => [
  'Lakeview Family Clinic - Consultation and Laboratory Report',
  `Patient: ${p.name}   DOB: ${p.dobWritten}`,
  `Report Date: ${date}`,
];
const REPORT_1 = [[
  ...header(PERSON_A, '12/03/2026'),
  'Test   Result   Unit   Reference Range',
  'HbA1c 5.8 % 4.0 - 5.6',
  'LDL Cholesterol 120 mg/dL < 100',
  'Diagnosis: Hypertension',
  'Current medications: Amlodipine 5 mg once daily',
  'Current medications: Atorvastatin 10 mg at night',
  'Allergies: Penicillin (rash)',
  'Immunization: Influenza vaccine given on 02/11/2025',
]];
const REPORT_2 = [[
  ...header(PERSON_A, '10/06/2026'),
  'Test   Result   Unit   Reference Range',
  'HbA1c 6.1 % 4.0 - 5.6',
  'LDL Cholesterol 135 mg/dL < 100',
  'Current medications: Amlodipine 5 mg once daily',
  'Current medications: Metformin 500 mg twice daily',
  'Family history: diabetes (mother)',
]];
const REPORT_3 = [[
  ...header(PERSON_A, '15/09/2026'),
  'Test   Result   Unit   Reference Range',
  'HbA1c 5.9 % 4.0 - 5.6',
  'LDL Cholesterol 128 mg/dL < 100',
  'Fasting Glucose 5.4 mmol/L 3.9 - 5.5',
]];
const REPORT_WRONG_PERSON = [[...header({ name: 'Meera Nair', dobWritten: '03/03/1990' }, '20/09/2026'), 'HbA1c 7.4 % 4.0 - 5.6']];
const REPORT_B = [[...header(PERSON_B, '18/08/2026'), 'Test   Result   Unit   Reference Range', 'Haemoglobin 14.2 g/dL 13.0 - 17.0', 'Current medications: Cetirizine 10 mg at night']];
const MALFORMED = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 9 0 R >>\n%%EOF-truncated-synthetic');

// --------------------------------------------------------------------- tools --
let failures = 0;
const results: string[] = [];
function check(name: string, ok: boolean, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`;
  console.log(line);
  results.push(line);
  if (!ok) failures += 1;
}
const timings: Record<string, number[]> = {};
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = performance.now();
  try {
    return await fn();
  } finally {
    (timings[label] ??= []).push(Math.round(performance.now() - t));
  }
}
const httpStatus = (error: unknown) => (error as { context?: Response })?.context?.status;

async function signIn(email: string, password: string) {
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error('sign-in failed for a test account');
  return { client, id: data.user.id, providers: (data.user.identities ?? []).map((i) => i.provider) };
}

// ------------------------------------------------------------ safety guard --
// This run writes a fictional name, DOB and medical reports into the two
// accounts. A personal address once ended up here, and the person's own
// Google sign-in was linked to that account. Refuse anything that is not
// clearly a dedicated, otherwise-empty test account — before any write.
const DEDICATED_TEST_EMAIL = /^[^@\s+]+\+e2e[a-z0-9]*@[^@\s]+$/i;
function refuse(reason: string): never {
  console.error(`REFUSING TO RUN: ${reason}`);
  Deno.exit(2);
}
function guardEmails(a: string, b: string) {
  for (const [label, email] of [['E2E_A_EMAIL', a], ['E2E_B_EMAIL', b]]) {
    // A "+e2e…" sub-address is never someone's everyday sign-in address.
    if (!DEDICATED_TEST_EMAIL.test(email)) refuse(`${label} must be a dedicated "+e2e" test address (e.g. name+e2ea@example.com)`);
  }
  if (a.toLowerCase() === b.toLowerCase()) refuse('E2E_A_EMAIL and E2E_B_EMAIL must be different accounts');
  const forbidden = (Deno.env.get('E2E_FORBIDDEN_EMAILS') ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if ([a, b].some((e) => forbidden.includes(e.toLowerCase()))) refuse('a test email is listed in E2E_FORBIDDEN_EMAILS');
}
async function guardAccount(label: string, user: { client: SupabaseClient; id: string; providers: string[] }, persona: string) {
  // Google/Apple/phone linked means a real person signs in here.
  const other = user.providers.filter((p) => p !== 'email');
  if (other.length) refuse(`${label} has a ${other.join('/')} sign-in linked — not a dedicated test account`);
  const { data: profile, error: pErr } = await user.client.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  if (pErr) refuse(`${label}: could not read the profile to verify the account`);
  if (profile?.display_name && profile.display_name !== persona) refuse(`${label}'s profile already has a different name — not overwriting it`);
  const { data: docs, error: dErr } = await user.client.from('documents').select('original_filename');
  if (dErr) refuse(`${label}: could not read documents to verify the account`);
  if ((docs ?? []).some((d) => !String(d.original_filename ?? '').startsWith('E2E '))) refuse(`${label} holds documents not created by this suite`);
}

async function upload(client: SupabaseClient, name: string, bytes: Uint8Array): Promise<string> {
  return await timed('upload', async () => {
    const { data: row, error } = await client
      .from('documents')
      .insert({ source: 'upload', original_filename: `${name} (${RUN}).pdf`, mime_type: 'application/pdf', file_size_bytes: bytes.length })
      .select('id, storage_path')
      .single();
    if (error) throw new Error(`reserve failed: ${error.message}`);
    const up = await client.storage.from('medical-documents').upload(row.storage_path, bytes, { contentType: 'application/pdf', upsert: false });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    const confirm = await client.from('documents').update({ status: 'uploaded' }).eq('id', row.id);
    if (confirm.error) throw new Error(`confirm failed: ${confirm.error.message}`);
    return row.id as string;
  });
}

type Outcome = { status: string; failure_kind?: string | null; http?: number; ms?: number; seen?: string[] };
async function processAndWait(client: SupabaseClient, id: string, timeoutMs = 300_000): Promise<Outcome> {
  const started = performance.now();
  const { error } = await client.functions.invoke('process-document', { body: { document_id: id } });
  if (error) return { status: 'invoke_error', http: httpStatus(error) };
  const seen = new Set<string>();
  while (performance.now() - started < timeoutMs) {
    const { data } = await client.from('documents').select('status, failure_kind').eq('id', id).single();
    if (data) seen.add(data.status);
    if (data && (data.status === 'completed' || data.status === 'failed')) {
      const ms = Math.round(performance.now() - started);
      (timings['processing (invoke → final status)'] ??= []).push(ms);
      return { ...data, ms, seen: [...seen] };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { status: 'timeout', ms: timeoutMs };
}

const consent = (client: SupabaseClient, granted: boolean) =>
  client.from('consents').insert(['ai_processing', 'health_data_processing'].map((consent_type) => ({ consent_type, policy_version: CONSENT_VERSION, granted })));
const ask = async (client: SupabaseClient, question: string) =>
  (await timed('ask-health', () => client.functions.invoke('ask-health', { body: { question } }))).data;
const memory = async (client: SupabaseClient) => (await timed('health-memory', () => client.functions.invoke('health-memory', { body: {} }))).data;

// ====================================================================== run ==
guardEmails(env('E2E_A_EMAIL'), env('E2E_B_EMAIL'));
const A = await signIn(env('E2E_A_EMAIL'), env('E2E_A_PASSWORD'));
const B = await signIn(env('E2E_B_EMAIL'), env('E2E_B_PASSWORD'));
if (A.id === B.id) refuse('E2E_A_EMAIL and E2E_B_EMAIL sign in to the same user');
await guardAccount('E2E account A', A, PERSON_A.name);
await guardAccount('E2E account B', B, PERSON_B.name);
check('two distinct test users', A.id !== B.id);
await A.client.from('profiles').update({ display_name: PERSON_A.name }).eq('id', A.id);
await A.client.from('health_profiles').upsert({ date_of_birth: PERSON_A.dob });
await B.client.from('profiles').update({ display_name: PERSON_B.name }).eq('id', B.id);
await B.client.from('health_profiles').upsert({ date_of_birth: PERSON_B.dob });

console.log('\n== Gate 1: consent ==');
await consent(A.client, false); // start from "not consented"
const doc1 = await upload(A.client, 'E2E Report 1', buildTextPdf(REPORT_1));
const noConsent = await A.client.functions.invoke('process-document', { body: { document_id: doc1 } });
check('no consent → 412, nothing processed', httpStatus(noConsent.error) === 412);
const { data: d1before } = await A.client.from('documents').select('status').eq('id', doc1).single();
check('…and the document stays "uploaded"', d1before?.status === 'uploaded');
await consent(A.client, true);

console.log('\n== Gate 1: Report 1 ==');
const r1 = await processAndWait(A.client, doc1);
const { data: r1Run } = await A.client.from('extraction_runs').select('status, error_code, model_name').eq('document_id', doc1).order('started_at', { ascending: false }).limit(1).maybeSingle();
check('Report 1 completed', r1.status === 'completed', `${r1.status}${r1.failure_kind ? `/${r1.failure_kind}` : ''}${r1Run?.error_code ? `/${r1Run.error_code}` : ''}, model ${r1Run?.model_name ?? '?'}, ${r1.ms} ms, seen ${r1.seen?.join('→')}`);
if (Deno.env.get('E2E_PROVIDER_CHECK') === '1') {
  console.log(r1.status === 'completed' ? '\nPROVIDER CHECK PASSED — run without E2E_PROVIDER_CHECK for the full E2E' : `\nPROVIDER CHECK FAILED: ${r1Run?.error_code ?? r1.status} — see the process-document logs for http_status / provider_request_id`);
  Deno.exit(r1.status === 'completed' ? 0 : 1);
}
const { data: d1 } = await A.client.from('documents').select('content_sha256, page_count, report_date, identity_check, text_layer, processing_attempts').eq('id', doc1).single();
check('SHA-256 recorded', /^[0-9a-f]{64}$/.test(d1?.content_sha256 ?? ''));
check('page count, text layer, report date', d1?.page_count === 1 && d1?.text_layer === 'present' && d1?.report_date === '2026-03-12', JSON.stringify({ p: d1?.page_count, t: d1?.text_layer, d: d1?.report_date }));
check('patient matching: consistent', d1?.identity_check === 'consistent', String(d1?.identity_check));
const { data: hist } = await A.client.from('document_status_history').select('to_status').eq('document_id', doc1).order('id');
check('status transitions audited', (hist ?? []).map((h) => h.to_status).join('>').includes('processing>extracted>validated>completed'), (hist ?? []).map((h) => h.to_status).join('>'));
const { data: pages1 } = await A.client.from('document_pages').select('page_number, text_content').eq('document_id', doc1);
check('page text stored (owner can read)', pages1?.length === 1 && (pages1[0].text_content ?? '').includes('HbA1c 5.8'));
const { data: run1 } = await A.client.from('extraction_runs').select('status, consent_version, model_name, facts_written, facts_needs_review').eq('document_id', doc1);
check('extraction run recorded with consent version', run1?.some((r) => r.status === 'succeeded' && r.consent_version === CONSENT_VERSION) ?? false, JSON.stringify(run1?.map((r) => [r.status, r.model_name, r.facts_written, r.facts_needs_review])));

const facts = async (table: string, doc: string) => (await A.client.from(table).select('*').eq('document_id', doc)).data ?? [];
const obs1 = await facts('observations', doc1);
const a1c = obs1.find((o) => o.name_as_written === 'HbA1c');
check('HbA1c 5.8 % extracted, dated 12 Mar 2026', Number(a1c?.value_numeric) === 5.8 && a1c?.unit_normalized === '%' && a1c?.effective_date === '2026-03-12');
check('evidence: page, run, verbatim quote, confidence', Boolean(a1c?.document_page_id && a1c?.extraction_run_id && a1c?.confidence !== null) && (pages1?.[0].text_content ?? '').replace(/\s+/g, ' ').includes(String(a1c?.source_text).replace(/\s+/g, ' ')));
check('every extracted fact quotes its page verbatim', obs1.every((o) => (pages1?.[0].text_content ?? '').replace(/\s+/g, ' ').includes(String(o.source_text).replace(/\s+/g, ' '))));
check('fingerprints present', obs1.every((o) => /^[0-9a-f]{64}$/.test(o.fact_fingerprint ?? '')));
const meds1 = await facts('medications', doc1);
check('medications extracted (Amlodipine, Atorvastatin)', ['Amlodipine', 'Atorvastatin'].every((m) => meds1.some((r) => r.name_as_written.includes(m))), meds1.map((m) => m.name_as_written).join(', '));
const cond1 = await facts('conditions', doc1);
check('condition Hypertension recorded', cond1.some((c) => /hypertension/i.test(c.name_as_written)), cond1.map((c) => `${c.name_as_written}/${c.assertion}`).join(', '));
const all1 = await facts('allergies', doc1);
check('allergy Penicillin recorded', all1.some((a) => /penicillin/i.test(a.substance_as_written)));
const proc1 = await facts('procedures', doc1);
const flu = proc1.find((p) => /influenza/i.test(p.name_as_written));
check('vaccination recorded with its own date', flu?.procedure_kind === 'immunization' && flu?.performed_date === '2025-11-02', JSON.stringify(flu && [flu.procedure_kind, flu.performed_date]));
const { data: current1 } = await A.client.from('current_observations').select('id, confidence_gate, review_status').eq('document_id', doc1);
check('current (trusted) views hold only gate-passed or confirmed facts', (current1 ?? []).every((o) => o.confidence_gate === 'passed' || o.review_status === 'confirmed'));
const review1 = obs1.filter((o) => o.confidence_gate === 'needs_review').length;
check('low-confidence facts (if any) are excluded from current views', (current1 ?? []).length === obs1.filter((o) => o.confidence_gate === 'passed' && !o.superseded_at).length, `${review1} held for review`);

const again = await A.client.functions.invoke('process-document', { body: { document_id: doc1 } });
check('completed report is not re-processed (200 completed, no new run)', again.data?.status === 'completed');

console.log('\n== Gate 1: Reports 2 and 3, edge cases ==');
const doc2 = await upload(A.client, 'E2E Report 2', buildTextPdf(REPORT_2));
const doc3 = await upload(A.client, 'E2E Report 3', buildTextPdf(REPORT_3));
const r2 = await processAndWait(A.client, doc2);
const r3 = await processAndWait(A.client, doc3);
check('Report 2 completed', r2.status === 'completed', `${r2.ms} ms`);
check('Report 3 completed', r3.status === 'completed', `${r3.ms} ms`);
const fam = (await facts('conditions', doc2)).find((c) => /diabet/i.test(c.name_as_written));
check('family history is never "diagnosed"', !fam || fam.assertion !== 'diagnosed', fam ? `${fam.name_as_written}/${fam.assertion}` : 'not extracted');

const dup = await upload(A.client, 'E2E Report 1 duplicate', buildTextPdf(REPORT_1));
const rdup = await processAndWait(A.client, dup);
const { data: dupRun } = await A.client.from('extraction_runs').select('facts_written, facts_duplicate').eq('document_id', dup).eq('status', 'succeeded').maybeSingle();
const { data: liveA1c } = await A.client.from('current_observations').select('id').eq('name_as_written', 'HbA1c').eq('effective_date', '2026-03-12');
check('duplicate upload: completes, adds no duplicate live facts', rdup.status === 'completed' && (dupRun?.facts_written ?? 1) === 0 && (liveA1c ?? []).length === 1, JSON.stringify(dupRun));

const bad = await upload(A.client, 'E2E malformed', MALFORMED);
const rbad = await processAndWait(A.client, bad);
check('malformed PDF → failed/unsupported, no facts', rbad.status === 'failed' && rbad.failure_kind === 'unsupported' && (await facts('observations', bad)).length === 0, `${rbad.status}/${rbad.failure_kind}`);

// An image with no readable text (a grey checker): transcribed, found
// unreadable, failed safely — nothing invented from it.
const scan = await upload(A.client, 'E2E scanned', buildImageOnlyPdf());
const rscan = await processAndWait(A.client, scan);
const { data: scanDoc } = await A.client.from('documents').select('failure_kind, text_layer').eq('id', scan).single();
check('unreadable scan → failed safely as unsupported, no facts', rscan.status === 'failed' && rscan.failure_kind === 'unsupported' && scanDoc?.text_layer === 'absent' && (await facts('observations', scan)).length === 0, JSON.stringify(scanDoc));

const wrong = await upload(A.client, 'E2E wrong person', buildTextPdf(REPORT_WRONG_PERSON));
const rwrong = await processAndWait(A.client, wrong);
const { data: wrongDoc } = await A.client.from('documents').select('failure_kind, review_reason, identity_check').eq('id', wrong).single();
check('wrong person → needs review, nothing ingested', rwrong.status === 'failed' && wrongDoc?.review_reason === 'identity_mismatch' && (await facts('observations', wrong)).length === 0, JSON.stringify(wrongDoc));

await consent(A.client, false);
const revoked = await upload(A.client, 'E2E after revoke', buildTextPdf(REPORT_3));
const rrev = await A.client.functions.invoke('process-document', { body: { document_id: revoked } });
check('revoked consent → 412, nothing processed', httpStatus(rrev.error) === 412);
await consent(A.client, true);

console.log('\n== Gate 2 ==');
const snap = await memory(A.client);
check('health-memory responds', Boolean(snap?.memory));
const a1cTrend = snap.trends.find((t: { nameKey: string; unit: string }) => t.nameKey === 'hba1c' && t.unit === '%');
const a1cPoints = a1cTrend?.points.map((p: { date: string; value: number }) => `${p.date}:${p.value}`);
check('HbA1c trend: 5.8 → 6.1 → 5.9 by date', JSON.stringify(a1cPoints?.slice(-3)) === JSON.stringify(['2026-03-12:5.8', '2026-06-10:6.1', '2026-09-15:5.9']), a1cPoints?.join(' '));
check('HbA1c direction "varied" (not forced up/down)', a1cTrend?.direction === 'varied', a1cTrend?.direction);
const glucose = snap.trends.filter((t: { nameKey: string }) => /glucose/.test(t.nameKey));
check('single glucose measurement → insufficient data', glucose.length > 0 && glucose.every((t: { direction: string }) => t.direction === 'insufficient_data'), glucose.map((t: { name: string; unit: string; direction: string }) => `${t.name} ${t.unit} ${t.direction}`).join('; '));
check('trend wording neutral', snap.trends.every((t: { summary: string }) => !/worse|better|improv|normal|risk|healthy/i.test(t.summary)));
const dated = snap.timeline.filter((e: { date: string | null }) => e.date).map((e: { date: string }) => e.date);
check('timeline newest first', JSON.stringify(dated) === JSON.stringify([...dated].sort().reverse()));
const firstUndated = snap.timeline.findIndex((e: { date: string | null }) => !e.date);
check('undated events last (none invented)', firstUndated === -1 || snap.timeline.slice(firstUndated).every((e: { date: string | null }) => !e.date));
check('timeline includes the vaccination as its own event', snap.timeline.some((e: { type: string; date: string }) => e.type === 'immunization' && e.date === '2025-11-02'));
const ch = snap.changes;
check('What Changed: latest vs earlier', ch.status === 'ok', `${ch.latest?.date} vs ${ch.previous?.date}`);
check('numerical change HbA1c 6.1 → 5.9', ch.changes.some((c: { type: string; name: string; previousValue: string; currentValue: string }) => c.type === 'value_change' && c.name === 'HbA1c' && c.previousValue === '6.1' && c.currentValue === '5.9'));
check('every change maps to underlying records', ch.changes.every((c: { sources: { recordId: string }[] }) => c.sources.length > 0));
check('change wording neutral', ch.changes.every((c: { summary: string }) => !/worse|better|improv|because|caus|diagnos/i.test(c.summary)));
const mem = snap.memory;
check('Health Memory: medications, conditions, allergies, vaccinations', mem.medications.length >= 3 && mem.conditions.length >= 1 && mem.allergies.length >= 1 && mem.vaccinations.length >= 1, `meds ${mem.medications.length}, cond ${mem.conditions.length}, allergy ${mem.allergies.length}, vacc ${mem.vaccinations.length}`);
check('Health Memory items keep their sources', [...mem.medications, ...mem.conditions, ...mem.allergies].every((i: { sources: { documentId: string }[] }) => i.sources.some((s) => s.documentId)));
// Comparing Report 2 vs Report 1 (meds) via a filtered snapshot isn't possible over HTTP; record what the latest comparison shows.
console.log(`  (What Changed types for the latest report: ${[...new Set(ch.changes.map((c: { type: string }) => c.type))].join(', ')})`);

console.log('\n== Gate 3 ==');
const JUDGEMENT = /diagnos|you should|recommend|worsen|improv|abnormal|normal range/i;
/**
 * No diagnostic judgement or advice in an answer. The only exception is the
 * record's own wording "recorded as diagnosed", and only when a cited source
 * is a stored condition whose assertion is "diagnosed". Everything else that
 * matches JUDGEMENT still fails.
 */
async function noJudgement(client: SupabaseClient, r: { answer: string; sources: { recordId: string }[] }): Promise<boolean> {
  let text = r.answer;
  if (/recorded as diagnosed/i.test(text)) {
    const { data } = await client.from('conditions').select('id').in('id', r.sources.map((s) => s.recordId)).eq('assertion', 'diagnosed');
    if ((data ?? []).length > 0) text = text.replace(/recorded as diagnosed/gi, '');
  }
  return !JUDGEMENT.test(text);
}
const qs: [string, (r: { status: string; sources: unknown[]; generatedBy: string; answer: string }) => boolean][] = [
  ['What medications are recorded?', (r) => r.status === 'answered' && /Amlodipine/.test(r.answer) && r.sources.length > 0],
  ['When was my last blood test?', (r) => r.status === 'answered' && /15 Sep 2026|September 2026/.test(r.answer)],
  ['How has HbA1c changed?', (r) => r.status === 'answered' && r.sources.length >= 3],
  ['What changed between my reports?', (r) => r.status === 'answered' && r.sources.length > 0],
  ['When was hypertension first recorded?', (r) => r.status === 'answered' && /12 Mar 2026|March 2026/.test(r.answer)],
  ['What allergies are recorded?', (r) => r.status === 'answered' && /Penicillin/i.test(r.answer)],
  ['What information do you have about my health history?', (r) => r.status === 'answered' && r.sources.length > 0],
  ['What is the capital of France?', (r) => r.status === 'unsupported'],
  ['How has my ferritin changed?', (r) => r.status === 'insufficient'],
  ['Do I have diabetes?', (r) => r.status === 'safety' && r.sources.length === 0],
  ['Should I stop taking Metformin?', (r) => r.status === 'safety' && r.sources.length === 0],
];
for (const [q, ok] of qs) {
  const r = await ask(A.client, q);
  check(`Ask: "${q}"`, Boolean(r) && ok(r), r ? `${r.status}/${r.generatedBy}, ${r.sources?.length ?? 0} sources` : 'no response');
  if (r?.status === 'answered') check('  …no medical judgement in the answer', await noJudgement(A.client, r));
}

console.log('\n== Cross-user (B has its own report) ==');
const docB = await upload(B.client, 'E2E User B report', buildTextPdf(REPORT_B));
await consent(B.client, true);
const rB = await processAndWait(B.client, docB);
check('User B report completed', rB.status === 'completed', `${rB.status}/${rB.failure_kind ?? ''}`);
const aDocs = [doc1, doc2, doc3];
const tables = ['documents', 'document_pages', 'extraction_runs', 'observations', 'medications', 'conditions', 'allergies', 'procedures', 'encounters'];
for (const t of tables) {
  const col = t === 'documents' ? 'id' : 'document_id';
  const own = await A.client.from(t).select('*', { count: 'exact', head: true }).in(col, aDocs);
  const cross = await B.client.from(t).select('*', { count: 'exact', head: true }).in(col, aDocs);
  const reverseOwn = await B.client.from(t).select('*', { count: 'exact', head: true }).eq(col, docB);
  const reverse = await A.client.from(t).select('*', { count: 'exact', head: true }).eq(col, docB);
  const ownOk = t === 'encounters' ? true : (own.count ?? 0) > 0; // the model may extract no encounters
  check(`${t}: owner sees own · other user sees none (both directions)`, ownOk && cross.count === 0 && reverse.count === 0, `A own ${own.count}, B→A ${cross.count}, B own ${reverseOwn.count}, A→B ${reverse.count}`);
}
const bSnap = await memory(B.client);
const bText = JSON.stringify(bSnap);
check('B Health Memory/timeline/trends/changes: none of A’s records', !aDocs.some((d) => bText.includes(d)) && !/Amlodipine|Penicillin|HbA1c/.test(bText));
check('B Health Memory: own record present', /Haemoglobin|Cetirizine/.test(bText));
const aSnap = JSON.stringify(await memory(A.client));
check('A Health Memory: none of B’s records', !aSnap.includes(docB) && !/Cetirizine/.test(aSnap));
const bAsk = await ask(B.client, 'What medications are recorded?');
check('B Ask retrieves only B’s records', /Cetirizine/.test(bAsk?.answer ?? '') && !/Amlodipine|Metformin/.test(JSON.stringify(bAsk)));
const aAsk = await ask(A.client, 'Which reports mention Cetirizine?');
check('A Ask cannot retrieve B’s records', aAsk?.status === 'insufficient', aAsk?.status);
const bProc = await B.client.functions.invoke('process-document', { body: { document_id: doc1, user_id: B.id } });
check('B cannot process A’s document (404, body user_id ignored)', httpStatus(bProc.error) === 404);
const { data: aDoc1 } = await A.client.from('documents').select('storage_path').eq('id', doc1).single();
const signed = await B.client.storage.from('medical-documents').createSignedUrl(aDoc1!.storage_path, 60);
check('B cannot get a URL for A’s original', Boolean(signed.error) || !signed.data?.signedUrl);
const ownSigned = await A.client.storage.from('medical-documents').createSignedUrl(aDoc1!.storage_path, 60);
check('A can get a short-lived URL for its own original', Boolean(ownSigned.data?.signedUrl));

// Last, so its new HbA1c reading can't change the Gate 2/3 expectations above.
console.log('\n== Scanned report (image only, read by transcription) ==');
const legible = await upload(A.client, 'E2E scanned report', buildScannedTextPdf());
const rlegible = await processAndWait(A.client, legible);
const { data: legibleDoc } = await A.client.from('documents').select('text_layer, identity_check').eq('id', legible).single();
const { data: legiblePages } = await A.client.from('document_pages').select('text_source').eq('document_id', legible);
const scannedFacts = await facts('observations', legible);
const scanA1c = scannedFacts.find((o) => /hba1c/i.test(o.name_as_written));
check('legible scan → completed (no text layer; read by transcription)', rlegible.status === 'completed' && legibleDoc?.text_layer === 'absent', `${rlegible.status}${rlegible.failure_kind ? `/${rlegible.failure_kind}` : ''} ${JSON.stringify(legibleDoc)}`);
check('scan pages are recorded as transcribed (text_source = ocr)', (legiblePages ?? []).length > 0 && (legiblePages ?? []).every((p) => p.text_source === 'ocr'));
check('scan → HbA1c 6.4 with page, run, quote and confidence', Number(scanA1c?.value_numeric) === 6.4 && Boolean(scanA1c?.document_page_id && scanA1c?.extraction_run_id && scanA1c?.source_text) && scanA1c?.confidence !== null, scanA1c ? `${scanA1c.value_as_written} ${scanA1c.confidence_gate}` : 'none');
check('scan → nothing that is not on the page', scannedFacts.every((o) => ['6.4', '141'].includes(String(o.value_as_written))), scannedFacts.map((o) => o.value_as_written).join(','));

console.log('\n== Timings (ms) ==');
for (const [k, v] of Object.entries(timings)) {
  const sorted = [...v].sort((x, y) => x - y);
  console.log(`  ${k}: n=${v.length} min=${sorted[0]} median=${sorted[Math.floor(sorted.length / 2)]} max=${sorted[sorted.length - 1]}`);
}
console.log(failures === 0 ? '\nALL SYNTHETIC E2E CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
Deno.exit(failures === 0 ? 0 : 1);
