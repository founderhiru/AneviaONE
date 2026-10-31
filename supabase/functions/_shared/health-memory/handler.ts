/**
 * health-memory HTTP handler (Gate 2).
 *
 *   POST {}  or  { subject_id }   Authorization: Bearer <the signed-in person's JWT>
 *   200 HealthSnapshot · 401 unauthenticated · 405 · 500 { error: "unavailable" }
 *
 * Reads go through `sourceFor(jwt)` — a Supabase client acting AS the caller
 * (anon key + their JWT), so RLS limits every row to their own records. No
 * service role, no AI.
 */

import type { Logger } from '../health-engine/log.ts';
import { loadTrustedRecords, type TrustedRecordSource } from './records.ts';
import { buildSnapshot } from './snapshot.ts';

export type HealthMemoryDeps = {
  authenticate(jwt: string): Promise<string | null>;
  /** `subjectId` limits every read to one person's records (own, or one the caller was granted). */
  sourceFor(jwt: string, subjectId?: string): TrustedRecordSource;
  log: Logger;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function bearer(req: Request): string | null {
  return /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;
}

export function createHealthMemoryHandler(deps: HealthMemoryDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    const token = bearer(req);
    const userId = token ? await deps.authenticate(token).catch(() => null) : null;
    if (!token || !userId) return json(401, { error: 'unauthenticated' });
    const body = await req.json().catch(() => ({}));
    const subjectId = (body as { subject_id?: unknown } | null)?.subject_id;
    if (subjectId !== undefined && subjectId !== null && !(typeof subjectId === 'string' && UUID.test(subjectId))) {
      return json(400, { error: 'invalid_subject' });
    }
    const started = Date.now();
    try {
      const records = await loadTrustedRecords(deps.sourceFor(token, (subjectId as string | null | undefined) ?? undefined));
      const snapshot = buildSnapshot(records);
      deps.log.info({ event: 'health_memory_built', status: 'ok', facts_written: records.length, duration_ms: Date.now() - started });
      return json(200, snapshot);
    } catch {
      deps.log.error({ event: 'health_memory_failed', error_code: 'records_unavailable', duration_ms: Date.now() - started });
      return json(500, { error: 'unavailable' });
    }
  };
}
