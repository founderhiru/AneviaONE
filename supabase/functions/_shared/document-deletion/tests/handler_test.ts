/** delete-document HTTP contract: auth, ownership, ordering, failures, idempotency, safe logs. */
import { assertEquals } from '@std/assert';

import type { LogFields } from '../../health-engine/log.ts';
import { createDeleteDocumentHandler, documentFolder, ORIGINALS_BUCKET, type BeginResult } from '../handler.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DOC = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHERS_DOC = 'bbbbbbbb-0000-4000-8000-000000000002';
const TOKENS: Record<string, string> = { 'jwt-user': USER, 'jwt-other': OTHER };

type Doc = { userId: string; status: 'completed' | 'processing' | 'pending_upload' | 'deleting'; path: string };

/** In-memory stand-in for the two engine functions + Storage, with the same rules. */
function setup() {
  const docs = new Map<string, Doc>([
    [DOC, { userId: USER, status: 'completed', path: `${documentFolder(USER, DOC)}original.pdf` }],
    [OTHERS_DOC, { userId: OTHER, status: 'completed', path: `${documentFolder(OTHER, OTHERS_DOC)}original.pdf` }],
  ]);
  const deleted = new Set<string>();
  const objects = new Set<string>([...docs.values()].map((d) => `${ORIGINALS_BUCKET}/${d.path}`));
  const calls: string[] = [];
  const logs: LogFields[] = [];
  const faults = { storage: false, finish: false, tamperPath: null as string | null };

  const handler = createDeleteDocumentHandler({
    authenticate: (jwt) => Promise.resolve(TOKENS[jwt] ?? null),
    db: {
      begin(documentId, userId): Promise<BeginResult> {
        calls.push(`begin:${documentId}`);
        const d = docs.get(documentId);
        if (!d || d.userId !== userId) {
          return Promise.resolve(deleted.has(`${userId}:${documentId}`) ? { status: 'deleted' } : { status: 'not_found' });
        }
        if (d.status === 'processing') return Promise.resolve({ status: 'busy' });
        if (d.status === 'pending_upload') return Promise.resolve({ status: 'not_eligible' });
        d.status = 'deleting';
        return Promise.resolve({ status: 'deleting', storage_bucket: ORIGINALS_BUCKET, storage_path: faults.tamperPath ?? d.path });
      },
      finish(documentId, userId) {
        calls.push(`finish:${documentId}`);
        if (faults.finish) return Promise.reject(new Error('finish_failed'));
        const d = docs.get(documentId);
        if (!d || d.userId !== userId || d.status !== 'deleting') return Promise.reject(new Error('not deleting'));
        docs.delete(documentId);
        deleted.add(`${userId}:${documentId}`);
        return Promise.resolve({ facts_removed: 3, facts_kept: 1 });
      },
    },
    storage: {
      removeObject(bucket, path) {
        calls.push(`remove:${bucket}/${path}`);
        if (faults.storage) return Promise.reject(new Error('storage down'));
        objects.delete(`${bucket}/${path}`);
        return Promise.resolve();
      },
      removeDerivatives(folder) {
        calls.push(`derivatives:${folder}`);
        return faults.storage ? Promise.reject(new Error('storage down')) : Promise.resolve();
      },
    },
    log: { info: (f) => logs.push(f), error: (f) => logs.push(f) },
  });

  const call = async (body: unknown, token: string | null = 'jwt-user', method = 'POST') => {
    const res = await handler(
      new Request('http://local/delete-document', {
        method,
        headers: token ? { authorization: `Bearer ${token}` } : {},
        body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      }),
    );
    return { status: res.status, body: await res.json() };
  };
  return { docs, objects, calls, logs, faults, call };
}

Deno.test('401 without a valid JWT, 405 for non-POST, 400 for a bad id — nothing touched', async () => {
  const { call, calls } = setup();
  assertEquals((await call({ document_id: DOC }, null)).status, 401);
  assertEquals((await call({ document_id: DOC }, 'forged')).status, 401);
  assertEquals((await call(null, 'jwt-user', 'GET')).status, 405);
  assertEquals((await call({ document_id: 'not-a-uuid' })).status, 400);
  assertEquals((await call('{oops')).status, 400);
  assertEquals((await call({})).status, 400);
  assertEquals(calls, []);
});

Deno.test('the owner deletes their document: marked deleting, original removed, then records removed', async () => {
  const { call, calls, docs, objects } = setup();
  const res = await call({ document_id: DOC });
  assertEquals(res, { status: 200, body: { document_id: DOC, status: 'deleted' } });
  assertEquals(calls, [
    `begin:${DOC}`,
    `remove:${ORIGINALS_BUCKET}/${USER}/documents/${DOC}/original.pdf`,
    `derivatives:${USER}/documents/${DOC}/`,
    `finish:${DOC}`,
  ]);
  assertEquals(docs.has(DOC), false);
  assertEquals(objects.has(`${ORIGINALS_BUCKET}/${USER}/documents/${DOC}/original.pdf`), false);
});

Deno.test('another person\'s document looks not found; nothing of theirs is touched', async () => {
  const { call, calls, docs, objects } = setup();
  assertEquals(await call({ document_id: OTHERS_DOC }), { status: 404, body: { error: 'not_found' } });
  assertEquals(calls, [`begin:${OTHERS_DOC}`]);
  assertEquals(docs.get(OTHERS_DOC)!.status, 'completed');
  assertEquals(objects.has(`${ORIGINALS_BUCKET}/${OTHER}/documents/${OTHERS_DOC}/original.pdf`), true);
});

Deno.test('owner and storage path come from the server, never the request body', async () => {
  const { call, calls } = setup();
  const res = await call({ document_id: DOC, user_id: OTHER, storage_path: `${OTHER}/documents/${OTHERS_DOC}/original.pdf`, bucket: 'x' });
  assertEquals(res.status, 200);
  assertEquals(calls.filter((c) => c.startsWith('remove:')), [`remove:${ORIGINALS_BUCKET}/${USER}/documents/${DOC}/original.pdf`]);
});

Deno.test('a storage path outside the person\'s document folder is never removed', async () => {
  const { call, calls, faults } = setup();
  faults.tamperPath = `${OTHER}/documents/${OTHERS_DOC}/original.pdf`;
  assertEquals(await call({ document_id: DOC }), { status: 500, body: { error: 'delete_failed', status: 'deleting' } });
  faults.tamperPath = `${USER}/documents/${DOC}/../../${OTHERS_DOC}/original.pdf`;
  assertEquals((await call({ document_id: DOC })).status, 500);
  assertEquals(calls.some((c) => c.startsWith('remove:') || c.startsWith('finish:')), false);
});

Deno.test('a document being read is busy; an unfinished upload is not eligible — nothing removed', async () => {
  const { call, calls, docs } = setup();
  docs.get(DOC)!.status = 'processing';
  assertEquals(await call({ document_id: DOC }), { status: 409, body: { error: 'document_busy' } });
  docs.get(DOC)!.status = 'pending_upload';
  assertEquals(await call({ document_id: DOC }), { status: 409, body: { error: 'not_eligible' } });
  assertEquals(calls.some((c) => c.startsWith('remove:') || c.startsWith('finish:')), false);
});

Deno.test('storage failure: never reported as deleted, records kept, and a retry finishes the job', async () => {
  const { call, calls, docs, faults } = setup();
  faults.storage = true;
  assertEquals(await call({ document_id: DOC }), { status: 502, body: { error: 'storage_delete_failed', status: 'deleting' } });
  assertEquals(calls.includes(`finish:${DOC}`), false);
  assertEquals(docs.get(DOC)!.status, 'deleting');

  faults.storage = false;
  assertEquals((await call({ document_id: DOC })).status, 200);
  assertEquals(docs.has(DOC), false);
});

Deno.test('record-removal failure: reported as not deleted (deleting); a retry is safe', async () => {
  const { call, docs, faults } = setup();
  faults.finish = true;
  assertEquals(await call({ document_id: DOC }), { status: 500, body: { error: 'delete_failed', status: 'deleting' } });
  assertEquals(docs.get(DOC)!.status, 'deleting');
  faults.finish = false;
  assertEquals((await call({ document_id: DOC })).status, 200);
});

Deno.test('deleting twice is safe: the second call reports deleted and touches nothing', async () => {
  const { call, calls } = setup();
  assertEquals((await call({ document_id: DOC })).status, 200);
  const before = calls.length;
  assertEquals(await call({ document_id: DOC }), { status: 200, body: { document_id: DOC, status: 'deleted' } });
  assertEquals(calls.slice(before), [`begin:${DOC}`]);
});

Deno.test('logs carry ids, codes and counts only — never paths or file names', async () => {
  const { call, logs, faults } = setup();
  await call({ document_id: DOC });
  faults.storage = true;
  await call({ document_id: OTHERS_DOC }, 'jwt-other');
  const text = JSON.stringify(logs);
  assertEquals(text.includes('original.pdf') || text.includes('/documents/'), false);
  assertEquals(logs[0], { event: 'document_deleted', document_id: DOC, facts_removed: 3, facts_kept: 1, duration_ms: logs[0].duration_ms });
  assertEquals(logs[1].error_code, 'storage_delete_failed');
});
