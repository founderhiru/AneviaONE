/**
 * Gate 1 acceptance matrix against the DEPLOYED project — synthetic data only.
 *
 * Upload → real process-document (real PDF text / OCR, real AI provider) →
 * persisted facts → source evidence → trust status, for: a clear lab report,
 * several dates in one report, a urine report, a scanned report, a non-health
 * file, a report naming no one, an account with no identity entered, a
 * conflicting identity, a weak identity, and incomplete units/dates/ranges.
 * Then retry / duplicate-run / interrupted-upload behaviour, status ↔ fact
 * consistency, tenant isolation and response privacy.
 *
 * Runs only as the two dedicated TEST users (anon key + their own sessions,
 * no service-role key), so every read is also a Row Level Security check.
 * Same safety guards and .env.e2e as synthetic_e2e.ts:
 *
 *   set -a; source supabase/tests/e2e/.env.e2e; set +a
 *   deno run --config supabase/functions/deno.json --allow-net --allow-env --allow-read \
 *     supabase/tests/e2e/gate1_matrix_e2e.ts
 *
 * Output: pass/fail per check and counts only — never a value, name or date.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { buildScannedTextPdf, buildTextPdf } from '../../functions/_shared/health-engine/tests/fixtures.ts';

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
// A per-run accession number (as labs print) makes every run's PDFs unique,
// so re-running on the same test accounts never de-duplicates against an
// earlier run's facts.
const ACCESSION = `Accession No: G1-${RUN.replace(/\D/g, '')}`;
const CLINIC = 'Lakeview Family Clinic - Laboratory Report';
const head = (name: string | null, dob: string | null, date: string | null) =>
  [CLINIC, ACCESSION, ...(name || dob ? [`Patient: ${name ?? ''}   ${dob ? `DOB: ${dob}` : ''}`.trim()] : []), ...(date ? [`Report Date: ${date}`] : [])];

const CLEAR = [[...head(PERSON_A.name, PERSON_A.dobWritten, '12/03/2026'), 'Test   Result   Unit   Reference Range', 'Haemoglobin 12.9 g/dL 12.0 - 15.0', 'Fasting Glucose 96 mg/dL 70 - 100']];
const MULTI_DATE = [[
  ...head(PERSON_A.name, PERSON_A.dobWritten, '20/06/2026'),
  'Cumulative report - HbA1c',
  'Collected 15/01/2026   HbA1c 6.2 %   4.0 - 5.6',
  'Collected 18/04/2026   HbA1c 6.0 %   4.0 - 5.6',
  'Collected 20/06/2026   HbA1c 5.7 %   4.0 - 5.6',
]];
const URINE = [[
  ...head(PERSON_A.name, PERSON_A.dobWritten, '02/07/2026'),
  'Urine Routine Examination',
  'Colour Pale yellow',
  'pH 6.0   4.5 - 8.0',
  'Protein Nil   Nil',
  'Glucose Nil   Nil',
  'Pus cells 2-3 /hpf   0 - 5',
]];
const NON_HEALTH = [[
  'Greenfield Housing Society - Maintenance Invoice',
  `Invoice No: ${ACCESSION.replace(/\D/g, '')}   Date: 05/08/2026`,
  'Monthly maintenance charge 2,500.00',
  'Water charges 300.00',
  'Total payable 2,800.00',
]];
const NAMES_NO_ONE = [[...head(null, null, '11/08/2026'), 'Test   Result   Unit   Reference Range', 'TSH 2.1 mIU/L 0.4 - 4.0']];
const CONFLICT = [[...head('Meera Nair', '03/03/1990', '20/09/2026'), 'HbA1c 7.4 % 4.0 - 5.6']];
const WEAK = [[...head('A. Verma', null, '22/09/2026'), 'Test   Result   Unit   Reference Range', 'Vitamin D 18 ng/mL 30 - 100']];
const INCOMPLETE = [[
  CLINIC,
  ACCESSION,
  `Patient: ${PERSON_A.name}   DOB: ${PERSON_A.dobWritten}`,
  'Test   Result',
  'Serum Ferritin 45',
  'Vitamin B12 310 pg/mL',
]];
const FOR_B = [[...head(PERSON_B.name, PERSON_B.dobWritten, '18/08/2026'), 'Test   Result   Unit   Reference Range', 'Haemoglobin 14.2 g/dL 13.0 - 17.0']];
const SCANNED_LINES = [
  'Lakeview Family Clinic - Laboratory Report',
  ACCESSION,
  `Patient: ${PERSON_A.name}   DOB: ${PERSON_A.dobWritten}`,
  'Report Date: 25/09/2026',
  'Serum Creatinine 0.9 mg/dL 0.6 - 1.1',
  'Total Cholesterol 182 mg/dL < 200',
];

// --------------------------------------------------------------------- tools --
const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const httpStatus = (error: unknown) => (error as { context?: Response })?.context?.status;

async function signIn(email: string, password: string) {
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error('sign-in failed for a test account');
  return { client, id: data.user.id, providers: (data.user.identities ?? []).map((i) => i.provider) };
}
type TestUser = Awaited<ReturnType<typeof signIn>>;

// ------------------------------------------------------------ safety guard --
const DEDICATED_TEST_EMAIL = /^[^@\s+]+\+e2e[a-z0-9]*@[^@\s]+$/i;
function refuse(reason: string): never {
  console.error(`REFUSING TO RUN: ${reason}`);
  Deno.exit(2);
}
function guardEmails(a: string, b: string) {
  for (const [label, email] of [['E2E_A_EMAIL', a], ['E2E_B_EMAIL', b]]) {
    if (!DEDICATED_TEST_EMAIL.test(email)) refuse(`${label} must be a dedicated "+e2e" test address`);
  }
  if (a.toLowerCase() === b.toLowerCase()) refuse('E2E_A_EMAIL and E2E_B_EMAIL must be different accounts');
  const forbidden = (Deno.env.get('E2E_FORBIDDEN_EMAILS') ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if ([a, b].some((e) => forbidden.includes(e.toLowerCase()))) refuse('a test email is listed in E2E_FORBIDDEN_EMAILS');
}
async function guardAccount(label: string, user: TestUser, persona: string) {
  const other = user.providers.filter((p) => p !== 'email');
  if (other.length) refuse(`${label} has a ${other.join('/')} sign-in linked — not a dedicated test account`);
  const { data: profile, error: pErr } = await user.client.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  if (pErr) refuse(`${label}: could not read the profile to verify the account`);
  if (profile?.display_name && profile.display_name !== persona) refuse(`${label}'s profile already has a different name`);
  const { data: docs, error: dErr } = await user.client.from('documents').select('original_filename');
  if (dErr) refuse(`${label}: could not read documents to verify the account`);
  if ((docs ?? []).some((d) => !String(d.original_filename ?? '').startsWith('E2E '))) refuse(`${label} holds documents not created by the E2E suites`);
}

// -------------------------------------------------------------- app actions --
/** Exactly the app's upload: reserve the row → private storage → confirm. */
async function reserve(client: SupabaseClient, name: string, bytes: Uint8Array) {
  const { data: row, error } = await client
    .from('documents')
    .insert({ source: 'upload', original_filename: `E2E ${name} (${RUN}).pdf`, mime_type: 'application/pdf', file_size_bytes: bytes.length })
    .select('id, storage_path')
    .single();
  if (error) throw new Error('reserve failed');
  return row as { id: string; storage_path: string };
}
async function upload(client: SupabaseClient, name: string, bytes: Uint8Array): Promise<string> {
  const row = await reserve(client, name, bytes);
  const up = await client.storage.from('medical-documents').upload(row.storage_path, bytes, { contentType: 'application/pdf', upsert: false });
  if (up.error) throw new Error('upload failed');
  const confirm = await client.from('documents').update({ status: 'uploaded' }).eq('id', row.id);
  if (confirm.error) throw new Error('confirm failed');
  return row.id;
}
const invoke = (client: SupabaseClient, id: string, operation?: 'read' | 'reread') =>
  client.functions.invoke('process-document', { body: operation ? { document_id: id, operation } : { document_id: id } });

async function waitFinal(client: SupabaseClient, id: string, timeoutMs = 300_000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const { data } = await client.from('documents').select('status, failure_kind, identity_check, text_layer').eq('id', id).single();
    if (data && (data.status === 'completed' || data.status === 'failed')) return data as Record<string, string | null>;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { status: 'timeout' } as Record<string, string | null>;
}
async function process(client: SupabaseClient, id: string) {
  const { error } = await invoke(client, id);
  if (error) return { status: 'invoke_error', http: String(httpStatus(error)) } as Record<string, string | null>;
  return await waitFinal(client, id);
}
const observations = async (client: SupabaseClient, id: string) =>
  ((await client
    .from('observations')
    .select('id, name_as_written, value_as_written, unit_as_written, reference_range_as_written, value_numeric, unit_normalized, effective_date, source_text, confidence, confidence_gate, review_status, document_id, document_page_id, extraction_run_id, superseded_at')
    .eq('document_id', id)
    .is('superseded_at', null)).data ?? []) as Record<string, unknown>[];
const trustedIds = async (client: SupabaseClient, id: string) =>
  new Set((((await client.from('current_observations').select('id').eq('document_id', id)).data ?? []) as { id: string }[]).map((r) => r.id));
const runs = async (client: SupabaseClient, id: string) =>
  ((await client.from('extraction_runs').select('id, status, facts_written, facts_needs_review, facts_duplicate').eq('document_id', id)).data ?? []) as Record<string, unknown>[];
const find = (rows: Record<string, unknown>[], name: RegExp) => rows.find((r) => name.test(String(r.name_as_written)));

/** Every fact is traceable: its document, its page (with that page's stored text), its run and its quote. */
async function evidenceTraceable(client: SupabaseClient, docId: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return false;
  const pageIds = [...new Set(rows.map((r) => r.document_page_id as string))];
  const { data: pages } = await client.from('document_pages').select('id, document_id, page_number, text_content, text_source').in('id', pageIds);
  const byId = new Map(((pages ?? []) as Record<string, unknown>[]).map((p) => [p.id as string, p]));
  return rows.every((r) => {
    const page = byId.get(r.document_page_id as string);
    return (
      r.document_id === docId &&
      Boolean(r.extraction_run_id) &&
      typeof r.source_text === 'string' &&
      page?.document_id === docId &&
      typeof page.page_number === 'number' &&
      String(page.text_content ?? '').includes(String(r.value_as_written))
    );
  });
}

// ====================================================================== run ==
guardEmails(env('E2E_A_EMAIL'), env('E2E_B_EMAIL'));
const A = await signIn(env('E2E_A_EMAIL'), env('E2E_A_PASSWORD'));
const B = await signIn(env('E2E_B_EMAIL'), env('E2E_B_PASSWORD'));
if (A.id === B.id) refuse('E2E_A_EMAIL and E2E_B_EMAIL sign in to the same user');
await guardAccount('E2E account A', A, PERSON_A.name);
await guardAccount('E2E account B', B, PERSON_B.name);

const setIdentity = async (u: TestUser, fullName: string | null, dob: string | null) => {
  const { error } = await u.client.rpc('set_my_identity', { p_full_name: fullName, p_date_of_birth: dob });
  if (error) refuse('could not save test identity details');
};
const grantConsent = (u: TestUser) =>
  u.client.from('consents').insert(['ai_processing', 'health_data_processing'].map((consent_type) => ({ consent_type, policy_version: CONSENT_VERSION, granted: true })));
await A.client.from('profiles').update({ display_name: PERSON_A.name }).eq('id', A.id);
await B.client.from('profiles').update({ display_name: PERSON_B.name }).eq('id', B.id);
await setIdentity(A, PERSON_A.name, PERSON_A.dob);
await setIdentity(B, PERSON_B.name, PERSON_B.dob);
await grantConsent(A);
await grantConsent(B);

// -------------------------------------------------------------- the matrix --
console.log('\n== Clear lab report, identity confirmed ==');
const clear = await upload(A.client, 'G1 clear lab', buildTextPdf(CLEAR));
const clearOut = await process(A.client, clear);
check('clear report completes', clearOut.status === 'completed', String(clearOut.status));
check('identity confirmed (full name + DOB entered by the person)', clearOut.identity_check === 'consistent', String(clearOut.identity_check));
const clearObs = await observations(A.client, clear);
const hb = find(clearObs, /haemoglobin/i);
check('both results persisted', clearObs.length === 2, `${clearObs.length} rows`);
check('wording kept as printed, normalized values separate', hb?.value_as_written === '12.9' && hb?.unit_as_written === 'g/dL' && Number(hb?.value_numeric) === 12.9 && hb?.reference_range_as_written === '12.0 - 15.0');
check('effective date from the report', hb?.effective_date === '2026-03-12', String(hb?.effective_date));
check('source evidence: document, page text, run, quote', await evidenceTraceable(A.client, clear, clearObs));
const clearTrusted = await trustedIds(A.client, clear);
check('confirmed-identity results are trusted (current_observations)', clearObs.every((o) => clearTrusted.has(o.id as string) === (o.confidence_gate === 'passed')) && clearTrusted.size > 0, `${clearTrusted.size}/${clearObs.length} trusted`);

console.log('\n== Several dates in one report ==');
const multi = await upload(A.client, 'G1 multi-date', buildTextPdf(MULTI_DATE));
const multiOut = await process(A.client, multi);
check('multi-date report completes', multiOut.status === 'completed', String(multiOut.status));
const multiDates = new Set((await observations(A.client, multi)).map((o) => o.effective_date));
check('each result keeps its own collection date', ['2026-01-15', '2026-04-18', '2026-06-20'].every((d) => multiDates.has(d)), `${multiDates.size} distinct dates`);

console.log('\n== Urine report ==');
const urine = await upload(A.client, 'G1 urine', buildTextPdf(URINE));
const urineOut = await process(A.client, urine);
check('urine report completes', urineOut.status === 'completed', String(urineOut.status));
const urineObs = await observations(A.client, urine);
const protein = find(urineObs, /protein/i);
const ph = find(urineObs, /^ph$/i);
check('urine results persisted', urineObs.length >= 4, `${urineObs.length} rows`);
check('qualitative value kept as written, no number invented', protein?.value_as_written === 'Nil' && protein?.value_numeric == null);
check('numeric urine value parsed', Number(ph?.value_numeric) === 6);

console.log('\n== Scanned report (no text layer → OCR) ==');
const scanned = await upload(A.client, 'G1 scanned', buildScannedTextPdf(SCANNED_LINES));
const scannedOut = await process(A.client, scanned);
check('scanned report completes', scannedOut.status === 'completed', `${scannedOut.status} ${scannedOut.failure_kind ?? ''}`);
check('detected as having no text layer', scannedOut.text_layer === 'absent', String(scannedOut.text_layer));
const scannedObs = await observations(A.client, scanned);
const { data: scanPages } = await A.client.from('document_pages').select('text_source').eq('document_id', scanned);
check('page text recorded as an OCR transcription', (scanPages ?? []).length > 0 && (scanPages ?? []).every((p) => p.text_source === 'ocr'));
check('scanned results persisted with evidence', scannedObs.length >= 1 && (await evidenceTraceable(A.client, scanned, scannedObs)), `${scannedObs.length} rows`);

console.log('\n== Non-health file ==');
const nonHealth = await upload(A.client, 'G1 invoice', buildTextPdf(NON_HEALTH));
const nonHealthOut = await process(A.client, nonHealth);
check('non-health file completes without inventing results', nonHealthOut.status === 'completed' && (await observations(A.client, nonHealth)).length === 0, `${nonHealthOut.status}`);

console.log('\n== Report that names no one ==');
const anon = await upload(A.client, 'G1 no identifiers', buildTextPdf(NAMES_NO_ONE));
const anonOut = await process(A.client, anon);
const anonObs = await observations(A.client, anon);
check('completes; identity recorded as "no identifiers"', anonOut.status === 'completed' && anonOut.identity_check === 'no_identifiers', `${anonOut.status} ${anonOut.identity_check}`);
check('results stored with evidence but ALL held for review', anonObs.length > 0 && anonObs.every((o) => o.confidence_gate === 'needs_review') && (await evidenceTraceable(A.client, anon, anonObs)));
check('none of them in trusted Health Memory', (await trustedIds(A.client, anon)).size === 0);

console.log('\n== Account with no identity entered ==');
await setIdentity(B, null, null);
const noId = await upload(B.client, 'G1 no account identity', buildTextPdf(FOR_B));
const noIdOut = await process(B.client, noId);
const noIdObs = await observations(B.client, noId);
check('completes; identity "unverifiable" (nothing to compare with)', noIdOut.status === 'completed' && noIdOut.identity_check === 'unverifiable', `${noIdOut.status} ${noIdOut.identity_check}`);
check('all held for review, none trusted', noIdObs.length > 0 && noIdObs.every((o) => o.confidence_gate === 'needs_review') && (await trustedIds(B.client, noId)).size === 0);
await setIdentity(B, PERSON_B.name, PERSON_B.dob);

console.log('\n== Conflicting identity ==');
const conflict = await upload(A.client, 'G1 conflicting identity', buildTextPdf(CONFLICT));
const conflictOut = await process(A.client, conflict);
check('flagged as belonging to someone else', conflictOut.status === 'failed' && conflictOut.failure_kind === 'identity_mismatch' && conflictOut.identity_check === 'mismatch', `${conflictOut.status} ${conflictOut.failure_kind}`);
check('nothing ingested from it', (await observations(A.client, conflict)).length === 0);

console.log('\n== Weak identity (initial + surname only) ==');
const weak = await upload(A.client, 'G1 weak identity', buildTextPdf(WEAK));
const weakOut = await process(A.client, weak);
const weakObs = await observations(A.client, weak);
check('completes; identity "unverifiable"', weakOut.status === 'completed' && weakOut.identity_check === 'unverifiable', `${weakOut.status} ${weakOut.identity_check}`);
check('all held for review, none trusted', weakObs.length > 0 && weakObs.every((o) => o.confidence_gate === 'needs_review') && (await trustedIds(A.client, weak)).size === 0);

console.log('\n== Incomplete units, dates and ranges ==');
const incomplete = await upload(A.client, 'G1 incomplete', buildTextPdf(INCOMPLETE));
const incompleteOut = await process(A.client, incomplete);
const incObs = await observations(A.client, incomplete);
const ferritin = find(incObs, /ferritin/i);
const b12 = find(incObs, /b12/i);
check('incomplete report completes', incompleteOut.status === 'completed', String(incompleteOut.status));
check('missing unit stays missing', Boolean(ferritin) && ferritin?.unit_as_written == null && ferritin?.unit_normalized == null);
check('missing range stays missing', incObs.length > 0 && incObs.every((o) => o.reference_range_as_written == null));
check('no date invented', incObs.length > 0 && incObs.every((o) => o.effective_date == null));
check('a printed unit is still kept', b12?.unit_as_written === 'pg/mL');

// ------------------------------------------------- retry & idempotency -------
console.log('\n== Retry, duplicate runs, interrupted uploads ==');
const runsBefore = (await runs(A.client, clear)).length;
const repeat = await invoke(A.client, clear);
check('re-asking about a completed report reads nothing again', !repeat.error && (repeat.data as { status?: string })?.status === 'completed');
const legacy = await A.client.functions.invoke('process-document', { body: { document_id: clear, reprocess: true } });
check('an old-style reprocess flag reads nothing again', !legacy.error && (legacy.data as { status?: string })?.status === 'completed');
check('completed report: run count unchanged', (await runs(A.client, clear)).length === runsBefore, `${runsBefore} run(s)`);

const racer = await upload(A.client, 'G1 duplicate run', buildTextPdf(CLEAR));
const [first, second] = await Promise.all([invoke(A.client, racer), invoke(A.client, racer)]);
const statuses = [first, second].map((r) => (r.error ? httpStatus(r.error) : 202)).sort();
check('two simultaneous requests start exactly one read', statuses[0] === 202 && statuses[1] === 409, statuses.join(','));
await waitFinal(A.client, racer);
check('…and exactly one run exists', (await runs(A.client, racer)).length === 1);

const reserved = await reserve(A.client, 'G1 interrupted (never uploaded)', buildTextPdf(CLEAR));
const interrupted = await invoke(A.client, reserved.id);
check('an upload that never finished is not processed', httpStatus(interrupted.error) === 409);
const confirmEmpty = await A.client.from('documents').update({ status: 'uploaded' }).eq('id', reserved.id).select('status');
const { data: afterConfirm } = await A.client.from('documents').select('status').eq('id', reserved.id).single();
check('it cannot be marked uploaded without its file', Boolean(confirmEmpty.error) || afterConfirm?.status === 'pending_upload', String(afterConfirm?.status));
await A.client.from('documents').delete().eq('id', reserved.id).eq('status', 'pending_upload');

const mismatchAgain = await invoke(A.client, conflict);
check('a report flagged as someone else’s is not retried automatically', httpStatus(mismatchAgain.error) === 409);

console.log('\n== Status ↔ facts consistency ==');
for (const [label, id] of [['clear', clear], ['multi', multi], ['urine', urine], ['scanned', scanned], ['anon', anon], ['weak', weak], ['incomplete', incomplete], ['racer', racer]] as const) {
  const succeeded = (await runs(A.client, id)).filter((r) => r.status === 'succeeded');
  const latest = succeeded.at(-1);
  const live = await observations(A.client, id);
  const { count: liveFacts } = await A.client.from('observations').select('id', { count: 'exact', head: true }).eq('document_id', id).is('superseded_at', null);
  check(`${label}: one succeeded run, live facts belong to it`, succeeded.length === 1 && live.every((o) => o.extraction_run_id === latest?.id), `${liveFacts} live observations`);
}
const { count: conflictFacts } = await A.client.from('observations').select('id', { count: 'exact', head: true }).eq('document_id', conflict);
check('failed report has no facts', conflictFacts === 0);

// ------------------------------------------------------- tenant isolation ---
console.log('\n== Tenant isolation (B looking at A) ==');
const { data: aDoc } = await A.client.from('documents').select('storage_path').eq('id', clear).single();
const bDocs = await B.client.from('documents').select('id').eq('id', clear);
const bObs = await B.client.from('observations').select('id').eq('document_id', clear);
const bCurrent = await B.client.from('current_observations').select('id').eq('document_id', clear);
const bPages = await B.client.from('document_pages').select('id').eq('document_id', clear);
const bRuns = await B.client.from('extraction_runs').select('id').eq('document_id', clear);
const bProfile = await B.client.from('profiles').select('full_name').eq('id', A.id);
const bHealth = await B.client.from('health_profiles').select('date_of_birth').eq('user_id', A.id);
check("B can't see A's document", (bDocs.data ?? []).length === 0);
check("B can't see A's observations (table or trusted view)", (bObs.data ?? []).length === 0 && (bCurrent.data ?? []).length === 0);
check("B can't see A's page text or runs", (bPages.data ?? []).length === 0 && (bRuns.data ?? []).length === 0);
check("B can't see A's identity profile", (bProfile.data ?? []).length === 0 && (bHealth.data ?? []).length === 0);
const bDownload = await B.client.storage.from('medical-documents').download(aDoc!.storage_path);
check("B can't download A's original", Boolean(bDownload.error) && !bDownload.data);
const bProcess = await invoke(B.client, clear);
check("B can't process A's document (looks like it doesn't exist)", httpStatus(bProcess.error) === 404);
const bReread = await invoke(B.client, clear, 'reread');
check("B can't re-read A's document", httpStatus(bReread.error) === 404);
const bEngine = await B.client.rpc('engine_account_identity', { p_user_id: A.id });
check("B can't call the server-only identity reader", Boolean(bEngine.error));
const bUpdate = await B.client.from('documents').update({ status: 'uploaded' }).eq('id', clear).select('id');
check("B can't change A's document", (bUpdate.data ?? []).length === 0);
const bIdentity = await B.client.rpc('set_my_identity', { p_full_name: PERSON_B.name, p_date_of_birth: PERSON_B.dob });
const { data: aStill } = await A.client.from('profiles').select('full_name').eq('id', A.id).single();
check("B saving identity changes only B's own", !bIdentity.error && aStill?.full_name === PERSON_A.name);

// ----------------------------------------------------------------- privacy ---
console.log('\n== Privacy ==');
const responses = JSON.stringify([repeat.data, legacy.data, first.data, second.data, mismatchAgain.data]);
check('processing responses carry status only — no names, dates or values', !/12\.9|Haemoglobin|Asha|Verma|1985|Meera/i.test(responses));

// ------------------------------------------------------------------ result ---
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  Deno.exit(1);
}
