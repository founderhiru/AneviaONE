/**
 * remove-relative HTTP handler, with every dependency injected.
 *
 *   POST { "subject_id": "<uuid>" }
 *   Authorization: Bearer <the signed-in person's Supabase JWT>
 *
 *   200 { status: "removed" }                      (also when the person is already gone)
 *   400 invalid_request · 401 unauthenticated · 405 method_not_allowed
 *   404 not_found             not a person this caller is custodian of (looks the same as "no such person")
 *   409 not_confirmed         the typed-name decision has not been recorded (confirm_subject_deletion)
 *   409 legal_hold            this record is on hold and cannot be deleted
 *   409 has_health_reports    delete their health reports first (their originals live in the health bucket)
 *   502 storage_delete_failed the person's files could not all be removed; nothing else was
 *   500 delete_failed         retry is safe
 *
 * Order: (1) the database checks custody, the recorded decision, any hold and any health reports,
 * (2) every file in the person's folder of the private vault is removed and the folder is re-listed to
 * prove it is empty, (3) the database removes the person and everything attached, tells the family
 * who lost access, and audits it. A failure leaves the person in place; calling again resumes.
 *
 * Identity comes ONLY from the JWT; the person and their folder come ONLY from the database.
 * Responses and logs never contain names, file names or paths.
 */

import type { Logger } from '../health-engine/log.ts';

export type BeginResult = { status: 'ok' | 'not_found' | 'not_confirmed' | 'legal_hold' | 'has_health_reports' };

export interface PersonRemovalDb {
  /** engine_begin_subject_removal: service role, read-only checks. */
  begin(subjectId: string, userId: string): Promise<BeginResult>;
  /** engine_finish_subject_removal: removes the person, notifies the family, audits. */
  finish(subjectId: string, userId: string): Promise<void>;
}

export interface PersonRemovalStorage {
  /** Removes every object in this person's folder of the vault; returns how many. */
  removeAll(subjectId: string): Promise<number>;
  /** How many objects remain in that folder. */
  count(subjectId: string): Promise<number>;
}

export type PersonRemovalDeps = {
  authenticate(jwt: string): Promise<string | null>;
  db: PersonRemovalDb;
  storage: PersonRemovalStorage;
  log: Logger;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function createRemoveRelativeHandler(deps: PersonRemovalDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
    const userId = token ? await deps.authenticate(token).catch(() => null) : null;
    if (!userId) return json(401, { error: 'unauthenticated' });

    let body: { subject_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'invalid_request' });
    }
    const subjectId = typeof body?.subject_id === 'string' && UUID_RE.test(body.subject_id) ? body.subject_id.toLowerCase() : null;
    if (!subjectId) return json(400, { error: 'invalid_request' });

    const begun = await deps.db.begin(subjectId, userId).catch(() => null);
    if (!begun) {
      deps.log.error({ event: 'person_remove_failed', error_code: 'begin_failed' });
      return json(500, { error: 'delete_failed' });
    }
    if (begun.status === 'not_found') return json(404, { error: 'not_found' });
    if (begun.status !== 'ok') return json(409, { error: begun.status });

    try {
      const removed = await deps.storage.removeAll(subjectId);
      if ((await deps.storage.count(subjectId)) !== 0) throw new Error('objects_remain');
      deps.log.info({ event: 'person_storage_removed', objects_removed: removed });
    } catch {
      deps.log.error({ event: 'person_remove_failed', error_code: 'storage_delete_failed' });
      return json(502, { error: 'storage_delete_failed' });
    }

    try {
      await deps.db.finish(subjectId, userId);
    } catch {
      deps.log.error({ event: 'person_remove_failed', error_code: 'record_delete_failed' });
      return json(500, { error: 'delete_failed' });
    }

    // An upload that landed after the folder was proven empty would otherwise be orphaned: sweep once more.
    await deps.storage.removeAll(subjectId).catch(() => undefined);
    deps.log.info({ event: 'person_removed' });
    return json(200, { status: 'removed' });
  };
}
