/**
 * Phase B live verification: delete-document against the DEPLOYED project.
 *
 * ONLY the two dedicated test accounts and synthetic, fictional reports
 * (values randomised per run). Never point this at a real person's account.
 * Runs as the test users (anon key + their sessions) — no service-role key —
 * so every read is also a Row Level Security check. Everything it creates,
 * it deletes.
 *
 *   set -a; source supabase/tests/e2e/.env.e2e; set +a
 *   E2E_FORBIDDEN_EMAILS=<real addresses> deno run --config supabase/functions/deno.json \
 *     --allow-net --allow-env --allow-read supabase/tests/e2e/deletion_e2e.ts
 *
 * Prints ids, statuses and counts only — never credentials, report text or values.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { buildTextPdf } from '../../functions/_shared/health-engine/tests/fixtures.ts';

const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Set ${k}`);
  return v;
};
const RUN = new Date().toISOString().slice(0, 19);
const PERSON_A = { name: 'Asha Verma', dobWritten: '14/08/1985' };

// Fictional values, different every run, so no fact can match an earlier run's.
const rnd = (min: number, max: number) => min + Math.floor(Math.random() * (max - min));
const SHARED = `Serum Ferritin ${rnd(50, 99)} ng/mL 30 - 400`;
const ONLY_1 = `Vitamin B12 ${rnd(300, 899)} pg/mL 200 - 900`;
const ONLY_2 = `Vitamin D ${rnd(31, 99)} ng/mL 30 - 100`;
const report = (lines: string[]) => [[
  'Lakeview Family Clinic - Laboratory Report',
  `Patient: ${PERSON_A.name}   DOB: ${PERSON_A.dobWritten}`,
  'Report Date: 05/10/2026',
  'Test   Result   Unit   Reference Range',
  ...lines,
]];

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!ok) failures += 1;
}
const httpStatus = (error: unknown) => (error as { context?: Response })?.context?.status;
const errorCode = async (error: unknown) => {
  const r = (error as { context?: Response })?.context;
  return r ? (await r.clone().json().catch(() => null))?.error : null;
};

// ------------------------------------------------------------ safety guard --
const DEDICATED_TEST_EMAIL = /^[^@\s+]+\+e2e[a-z0-9]*@[^@\s]+$/i;
function refuse(reason: string): never {
  console.error(`REFUSING TO RUN: ${reason}`);
  Deno.exit(2);
}
const emailA = env('E2E_A_EMAIL');
const emailB = env('E2E_B_EMAIL');
for (const e of [emailA, emailB]) if (!DEDICATED_TEST_EMAIL.test(e)) refuse('test accounts must be dedicated "+e2e" addresses');
const forbidden = (Deno.env.get('E2E_FORBIDDEN_EMAILS') ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
if ([emailA, emailB].some((e) => forbidden.includes(e.toLowerCase()))) refuse('a test email is listed in E2E_FORBIDDEN_EMAILS');

async function signIn(email: string, password: string) {
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) refuse('sign-in failed for a test account');
  return { client, id: data.user.id, providers: (data.user.identities ?? []).map((i) => i.provider) };
}
const A = await signIn(emailA, env('E2E_A_PASSWORD'));
const B = await signIn(emailB, env('E2E_B_PASSWORD'));
if (A.id === B.id) refuse('both test emails sign in to the same user');
for (const [label, u] of [['A', A], ['B', B]] as const) {
  if (u.providers.some((p) => p !== 'email')) refuse(`test account ${label} has a non-email sign-in linked`);
  const { data: docs, error } = await u.client.from('documents').select('original_filename');
  if (error) refuse(`test account ${label}: could not read documents`);
  if ((docs ?? []).some((d) => !String(d.original_filename ?? '').startsWith('E2E '))) refuse(`test account ${label} holds documents not created by the E2E suites`);
}

// ------------------------------------------------------------------- tools --
async function upload(client: SupabaseClient, name: string, bytes: Uint8Array) {
  const { data: row, error } = await client
    .from('documents')
    .insert({ source: 'upload', original_filename: `E2E Delete ${name} (${RUN}).pdf`, mime_type: 'application/pdf', file_size_bytes: bytes.length })
    .select('id, storage_path')
    .single();
  if (error) throw new Error('reserve failed');
  const up = await client.storage.from('medical-documents').upload(row.storage_path, bytes, { contentType: 'application/pdf', upsert: false });
  if (up.error) throw new Error('upload failed');
  const confirm = await client.from('documents').update({ status: 'uploaded' }).eq('id', row.id);
  if (confirm.error) throw new Error('confirm failed');
  return { id: row.id as string, path: row.storage_path as string };
}
async function waitForRead(client: SupabaseClient, id: string, timeoutMs = 300_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data } = await client.from('documents').select('status').eq('id', id).single();
    if (data?.status === 'completed' || data?.status === 'failed') return data.status as string;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return 'timeout';
}
async function read(client: SupabaseClient, id: string) {
  const { error } = await client.functions.invoke('process-document', { body: { document_id: id } });
  if (error && httpStatus(error) === 412) {
    const version = env('AI_CONSENT_VERSION');
    await client.from('consents').insert(['ai_processing', 'health_data_processing'].map((consent_type) => ({ consent_type, policy_version: version, granted: true })));
    const retry = await client.functions.invoke('process-document', { body: { document_id: id } });
    if (retry.error) return `invoke_${httpStatus(retry.error)}`;
  } else if (error) return `invoke_${httpStatus(error)}`;
  return await waitForRead(client, id);
}
const del = async (client: SupabaseClient, id: string) => {
  const { data, error } = await client.functions.invoke('delete-document', { body: { document_id: id } });
  return { http: error ? httpStatus(error) : 200, code: error ? await errorCode(error) : null, status: data?.status ?? null };
};
// Asks the Storage API (a download can be answered from a cache for a short while after deletion).
const stored = async (client: SupabaseClient, path: string) => !(await client.storage.from('medical-documents').createSignedUrl(path, 30)).error;
const liveObs = async (client: SupabaseClient, name: string) =>
  (await client.from('current_observations').select('id, document_id').ilike('name_as_written', `%${name}%`)).data ?? [];

// ===================================================================== run ==
const { count: baselineDocs } = await A.client.from('documents').select('id', { count: 'exact', head: true });
const { count: bBaselineDocs } = await B.client.from('documents').select('id', { count: 'exact', head: true });

// A fact's fingerprint includes the original file's SHA-256: the SAME file
// uploaded twice yields duplicates (the second upload becomes an additional
// source); a DIFFERENT file reporting the same value keeps its own fact row.
console.log('\n== Setup: one synthetic report uploaded twice, plus a different report ==');
const bytes1 = buildTextPdf(report([SHARED, ONLY_1]));
const doc1 = await upload(A.client, 'Report 1', bytes1);
const doc2 = await upload(A.client, 'Report 1 again', bytes1);
const docOther = await upload(A.client, 'Other report', buildTextPdf(report([SHARED, ONLY_2])));
console.log(`test documents: ${doc1.id}, ${doc2.id}, ${docOther.id}`);
check('report 1 read', (await read(A.client, doc1.id)) === 'completed');
check('the same file uploaded again read', (await read(A.client, doc2.id)) === 'completed');
check('a different report read', (await read(A.client, docOther.id)) === 'completed');
const { data: doc1Facts } = await A.client.from('observations').select('id').eq('document_id', doc1.id).is('superseded_at', null);
const { data: run2 } = await A.client.from('extraction_runs').select('facts_written, facts_duplicate').eq('document_id', doc2.id).eq('status', 'succeeded').maybeSingle();
const n1 = (doc1Facts ?? []).length;
check('the identical upload stores no second copy of any fact', n1 > 0 && run2?.facts_written === 0 && run2?.facts_duplicate === n1, `${n1} facts; second upload ${JSON.stringify(run2)}`);
const { data: sources } = await A.client.from('fact_sources').select('fact_table, fact_id, document_id');
check('…and is recorded as an additional source of each of them',
  (sources ?? []).length === n1 && (sources ?? []).every((s) => s.document_id === doc2.id && (doc1Facts ?? []).some((f) => f.id === s.fact_id)));
const ferritinRows = await liveObs(A.client, 'Ferritin');
check('the different report keeps its own fact row for the same value', ferritinRows.length === 2 && ferritinRows.some((r) => r.document_id === docOther.id));
const ferritin = ferritinRows.find((r) => r.document_id === doc1.id);
check('the owner can see the stored original before deletion', await stored(A.client, doc1.path));

console.log('\n== Cross-user ==');
const { data: bSees } = await B.client.from('documents').select('id').eq('id', doc1.id);
check('B cannot see A\'s document', (bSees ?? []).length === 0);
const byB = await del(B.client, doc1.id);
check('B cannot delete A\'s document (404 not_found)', byB.http === 404 && byB.code === 'not_found', JSON.stringify(byB));
const { data: stillThere } = await A.client.from('documents').select('status').eq('id', doc1.id).single();
check('…A\'s document, original and facts are untouched', stillThere?.status === 'completed' && (await stored(A.client, doc1.path)) && (await liveObs(A.client, 'B12')).length === 1);
const anon = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
const byAnon = await anon.functions.invoke('delete-document', { body: { document_id: doc1.id } });
check('a caller without a session is refused', [401, 403].includes(httpStatus(byAnon.error) ?? 0), String(httpStatus(byAnon.error)));

console.log('\n== A deletes report 1 (the shared fact\'s primary source) ==');
const d1 = await del(A.client, doc1.id);
check('delete-document → 200 deleted', d1.http === 200 && d1.status === 'deleted', JSON.stringify(d1));
check('report 1 is gone from the owner\'s documents', ((await A.client.from('documents').select('id').eq('id', doc1.id)).data ?? []).length === 0);
check('its stored original is gone from Storage', !(await stored(A.client, doc1.path)));
const { data: folder } = await A.client.storage.from('medical-documents').list(`${A.id}/documents/${doc1.id}`);
check('…and its Storage folder is empty', (folder ?? []).length === 0);
for (const t of ['document_pages', 'extraction_runs', 'observations', 'document_status_history']) {
  const { data } = await A.client.from(t).select('id').eq('document_id', doc1.id);
  check(`no ${t} rows remain for report 1`, (data ?? []).length === 0);
}
const { data: keptFacts } = await A.client.from('observations').select('id, document_id, source_text, document_page_id').eq('document_id', doc2.id).is('superseded_at', null);
check('every fact report 1 shared with its re-upload survives, now evidenced by the re-upload',
  (keptFacts ?? []).length === n1 && (keptFacts ?? []).every((f) => f.source_text && f.document_page_id), `${(keptFacts ?? []).length} of ${n1}`);
check('…they are current Health Memory facts again under the re-upload',
  (await liveObs(A.client, 'B12')).length === 1 && (await liveObs(A.client, 'B12'))[0].document_id === doc2.id);
check('the different report\'s facts are untouched',
  (await liveObs(A.client, 'Ferritin')).some((r) => r.document_id === docOther.id) && (await liveObs(A.client, 'Vitamin D')).length === 1);
check('no source rows remain (the re-upload is now the primary source)',
  ((await A.client.from('fact_sources').select('id')).data ?? []).length === 0);
void ferritin;
const { data: memory } = await A.client.functions.invoke('health-memory', { body: {} });
check('Health Memory timeline no longer refers to report 1',
  !(memory?.timeline ?? []).some((e: { documentId: string | null }) => e.documentId === doc1.id));
const again = await del(A.client, doc1.id);
check('deleting again is safe: 200 deleted', again.http === 200 && again.status === 'deleted', JSON.stringify(again));

console.log('\n== Busy, unread and last-source cases ==');
const doc3 = await upload(A.client, 'Report 3', buildTextPdf(report([`Serum Ferritin ${rnd(100, 199)} ng/mL 30 - 400`])));
console.log(`test document: ${doc3.id}`);
await A.client.functions.invoke('process-document', { body: { document_id: doc3.id } });
const busy = await del(A.client, doc3.id);
check('a document being read can\'t be deleted mid-read (409 document_busy), nothing removed',
  busy.http === 409 && busy.code === 'document_busy' && (await stored(A.client, doc3.path)), JSON.stringify(busy));
check('…the read finishes normally', (await waitForRead(A.client, doc3.id)) === 'completed');
const d3 = await del(A.client, doc3.id);
check('…and it can be deleted afterwards', d3.http === 200 && !(await stored(A.client, doc3.path)), JSON.stringify(d3));

const doc4 = await upload(A.client, 'Unread', new TextEncoder().encode('%PDF-1.4\n% synthetic, never read\n%%EOF'));
console.log(`test document: ${doc4.id}`);
const d4 = await del(A.client, doc4.id);
check('an uploaded-but-unread document can be deleted; original removed', d4.http === 200 && !(await stored(A.client, doc4.path)), JSON.stringify(d4));

const d2 = await del(A.client, doc2.id);
check('deleting the last source removes those facts', d2.http === 200 && (await liveObs(A.client, 'B12')).length === 0
  && !(await liveObs(A.client, 'Ferritin')).some((r) => r.document_id === doc2.id), JSON.stringify(d2));
check('the re-upload\'s original is gone from Storage', !(await stored(A.client, doc2.path)));
const dOther = await del(A.client, docOther.id);
check('the different report can be deleted too; its facts and original are gone',
  dOther.http === 200 && (await liveObs(A.client, 'Ferritin')).length === 0 && (await liveObs(A.client, 'Vitamin D')).length === 0
  && !(await stored(A.client, docOther.path)), JSON.stringify(dOther));

console.log('\n== Clean-up check ==');
const { count: endDocs } = await A.client.from('documents').select('id', { count: 'exact', head: true });
const { count: bEndDocs } = await B.client.from('documents').select('id', { count: 'exact', head: true });
check('A is back to its baseline documents (nothing left behind)', endDocs === baselineDocs, `${baselineDocs} → ${endDocs}`);
check('B\'s documents unchanged', bEndDocs === bBaselineDocs, `${bBaselineDocs} → ${bEndDocs}`);

console.log(`\nDELETED TEST DOCUMENTS: ${[doc1.id, doc2.id, docOther.id, doc3.id, doc4.id].join(',')}`);
console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL LIVE DELETION CHECKS PASSED');
Deno.exit(failures ? 1 : 0);
