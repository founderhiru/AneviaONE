/** delete-vault-file HTTP contract: auth, permission, ordering, failures, idempotency, safe logs. */
import { assertEquals } from '@std/assert';

import type { LogFields } from '../../health-engine/log.ts';
import { createDeleteVaultFileHandler, VAULT_BUCKET, type VaultCheck } from '../handler.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SUBJECT = 'cccccccc-0000-4000-8000-000000000001';
const FILE = 'bbbbbbbb-0000-4000-8000-000000000001';
const NOT_YOURS = 'bbbbbbbb-0000-4000-8000-000000000002';
const TOKENS: Record<string, string> = { 'jwt-user': USER, 'jwt-other': OTHER };
const PATH = `${SUBJECT}/files/${FILE}/original.pdf`;

/** In-memory stand-in for the two database functions + Storage, with the same rules. */
function setup() {
  const rows = new Map<string, { allowed: string[]; path: string }>([
    [FILE, { allowed: [USER], path: PATH }],
    [NOT_YOURS, { allowed: [OTHER], path: `${SUBJECT}/files/${NOT_YOURS}/original.pdf` }],
  ]);
  const objects = new Set<string>([...rows.values()].map((r) => `${VAULT_BUCKET}/${r.path}`));
  const calls: string[] = [];
  const logs: LogFields[] = [];
  const faults = { storage: false, finish: false, tamperPath: null as string | null };

  const handler = createDeleteVaultFileHandler({
    authenticate: (jwt) => Promise.resolve(TOKENS[jwt] ?? null),
    db: {
      check(jwt, fileId): Promise<VaultCheck> {
        calls.push(`check:${fileId}`);
        const r = rows.get(fileId);
        if (!r || !r.allowed.includes(TOKENS[jwt] ?? '')) return Promise.resolve({ status: 'not_found' });
        return Promise.resolve({ status: 'ok', storage_path: faults.tamperPath ?? r.path });
      },
      finish(jwt, fileId) {
        calls.push(`finish:${fileId}`);
        if (faults.finish) return Promise.reject(new Error('finish_failed'));
        const r = rows.get(fileId);
        if (!r || !r.allowed.includes(TOKENS[jwt] ?? '')) return Promise.reject(new Error('not allowed'));
        // the database refuses to delete the record while the object still exists
        if (objects.has(`${VAULT_BUCKET}/${r.path}`)) return Promise.reject(new Error('remove the stored file first'));
        rows.delete(fileId);
        return Promise.resolve();
      },
    },
    storage: {
      removeObject(bucket, path) {
        calls.push(`remove:${bucket}/${path}`);
        if (faults.storage) return Promise.reject(new Error('storage_failed'));
        objects.delete(`${bucket}/${path}`);
        return Promise.resolve();
      },
    },
    log: { info: (f) => logs.push(f), error: (f) => logs.push(f) },
  });
  const call = (body: unknown, jwt: string | null = 'jwt-user', method = 'POST') =>
    handler(new Request('https://x.test/delete-vault-file', {
      method,
      headers: { 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
      body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    }));
  return { call, rows, objects, calls, logs, faults };
}

Deno.test('rejects non-POST, anonymous and bad tokens', async () => {
  const t = setup();
  assertEquals((await t.call({}, 'jwt-user', 'GET')).status, 405);
  assertEquals((await t.call({ file_id: FILE }, null)).status, 401);
  assertEquals((await t.call({ file_id: FILE }, 'forged')).status, 401);
  assertEquals(t.calls, []);
});

Deno.test('rejects a malformed body or id', async () => {
  const t = setup();
  assertEquals((await t.call('not json')).status, 400);
  assertEquals((await t.call({ file_id: 'nope' })).status, 400);
  assertEquals((await t.call({})).status, 400);
  assertEquals(t.calls, []);
});

Deno.test('a permitted caller: object removed first, then the record, in that order', async () => {
  const t = setup();
  const res = await t.call({ file_id: FILE });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { file_id: FILE, status: 'deleted' });
  assertEquals(t.calls, [`check:${FILE}`, `remove:${VAULT_BUCKET}/${PATH}`, `finish:${FILE}`]);
  assertEquals(t.rows.has(FILE), false);
  assertEquals(t.objects.has(`${VAULT_BUCKET}/${PATH}`), false);
});

Deno.test("someone else's file, or a file that does not exist, looks the same and touches nothing", async () => {
  const t = setup();
  assertEquals((await t.call({ file_id: NOT_YOURS })).status, 404);
  assertEquals((await t.call({ file_id: 'dddddddd-0000-4000-8000-00000000000f' })).status, 404);
  assertEquals(t.calls.some((c) => c.startsWith('remove:') || c.startsWith('finish:')), false);
  assertEquals(t.rows.has(NOT_YOURS), true);
});

Deno.test('a storage failure leaves the record in place and reports it', async () => {
  const t = setup();
  t.faults.storage = true;
  const res = await t.call({ file_id: FILE });
  assertEquals(res.status, 502);
  assertEquals(t.rows.has(FILE), true);
  assertEquals(t.calls.some((c) => c.startsWith('finish:')), false);
});

Deno.test('a record failure after the object is gone: retry finishes the job', async () => {
  const t = setup();
  t.faults.finish = true;
  assertEquals((await t.call({ file_id: FILE })).status, 500);
  assertEquals(t.objects.has(`${VAULT_BUCKET}/${PATH}`), false);
  assertEquals(t.rows.has(FILE), true);
  t.faults.finish = false;
  assertEquals((await t.call({ file_id: FILE })).status, 200);
  assertEquals(t.rows.has(FILE), false);
});

Deno.test("a path that is not this file's vault path is never touched", async () => {
  for (const bad of [`${SUBJECT}/files/${NOT_YOURS}/original.pdf`, `${USER}/documents/x/original.pdf`, `${SUBJECT}/files/${FILE}/../../x.pdf`, `${SUBJECT}/files/${FILE}/original.exe`]) {
    const t = setup();
    t.faults.tamperPath = bad;
    assertEquals((await t.call({ file_id: FILE })).status, 500);
    assertEquals(t.calls.some((c) => c.startsWith('remove:')), false);
  }
});

Deno.test('deleting twice: the second time the file is simply not found', async () => {
  const t = setup();
  assertEquals((await t.call({ file_id: FILE })).status, 200);
  assertEquals((await t.call({ file_id: FILE })).status, 404);
});

Deno.test('logs carry ids only, never paths', async () => {
  const t = setup();
  await t.call({ file_id: FILE });
  t.faults.storage = true;
  await t.call({ file_id: FILE });
  const text = JSON.stringify(t.logs);
  assertEquals(text.includes('original.pdf'), false);
  assertEquals(text.includes('/files/'), false);
});
