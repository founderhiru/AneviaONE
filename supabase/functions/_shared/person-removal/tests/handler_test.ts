/** remove-relative HTTP contract: auth, custody checks, ordering, failures, idempotency, safe logs. */
import { assertEquals } from '@std/assert';

import type { LogFields } from '../../health-engine/log.ts';
import { createRemoveRelativeHandler, type BeginResult } from '../handler.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DAD = 'cccccccc-0000-4000-8000-000000000001';
const TOKENS: Record<string, string> = { 'jwt-user': USER, 'jwt-other': OTHER };

function setup(opts: { begin?: BeginResult['status']; removeFails?: boolean; leaveBehind?: number; finishFails?: boolean } = {}) {
  const calls: string[] = [];
  const logs: LogFields[] = [];
  let objects = 3;
  const handler = createRemoveRelativeHandler({
    authenticate: (jwt) => Promise.resolve(TOKENS[jwt] ?? null),
    db: {
      begin(subjectId, userId) {
        calls.push(`begin:${subjectId}:${userId}`);
        if (userId !== USER) return Promise.resolve({ status: 'not_found' });
        return Promise.resolve({ status: opts.begin ?? 'ok' });
      },
      finish(subjectId, userId) {
        calls.push(`finish:${subjectId}:${userId}`);
        return opts.finishFails ? Promise.reject(new Error('finish')) : Promise.resolve();
      },
    },
    storage: {
      removeAll(subjectId) {
        calls.push(`removeAll:${subjectId}`);
        if (opts.removeFails) return Promise.reject(new Error('storage'));
        const n = objects;
        objects = opts.leaveBehind ?? 0;
        return Promise.resolve(n);
      },
      count(subjectId) {
        calls.push(`count:${subjectId}`);
        return Promise.resolve(objects);
      },
    },
    log: { info: (f) => logs.push(f), error: (f) => logs.push(f) },
  });
  const call = (body: unknown, jwt: string | null = 'jwt-user', method = 'POST') =>
    handler(new Request('https://x.test/remove-relative', {
      method,
      headers: { 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
      body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    }));
  return { call, calls, logs };
}

Deno.test('rejects non-POST, anonymous, bad tokens and malformed ids without touching anything', async () => {
  const t = setup();
  assertEquals((await t.call({}, 'jwt-user', 'GET')).status, 405);
  assertEquals((await t.call({ subject_id: DAD }, null)).status, 401);
  assertEquals((await t.call({ subject_id: DAD }, 'forged')).status, 401);
  assertEquals((await t.call('nope')).status, 400);
  assertEquals((await t.call({ subject_id: 'x' })).status, 400);
  assertEquals(t.calls, []);
});

Deno.test('success: checks, then removes the files and proves the folder empty, then removes the person', async () => {
  const t = setup();
  const res = await t.call({ subject_id: DAD });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: 'removed' });
  assertEquals(t.calls, [`begin:${DAD}:${USER}`, `removeAll:${DAD}`, `count:${DAD}`, `finish:${DAD}:${USER}`, `removeAll:${DAD}`]);
});

Deno.test('someone who is not the custodian gets not_found and nothing is touched', async () => {
  const t = setup();
  assertEquals((await t.call({ subject_id: DAD }, 'jwt-other')).status, 404);
  assertEquals(t.calls, [`begin:${DAD}:${OTHER}`]);
});

Deno.test('every database refusal stops before any file is removed', async () => {
  for (const status of ['not_confirmed', 'legal_hold', 'has_health_reports'] as const) {
    const t = setup({ begin: status });
    const res = await t.call({ subject_id: DAD });
    assertEquals(res.status, 409);
    assertEquals(await res.json(), { error: status });
    assertEquals(t.calls, [`begin:${DAD}:${USER}`]);
  }
});

Deno.test('a storage failure or a leftover file keeps the person in place', async () => {
  const failing = setup({ removeFails: true });
  assertEquals((await failing.call({ subject_id: DAD })).status, 502);
  assertEquals(failing.calls.some((c) => c.startsWith('finish:')), false);
  const leftover = setup({ leaveBehind: 1 });
  assertEquals((await leftover.call({ subject_id: DAD })).status, 502);
  assertEquals(leftover.calls.some((c) => c.startsWith('finish:')), false);
});

Deno.test('a record failure after the files are gone: 500, and calling again finishes', async () => {
  const t = setup({ finishFails: true });
  assertEquals((await t.call({ subject_id: DAD })).status, 500);
  const retry = setup();
  assertEquals((await retry.call({ subject_id: DAD })).status, 200);
});

Deno.test('logs never contain ids', async () => {
  const t = setup();
  await t.call({ subject_id: DAD });
  const text = JSON.stringify(t.logs);
  assertEquals(text.includes(DAD) || text.includes(USER), false);
});
