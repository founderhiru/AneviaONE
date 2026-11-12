/**
 * delete-vault-file HTTP handler, with every dependency injected.
 *
 *   POST { "file_id": "<uuid>" }
 *   Authorization: Bearer <the signed-in person's Supabase JWT>
 *
 *   200 { file_id, status: "deleted" }
 *   400 invalid_request · 401 unauthenticated · 405 method_not_allowed
 *   404 not_found            no such file, or it is not yours to delete (the two look the same)
 *   502 storage_delete_failed   the stored file could not be removed; nothing else was
 *   500 delete_failed           the record could not be removed; calling again is safe
 *
 * Who may delete is decided by the DATABASE (vault_delete_check, run as the caller):
 * the person's controller, or the uploader while their write access is still valid.
 * Order: (1) check permission, (2) remove the stored file, (3) delete the record, which
 * the database audits and shows in the person's activity. If step 3 fails the file is
 * already gone and calling again finishes the job; a record is never removed while its
 * file still exists.
 *
 * Identity comes ONLY from the JWT; the file and its path come ONLY from the database.
 * Responses and logs never contain titles, file names, paths or file content.
 */

import type { Logger } from '../health-engine/log.ts';

export type VaultCheck = { status: 'ok'; storage_path: string } | { status: 'not_found' };

export interface VaultDeletionDb {
  /** vault_delete_check, run with the caller's token. */
  check(jwt: string, fileId: string): Promise<VaultCheck>;
  /** vault_delete_file, run with the caller's token: audited row delete; refuses while the object exists. */
  finish(jwt: string, fileId: string): Promise<void>;
}

export interface VaultDeletionStorage {
  /** Removes one object; succeeds when it is already gone. */
  removeObject(bucket: string, path: string): Promise<void>;
}

export type VaultDeletionDeps = {
  authenticate(jwt: string): Promise<string | null>;
  db: VaultDeletionDb;
  storage: VaultDeletionStorage;
  log: Logger;
};

export const VAULT_BUCKET = 'personal-vault';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`, 'i');
/** The only shape a vault file may live at: <subject_id>/files/<file_id>/original.<ext> */
const pathFor = (fileId: string) => new RegExp(`^${UUID}/files/${fileId}/original\\.(pdf|jpg|png|heic)$`, 'i');

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function createDeleteVaultFileHandler(deps: VaultDeletionDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
    const userId = token ? await deps.authenticate(token).catch(() => null) : null;
    if (!token || !userId) return json(401, { error: 'unauthenticated' });

    let body: { file_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'invalid_request' });
    }
    const fileId = typeof body?.file_id === 'string' && UUID_RE.test(body.file_id) ? body.file_id.toLowerCase() : null;
    if (!fileId) return json(400, { error: 'invalid_request' });

    let checked: VaultCheck | null;
    try {
      checked = await deps.db.check(token, fileId);
    } catch {
      deps.log.error({ event: 'vault_delete_failed', file_id: fileId, error_code: 'check_failed' });
      return json(500, { error: 'delete_failed' });
    }
    if (checked.status !== 'ok') return json(404, { error: 'not_found' });

    // Defence in depth: the path is the database's, and must be a vault path for exactly this file.
    if (!pathFor(fileId).test(checked.storage_path)) {
      deps.log.error({ event: 'vault_delete_failed', file_id: fileId, error_code: 'unexpected_storage_path' });
      return json(500, { error: 'delete_failed' });
    }

    try {
      await deps.storage.removeObject(VAULT_BUCKET, checked.storage_path);
    } catch {
      deps.log.error({ event: 'vault_delete_failed', file_id: fileId, error_code: 'storage_delete_failed' });
      return json(502, { error: 'storage_delete_failed' });
    }

    try {
      await deps.db.finish(token, fileId);
    } catch {
      deps.log.error({ event: 'vault_delete_failed', file_id: fileId, error_code: 'record_delete_failed' });
      return json(500, { error: 'delete_failed' });
    }
    deps.log.info({ event: 'vault_file_deleted', file_id: fileId });
    return json(200, { file_id: fileId, status: 'deleted' });
  };
}
