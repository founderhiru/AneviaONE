/** process-document HTTP contract: auth, ownership, eligibility, consent, claim. */
import { assertEquals } from '@std/assert';

import { createProcessDocumentHandler } from '../handler.ts';
import { OTHER_USER, USER, makeContext } from './fakes.ts';
import { REPORT_A, buildTextPdf } from './fixtures.ts';

const DOC = 'bbbbbbbb-0000-4000-8000-000000000001';
const TOKENS: Record<string, string> = { 'jwt-user': USER, 'jwt-other': OTHER_USER };

function setup() {
  const env = makeContext();
  const tasks: Promise<unknown>[] = [];
  const handler = createProcessDocumentHandler({
    ...env.ctx,
    authenticate: (jwt) => Promise.resolve(TOKENS[jwt] ?? null),
    background: (task) => tasks.push(task),
  });
  env.db.addDoc(DOC);
  env.storage.files.set(`${USER}/${DOC}.pdf`, buildTextPdf(REPORT_A));
  const call = async (body: unknown, token: string | null = 'jwt-user', method = 'POST') => {
    const res = await handler(
      new Request('http://local/process-document', {
        method,
        headers: token ? { authorization: `Bearer ${token}` } : {},
        body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      }),
    );
    return { status: res.status, body: await res.json(), text: '' };
  };
  return { env, call, tasks };
}

Deno.test('401 without a valid JWT; 405 for non-POST', async () => {
  const { call, env } = setup();
  assertEquals((await call({ document_id: DOC }, null)).status, 401);
  assertEquals((await call({ document_id: DOC }, 'forged')).status, 401);
  assertEquals((await call(null, 'jwt-user', 'GET')).status, 405);
  assertEquals(env.db.docs.get(DOC)!.status, 'uploaded');
});

Deno.test('400 for malformed bodies and non-uuid ids', async () => {
  const { call } = setup();
  assertEquals((await call('{not json')).status, 400);
  assertEquals((await call({})).status, 400);
  assertEquals((await call({ document_id: "x' or 1=1" })).status, 400);
});

Deno.test("404 for another person's document — even if the body claims their user_id", async () => {
  const { call, env } = setup();
  const res = await call({ document_id: DOC, user_id: USER }, 'jwt-other');
  assertEquals(res, { status: 404, body: { error: 'not_found' }, text: '' });
  assertEquals(env.db.calls.includes('claimDocument'), false);
});

Deno.test('412 without consent — and no state change, no AI call', async () => {
  const { call, env } = setup();
  env.db.consent.delete(USER);
  assertEquals((await call({ document_id: DOC })).status, 412);
  assertEquals(env.db.docs.get(DOC)!.status, 'uploaded');
  assertEquals(env.extractor.sent.length, 0);
});

Deno.test('202 claims and processes; a second call is 200 (no repeat AI cost)', async () => {
  const { call, env, tasks } = setup();
  const res = await call({ document_id: DOC });
  assertEquals(res.status, 202);
  assertEquals(res.body, { document_id: DOC, status: 'processing' });
  await Promise.all(tasks);
  assertEquals(env.db.docs.get(DOC)!.status, 'completed');
  assertEquals((await call({ document_id: DOC })).body, { document_id: DOC, status: 'completed' });
  assertEquals(env.extractor.sent.length, 1);
});

Deno.test('409 while processing (concurrent calls: exactly one claim wins)', async () => {
  const { call, tasks } = setup();
  const [a, b] = await Promise.all([call({ document_id: DOC }), call({ document_id: DOC })]);
  assertEquals([a.status, b.status].sort(), [202, 409]);
  await Promise.all(tasks);
  assertEquals(tasks.length, 1);
});

Deno.test('409 for pending uploads and non-retryable failures; retryable failures can be retried', async () => {
  const { call, env } = setup();
  env.db.docs.get(DOC)!.status = 'pending_upload';
  assertEquals((await call({ document_id: DOC })).body, { error: 'not_eligible' });
  Object.assign(env.db.docs.get(DOC)!, { status: 'failed', failure_kind: 'unsupported' });
  assertEquals((await call({ document_id: DOC })).body, { error: 'not_retryable', failure_kind: 'unsupported' });
  Object.assign(env.db.docs.get(DOC)!, { status: 'failed', failure_kind: 'transient', processing_attempts: 1 });
  assertEquals((await call({ document_id: DOC })).status, 202);
});

// ------------------------------------- a completed report is never re-read --
// Viewing, refreshing or an automatic sweep must not change Health Memory:
// only the person's explicit re-read ("operation": "reread") re-reads it.

async function completedReport() {
  const ctx = setup();
  await ctx.call({ document_id: DOC });
  await Promise.all(ctx.tasks);
  ctx.tasks.length = 0;
  ctx.env.db.calls.length = 0;
  return ctx;
}

Deno.test('completed report: an ordinary request starts nothing (no claim, no run, no AI call)', async () => {
  const { call, env, tasks } = await completedReport();
  const runsBefore = env.db.runs.length;
  const sent = env.extractor.sent.length;
  for (const body of [{ document_id: DOC }, { document_id: DOC, operation: 'read' }]) {
    assertEquals(await call(body), { status: 200, body: { document_id: DOC, status: 'completed' }, text: '' });
  }
  assertEquals(env.db.calls.includes('claimDocument'), false);
  assertEquals([tasks.length, env.db.runs.length - runsBefore, env.extractor.sent.length - sent], [0, 0, 0]);
  assertEquals(env.db.docs.get(DOC)!.status, 'completed');
});

Deno.test('completed report: an older app\'s bare "reprocess": true is ignored safely (not an explicit re-read)', async () => {
  const { call, env, tasks } = await completedReport();
  const runsBefore = env.db.runs.length;
  for (let i = 0; i < 3; i++) {
    assertEquals((await call({ document_id: DOC, reprocess: true })).body, { document_id: DOC, status: 'completed' });
  }
  assertEquals([tasks.length, env.db.runs.length - runsBefore], [0, 0]);
  assertEquals(env.db.calls.includes('claimDocument'), false);
});

Deno.test('completed report: the explicit re-read still works — once, even if asked twice at the same moment', async () => {
  const { call, env, tasks } = await completedReport();
  const [a, b] = await Promise.all([call({ document_id: DOC, operation: 'reread' }), call({ document_id: DOC, operation: 'reread' })]);
  assertEquals([a.status, b.status].sort(), [202, 409]);
  await Promise.all(tasks);
  assertEquals(tasks.length, 1);
  assertEquals(env.db.docs.get(DOC)!.status, 'completed');
});

Deno.test('an unknown operation is refused before anything is touched', async () => {
  const { call, env } = await completedReport();
  assertEquals((await call({ document_id: DOC, operation: 'force' })).status, 400);
  assertEquals(env.db.calls, []);
});

Deno.test('a new upload is still read on an ordinary request; a retryable failure still retries', async () => {
  const { call, env } = setup();
  assertEquals((await call({ document_id: DOC })).status, 202);
  const OTHER = 'bbbbbbbb-0000-4000-8000-000000000009';
  env.db.addDoc(OTHER, USER, 'failed');
  Object.assign(env.db.docs.get(OTHER)!, { failure_kind: 'transient', processing_attempts: 1 });
  assertEquals((await call({ document_id: OTHER })).status, 202);
});

Deno.test('responses never echo report text, health data or secrets', async () => {
  const { call, tasks } = setup();
  const bodies: unknown[] = [];
  bodies.push((await call({ document_id: DOC })).body);
  await Promise.all(tasks);
  bodies.push((await call({ document_id: DOC })).body);
  const text = JSON.stringify(bodies);
  for (const s of ['HbA1c', 'Asha', '5.8', 'jwt-user', 'Bearer']) assertEquals(text.includes(s), false);
});
