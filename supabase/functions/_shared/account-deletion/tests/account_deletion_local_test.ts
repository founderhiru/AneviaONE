/**
 * delete-account end to end, against a REAL local Supabase (migrations, Auth,
 * Storage, the served Edge Function). Refuses any URL but a local stack:
 *
 *   HI_LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
 *   HI_LOCAL_SUPABASE_ANON_KEY=… HI_LOCAL_SUPABASE_SERVICE_ROLE_KEY=… \
 *   deno test --allow-net --allow-env --allow-read _shared/account-deletion/tests/account_deletion_local_test.ts
 *
 * (values from `supabase status -o env`; functions served with
 * `supabase functions serve`). Without them the test is skipped.
 * Synthetic users, synthetic files; everything it creates is deleted.
 */
import { assert, assertEquals } from '@std/assert';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = Deno.env.get('HI_LOCAL_SUPABASE_URL') ?? '';
const ANON = Deno.env.get('HI_LOCAL_SUPABASE_ANON_KEY') ?? '';
const SERVICE = Deno.env.get('HI_LOCAL_SUPABASE_SERVICE_ROLE_KEY') ?? '';
const IS_LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(URL) && Boolean(ANON && SERVICE);
const RUN = Math.random().toString(36).slice(2, 8);
const PDF = new TextEncoder().encode('%PDF-1.4\n% synthetic, fictional test file\n%%EOF\n');

const USER_TABLES = ['documents', 'document_status_history', 'extraction_runs', 'document_pages', 'fact_sources', 'consents', 'health_profiles',
  'observations', 'conditions', 'medications', 'procedures', 'allergies', 'encounters'];

/** A user with a fresh email sign-in (so the token's amr is recent), as the app does it. */
async function signedIn(admin: SupabaseClient, label: string) {
  const email = `acct-del-${label}-${RUN}@example.test`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created.user) throw new Error(`create ${label}: ${error?.message}`);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error: e2 } = await anon.auth.verifyOtp({ email, token: link.properties!.email_otp, type: 'email' });
  if (e2 || !s.session) throw new Error(`sign in ${label}: ${e2?.message}`);
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${s.session.access_token}` } },
  });
  return { id: created.user.id, token: s.session.access_token, client };
}

/** A completed report with a stored original and a server derivative, written as the engine does. */
async function storedReport(admin: SupabaseClient, user: string, name: string) {
  const { data: doc, error } = await admin.from('documents')
    .insert({ user_id: user, original_filename: name, mime_type: 'application/pdf', file_size_bytes: PDF.length, status: 'pending_upload' })
    .select('id, storage_path').single();
  if (error) throw new Error(`document: ${error.message}`);
  const up = await admin.storage.from('medical-documents').upload(doc.storage_path, PDF, { contentType: 'application/pdf' });
  if (up.error) throw new Error(`upload: ${up.error.message}`);
  const der = await admin.storage.from('document-derivatives').upload(`${user}/documents/${doc.id}/pages/1.json`, '{"synthetic":true}', { contentType: 'application/json' });
  if (der.error) throw new Error(`derivative: ${der.error.message}`);
  await admin.from('documents').update({ status: 'uploaded', uploaded_at: new Date().toISOString() }).eq('id', doc.id);
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  await call('engine_claim_document', { p_document_id: doc.id, p_user_id: user });
  const run = await call('engine_start_run', { p_document_id: doc.id, p_user_id: user, p_pipeline_version: 'g1.1', p_model_provider: 'synthetic', p_model_name: 'it', p_prompt_version: 'it', p_consent_version: 'ai-2026-11' });
  await call('engine_complete_document', { p_run_id: run, p_user_id: user, p_payload: {
    report_date: '2026-03-12', identity_check: 'consistent', text_layer: 'present', chunk_count: 1, facts_discarded: 0,
    pages: [{ page_number: 1, text: 'Test X 5.8' }],
    observations: [{ page_number: 1, source_text: 'Test X 5.8', confidence: 0.95, confidence_gate: 'passed', fact_fingerprint: 'a'.repeat(64),
      name_as_written: 'Test X', value_as_written: '5.8', effective_date: '2026-03-12', category: 'laboratory', value_numeric: 5.8, interpretation_version: 'it1' }] } });
  return doc.id as string;
}

async function rowsOf(admin: SupabaseClient, user: string) {
  const counts: Record<string, number> = {};
  for (const t of USER_TABLES) {
    const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true }).eq('user_id', user);
    if (error) throw new Error(`${t}: ${error.message}`);
    counts[t] = count ?? 0;
  }
  const { count } = await admin.from('profiles').select('*', { count: 'exact', head: true }).eq('id', user);
  counts.profiles = count ?? 0;
  return counts;
}

async function objectsOf(admin: SupabaseClient, user: string) {
  const all: string[] = [];
  for (const bucket of ['medical-documents', 'document-derivatives']) {
    const walk = async (folder: string) => {
      const { data } = await admin.storage.from(bucket).list(folder, { limit: 100 });
      for (const e of data ?? []) e.id === null ? await walk(`${folder}/${e.name}`) : all.push(`${bucket}:${folder}/${e.name}`);
    };
    await walk(user);
  }
  return all.sort();
}

const deleteAccount = (token: string, body: unknown = { confirm: 'DELETE' }) =>
  fetch(`${URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

Deno.test({
  name: 'local Supabase: delete-account removes the caller\'s files, rows and sign-in — and nothing of anyone else',
  ignore: !IS_LOCAL,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const a = await signedIn(admin, 'a');
    const b = await signedIn(admin, 'b');
    let bRowsBefore: Record<string, number> = {};
    let bObjectsBefore: string[] = [];
    try {
    for (const who of [a, b]) {
      const { error } = await who.client.from('consents').insert([
        { consent_type: 'ai_processing', policy_version: 'ai-2026-11', granted: true },
        { consent_type: 'health_data_processing', policy_version: 'ai-2026-11', granted: true },
      ]);
      if (error) throw new Error(`consent: ${error.message}`);
    }
    await storedReport(admin, a.id, 'E2E a-1.pdf');
    await storedReport(admin, a.id, 'E2E a-2.pdf');
    await storedReport(admin, b.id, 'E2E b-1.pdf');
    bRowsBefore = await rowsOf(admin, b.id);
    bObjectsBefore = await objectsOf(admin, b.id);

      await t.step('setup: both people have reports, results, consents and files', async () => {
        const ra = await rowsOf(admin, a.id);
        assertEquals(ra.documents, 2);
        assert(ra.observations >= 1 && ra.consents === 2 && ra.profiles === 1);
        assertEquals((await objectsOf(admin, a.id)).length, 4); // 2 originals + 2 derivatives
        assertEquals(bObjectsBefore.length, 2);
      });

      await t.step('without the confirmation phrase: refused, nothing changes', async () => {
        const res = await deleteAccount(a.token, { confirm: 'yes' });
        assertEquals(res.status, 400);
        await res.body?.cancel();
        assertEquals((await rowsOf(admin, a.id)).documents, 2);
      });

      await t.step('A\'s token deletes A — a body naming B is ignored (identity comes only from the token)', async () => {
        const res = await deleteAccount(a.token, { confirm: 'DELETE', user_id: b.id });
        assertEquals(res.status, 200);
        assertEquals(await res.json(), { status: 'deleted' });
      });

      await t.step('A\'s sign-in is gone', async () => {
        const { data, error } = await admin.auth.admin.getUserById(a.id);
        assert(error !== null || data.user === null);
      });

      await t.step('every row of A is gone, in every table', async () => {
        const ra = await rowsOf(admin, a.id);
        for (const [table, n] of Object.entries(ra)) assertEquals(n, 0, `${table} still has ${n} row(s)`);
      });

      await t.step('every file of A is gone, in both buckets (no orphans)', async () => {
        assertEquals(await objectsOf(admin, a.id), []);
      });

      await t.step('B is completely unaffected: same rows, same files', async () => {
        assertEquals(await rowsOf(admin, b.id), bRowsBefore);
        assertEquals(await objectsOf(admin, b.id), bObjectsBefore);
        const { data } = await b.client.from('current_observations').select('id');
        assertEquals(data?.length, 1);
      });

      await t.step('a retry with A\'s old token is refused (the account no longer exists)', async () => {
        const res = await deleteAccount(a.token);
        assertEquals(res.status, 401);
        await res.body?.cancel();
      });
    } finally {
      // Clean up both synthetic users and any file they still have.
      for (const who of [a, b]) {
        for (const o of await objectsOf(admin, who.id)) {
          const [bucket, path] = o.split(':');
          await admin.storage.from(bucket).remove([path]);
        }
        await admin.auth.admin.deleteUser(who.id).catch(() => undefined);
      }
    }
  },
});
