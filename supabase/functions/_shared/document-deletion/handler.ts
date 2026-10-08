/**
 * delete-document HTTP handler (Phase B), with every dependency injected.
 *
 *   POST { "document_id": "<uuid>" }
 *   Authorization: Bearer <the signed-in person's Supabase JWT>
 *
 *   200 { document_id, status: "deleted" }               removed (also when it already was)
 *   400 invalid_request · 401 unauthenticated · 405 method_not_allowed
 *   404 not_found            no such document for this person (also another person's)
 *   409 document_busy        it is being read right now — try again shortly
 *   409 not_eligible         an upload that never finished
 *   502 storage_delete_failed { status: "deleting" }   the original could not be removed; nothing else was
 *   500 delete_failed         { status: "deleting" }   records could not be removed; retry is safe
 *
 * Order: (1) the server marks the document `deleting` (it can't be read
 * again), (2) the stored original and any derivatives are removed, (3) one
 * database transaction removes the document's records (facts still supported
 * by another document are kept). A failure leaves the document `deleting` —
 * visible, never reported as deleted — and calling again resumes safely.
 *
 * Identity comes ONLY from the JWT; the document, its owner and its storage
 * path come ONLY from the database. Anything else in the body is ignored.
 * Responses and logs never contain file names, paths, report text or values.
 */

import type { Logger } from '../health-engine/log.ts';

export type BeginResult =
  | { status: 'deleting'; storage_bucket: string; storage_path: string }
  | { status: 'deleted' | 'busy' | 'not_eligible' | 'not_found' };

export interface DeletionDb {
  /** engine_begin_document_deletion: ownership-checked, locks and marks `deleting`. */
  begin(documentId: string, userId: string): Promise<BeginResult>;
  /** engine_delete_document: removes the records in one transaction. */
  finish(documentId: string, userId: string): Promise<{ facts_removed: number; facts_kept: number }>;
}

export interface DeletionStorage {
  /** Removes one object; succeeds when it is already gone. */
  removeObject(bucket: string, path: string): Promise<void>;
  /** Removes every server-generated derivative under this document's folder. */
  removeDerivatives(folder: string): Promise<void>;
}

export type DeletionDeps = {
  authenticate(jwt: string): Promise<string | null>;
  db: DeletionDb;
  storage: DeletionStorage;
  log: Logger;
};

export const ORIGINALS_BUCKET = 'medical-documents';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The only folder a person's document may live in: <user>/documents/<document>/ */
export const documentFolder = (userId: string, documentId: string) => `${userId}/documents/${documentId}/`;

export function createDeleteDocumentHandler(deps: DeletionDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
    const userId = token ? await deps.authenticate(token).catch(() => null) : null;
    if (!userId) return json(401, { error: 'unauthenticated' });

    let body: { document_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'invalid_request' });
    }
    const documentId = typeof body?.document_id === 'string' && UUID.test(body.document_id) ? body.document_id.toLowerCase() : null;
    if (!documentId) return json(400, { error: 'invalid_request' });

    const started = Date.now();
    const begun = await deps.db.begin(documentId, userId).catch(() => {
      deps.log.error({ event: 'document_delete_failed', document_id: documentId, error_code: 'begin_failed' });
      return null;
    });
    if (!begun) return json(500, { error: 'delete_failed' });
    if (begun.status !== 'deleting') {
      if (begun.status === 'deleted') return json(200, { document_id: documentId, status: 'deleted' });
      if (begun.status === 'busy') return json(409, { error: 'document_busy' });
      if (begun.status === 'not_eligible') return json(409, { error: 'not_eligible' });
      return json(404, { error: 'not_found' });
    }

    // Defence in depth: the path is the database's, and must be this person's document folder.
    const folder = documentFolder(userId, documentId);
    if (begun.storage_bucket !== ORIGINALS_BUCKET || !begun.storage_path.startsWith(folder) || begun.storage_path.includes('..')) {
      deps.log.error({ event: 'document_delete_failed', document_id: documentId, error_code: 'unexpected_storage_path' });
      return json(500, { error: 'delete_failed', status: 'deleting' });
    }

    try {
      await deps.storage.removeObject(ORIGINALS_BUCKET, begun.storage_path);
      await deps.storage.removeDerivatives(folder);
    } catch {
      deps.log.error({ event: 'document_delete_failed', document_id: documentId, error_code: 'storage_delete_failed' });
      return json(502, { error: 'storage_delete_failed', status: 'deleting' });
    }

    try {
      const counts = await deps.db.finish(documentId, userId);
      deps.log.info({
        event: 'document_deleted',
        document_id: documentId,
        facts_removed: counts.facts_removed,
        facts_kept: counts.facts_kept,
        duration_ms: Date.now() - started,
      });
      return json(200, { document_id: documentId, status: 'deleted' });
    } catch {
      deps.log.error({ event: 'document_delete_failed', document_id: documentId, error_code: 'records_delete_failed' });
      return json(500, { error: 'delete_failed', status: 'deleting' });
    }
  };
}
