/**
 * delete-account HTTP handler, with every dependency injected.
 *
 *   POST { "confirm": "DELETE" }
 *   Authorization: Bearer <the signed-in person's Supabase JWT>
 *
 *   200 { status: "deleted" }
 *   400 invalid_request          the body is not exactly { confirm: "DELETE" }
 *   401 unauthenticated · 405 method_not_allowed
 *   403 reauthentication_required   last sign-in older than REAUTH_WINDOW_S
 *   409 account_busy             a report is being read right now — try again shortly
 *   502 storage_delete_failed { status: "deleting" }   files remain; nothing else removed yet
 *   500 delete_failed         { status: "deleting" }   retry is safe
 *
 * Order: (1) the database marks the account and freezes every report
 * (engine_begin_account_deletion), (2) every stored file under the person's
 * folder is removed and the folder is re-listed to prove it is empty, (3) the
 * auth user is deleted, which removes every row (cascade). A failure at any
 * step leaves the account marked — no new reports, no reading — and calling
 * again resumes. Nothing says "deleted" before the auth user is gone.
 *
 * Identity comes ONLY from the verified JWT; the person deleted is always the
 * caller. Responses and logs carry no email, name, path or health content.
 */

import type { Logger } from '../health-engine/log.ts';

export type BeginResult = { status: 'deleting' | 'busy' | 'deleted' };

export interface AccountDeletionDb {
  /** engine_begin_account_deletion: service role, idempotent. */
  begin(userId: string): Promise<BeginResult>;
}

export interface AccountDeletionStorage {
  /** Removes every object under `<userId>/` in every bucket; returns how many were removed. */
  removeAllUnder(userId: string): Promise<number>;
  /** How many objects remain under `<userId>/` in every bucket. */
  countUnder(userId: string): Promise<number>;
}

export interface AccountDeletionAuth {
  /** Verifies the JWT; returns the user id and the time (s) of the last sign-in, or null. */
  authenticate(jwt: string): Promise<{ userId: string; lastSignInAt: number | null } | null>;
  /** Deletes the auth user (hard delete); succeeds when it is already gone. */
  deleteUser(userId: string): Promise<void>;
}

export type AccountDeletionDeps = {
  auth: AccountDeletionAuth;
  db: AccountDeletionDb;
  storage: AccountDeletionStorage;
  log: Logger;
  now?: () => number;
};

/** A deletion must follow a sign-in within this many seconds. */
export const REAUTH_WINDOW_S = 15 * 60;
export const CONFIRMATION = 'DELETE';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The most recent authentication time in a (verified) Supabase JWT, from its `amr` claim. */
export function lastSignInFromJwt(jwt: string): number | null {
  try {
    const part = jwt.split('.')[1];
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { amr?: { timestamp?: unknown }[] };
    const times = (claims.amr ?? []).map((m) => m.timestamp).filter((t): t is number => typeof t === 'number');
    return times.length ? Math.max(...times) : null;
  } catch {
    return null;
  }
}

export function createDeleteAccountHandler(deps: AccountDeletionDeps) {
  const now = deps.now ?? (() => Date.now());
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
    const caller = token ? await deps.auth.authenticate(token).catch(() => null) : null;
    if (!caller) return json(401, { error: 'unauthenticated' });

    let body: { confirm?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'invalid_request' });
    }
    if (body?.confirm !== CONFIRMATION) return json(400, { error: 'invalid_request' });

    // A stolen or long-lived session is not enough: the person signed in recently.
    if (caller.lastSignInAt === null || now() / 1000 - caller.lastSignInAt > REAUTH_WINDOW_S) {
      return json(403, { error: 'reauthentication_required' });
    }

    const { userId } = caller;
    const started = now();

    const begun = await deps.db.begin(userId).catch(() => null);
    if (!begun) {
      deps.log.error({ event: 'account_delete_failed', error_code: 'begin_failed' });
      return json(500, { error: 'delete_failed' });
    }
    if (begun.status === 'busy') return json(409, { error: 'account_busy' });

    if (begun.status === 'deleting') {
      try {
        const removed = await deps.storage.removeAllUnder(userId);
        const remaining = await deps.storage.countUnder(userId);
        if (remaining !== 0) throw new Error('objects_remain');
        deps.log.info({ event: 'account_storage_removed', objects_removed: removed });
      } catch {
        deps.log.error({ event: 'account_delete_failed', error_code: 'storage_delete_failed' });
        return json(502, { error: 'storage_delete_failed', status: 'deleting' });
      }
    }

    try {
      await deps.auth.deleteUser(userId);
    } catch {
      deps.log.error({ event: 'account_delete_failed', error_code: 'user_delete_failed' });
      return json(500, { error: 'delete_failed', status: 'deleting' });
    }

    deps.log.info({ event: 'account_deleted', duration_ms: now() - started });
    return json(200, { status: 'deleted' });
  };
}
