/**
 * Live verification: viewing a completed report never re-reads it.
 *
 * Runs against the DEPLOYED project as the dedicated test account only, with
 * synthetic, fictional reports (values randomised per run); everything it
 * creates it deletes. Prints ids, statuses and counts only.
 *
 *   set -a; source supabase/tests/e2e/.env.e2e; set +a
 *   E2E_FORBIDDEN_EMAILS=<real addresses> deno run --config supabase/functions/deno.json \
 *     --allow-net --allow-env --allow-read supabase/tests/e2e/reread_guard_e2e.ts
 *
 * The app's view actions (open, refresh, navigate back, deep link, resume) are
 * replayed as exactly the requests the app makes for them — reads only — and
 * the server is also sent the requests an older app could send.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { buildTextPdf } from '../../functions/_shared/health-engine/tests/fixtures.ts';

const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Set ${k}`);
  return v;
};
const RUN = new Date().toISOString().slice(0, 19);
const rnd = (min: number, max: number) => min + Math.floor(Math.random() * (max - min));
const report = (line: string) => [[
  'Lakeview Family Clinic - Laboratory Report',
  'Patient: Asha Verma   DOB: 14/08/1985',
  'Report Date: 05/10/2026',
  'Test   Result   Unit   Reference Range',
  line,
]];

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!ok) failures += 1;
}

// ------------------------------------------------------------ safety guard --
const DEDICATED_TEST_EMAIL = /^[^@\s+]+\+e2e[a-z0-9]*@[^@\s]+$/i;
function refuse(reason: string): never {
  console.error(`REFUSING TO RUN: ${reason}`);
  Deno.exit(2);
}
const email = env('E2E_A_EMAIL');
if (!DEDICATED_TEST_EMAIL.test(email)) refuse('the test account must be a dedicated "+e2e" address');
const forbidden = (Deno.env.get('E2E_FORBIDDEN_EMAILS') ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
if (forbidden.includes(email.toLowerCase())) refuse('the test email is listed in E2E_FORBIDDEN_EMAILS');
const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error: authError } = await client.auth.signInWithPassword({ email, password: env('E2E_A_PASSWORD') });
if (authError || !auth.user) refuse('sign-in failed for the test account');
if ((auth.user.identities ?? []).some((i) => i.provider !== 'email')) refuse('the test account has a non-email sign-in linked');
const { data: existing } = await client.from('documents').select('original_filename');
if ((existing ?? []).some((d) => !String(d.original_filename ?? '').startsWith('E2E '))) refuse('the test account holds documents not created by the E2E suites');

// ------------------------------------------------------------------- tools --
async function upload(name: string, bytes: Uint8Array) {
  const { data: row, error } = await client
    .from('documents')
    .insert({ source: 'upload', original_filename: `E2E Reread ${name} (${RUN}).pdf`, mime_type: 'application/pdf', file_size_bytes: bytes.length })
    .select('id, storage_path')
    .single();
  if (error) throw new Error('reserve failed');
  if ((await client.storage.from('medical-documents').upload(row.storage_path, bytes, { contentType: 'application/pdf' })).error) throw new Error('upload failed');
  if ((await client.from('documents').update({ status: 'uploaded' }).eq('id', row.id)).error) throw new Error('confirm failed');
  return row.id as string;
}
// Plain fetch, so the real HTTP status is recorded (202 started, 200 nothing to do, 409 …).
const call = async (body: Record<string, unknown>) => {
  const { data: session } = await client.auth.getSession();
  const res = await fetch(`${env('SUPABASE_URL')}/functions/v1/process-document`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env('SUPABASE_ANON_KEY'), authorization: `Bearer ${session.session?.access_token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { http: res.status, status: json?.status ?? json?.error ?? null };
};
async function waitSettled(id: string, timeoutMs = 300_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data } = await client.from('documents').select('status').eq('id', id).single();
    if (data?.status === 'completed' || data?.status === 'failed') return data.status as string;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return 'timeout';
}
/** Status, run count and the exact set of live facts — never their contents. */
async function fingerprint(id: string) {
  const { data: doc } = await client.from('documents').select('status, updated_at, processing_attempts').eq('id', id).single();
  const { count: runs } = await client.from('extraction_runs').select('id', { count: 'exact', head: true }).eq('document_id', id);
  const { data: facts } = await client.from('observations').select('id, updated_at').eq('document_id', id).is('superseded_at', null).order('id');
  return JSON.stringify({ status: doc?.status, updated: doc?.updated_at, attempts: doc?.processing_attempts, runs, facts });
}

// The fixed app's requests for each view action (reads only — see
// documents/[id].tsx, useReadReport.refresh → processingService.getState,
// healthService.getDocumentObservations, autoRead → listAutoReads).
const viewReport = async (id: string) => {
  await client.from('documents').select('*').eq('id', id).maybeSingle();
  await client.from('documents').select('status, failure_kind, processing_error, processing_attempts').eq('id', id).maybeSingle();
  await client.from('extraction_runs').select('facts_written, facts_needs_review, facts_duplicate').eq('document_id', id).eq('status', 'succeeded').order('completed_at', { ascending: false }).limit(1).maybeSingle();
  await client.from('observations').select('id').eq('document_id', id).is('superseded_at', null);
};
const sweep = async () => {
  const { data } = await client.from('documents').select('id, status').in('status', ['uploaded', 'failed']);
  return data ?? [];
};

// ===================================================================== run ==
console.log('\n== Setup: a synthetic report, read once ==');
const done = await upload('Completed', buildTextPdf(report(`Serum Ferritin ${rnd(50, 99)} ng/mL 30 - 400`)));
console.log(`test document: ${done}`);
check('first read starts (202)', (await call({ document_id: done })).http === 202);
check('…and completes', (await waitSettled(done)) === 'completed');
const before = await fingerprint(done);

console.log('\n== A–E: viewing a completed report (the fixed app\'s requests) ==');
for (const [label, action] of [
  ['A. open', () => viewReport(done)],
  ['B. refresh / reload (3×)', async () => { for (let i = 0; i < 3; i++) await viewReport(done); }],
  ['C. navigate away and back', async () => { await sweep(); await viewReport(done); }],
  ['D. deep link straight to it', () => viewReport(done)],
  ['E. app resume (sweep) while it is open (3×)', async () => { for (let i = 0; i < 3; i++) { const picked = await sweep(); if (picked.some((d) => d.id === done)) throw new Error('picked'); await viewReport(done); } }],
] as const) {
  await action();
  check(`${label}: no new run, nothing changed`, (await fingerprint(done)) === before);
}
check('the sweep never even lists the completed report', !(await sweep()).some((d) => d.id === done));

console.log('\n== F: requests an older app (or any view) could send ==');
const plain = await call({ document_id: done });
check('ordinary request for a completed report → 200 completed, no claim', plain.http === 200 && plain.status === 'completed', JSON.stringify(plain));
const oldBuild = await Promise.all([1, 2, 3].map(() => call({ document_id: done, reprocess: true })));
check('older build\'s bare "reprocess": true (3× at once) → 200 completed, ignored', oldBuild.every((r) => r.http === 200 && r.status === 'completed'), JSON.stringify(oldBuild));
check('operation "read" on a completed report → 200 completed', (await call({ document_id: done, operation: 'read' })).status === 'completed');
check('an unknown operation → 400', (await call({ document_id: done, operation: 'force' })).http === 400);
await new Promise((r) => setTimeout(r, 3000));
check('G. status, run count and live facts are exactly as before', (await fingerprint(done)) === before);

console.log('\n== Legitimate processing still works ==');
const fresh = await upload('New', buildTextPdf(report(`Vitamin D ${rnd(31, 99)} ng/mL 30 - 100`)));
console.log(`test document: ${fresh}`);
const [r1, r2] = await Promise.all([call({ document_id: fresh }), call({ document_id: fresh })]);
check('a new upload is read; two simultaneous requests claim it once (202 + 409)', [r1.http, r2.http].sort().join() === '202,409', `${r1.http},${r2.http}`);
check('…and completes', (await waitSettled(fresh)) === 'completed');
const { count: freshRuns } = await client.from('extraction_runs').select('id', { count: 'exact', head: true }).eq('document_id', fresh);
check('…with exactly one run', freshRuns === 1, String(freshRuns));
const explicit = await call({ document_id: done, operation: 'reread' });
check('the explicit, confirmed re-read ("operation": "reread") still works (202)', explicit.http === 202, JSON.stringify(explicit));
check('…and completes with one new run', (await waitSettled(done)) === 'completed' && JSON.parse(await fingerprint(done)).runs === JSON.parse(before).runs + 1);

console.log('\n== Clean-up ==');
for (const id of [done, fresh]) {
  const { error } = await client.functions.invoke('delete-document', { body: { document_id: id } });
  check(`synthetic document ${id.slice(0, 8)} deleted`, !error);
}
console.log(`\nTEST DOCUMENTS (deleted): ${done},${fresh}`);
console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL LIVE RE-READ GUARD CHECKS PASSED');
Deno.exit(failures ? 1 : 0);
