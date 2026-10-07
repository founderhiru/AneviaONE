/**
 * health-memory HTTP handler (Gate 2).
 *
 *   POST {}   Authorization: Bearer <the signed-in person's JWT>
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
  sourceFor(jwt: string): TrustedRecordSource;
  log: Logger;
};

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
    const started = Date.now();
    try {
      const records = await loadTrustedRecords(deps.sourceFor(token));
      const snapshot = buildSnapshot(records);
      deps.log.info({ event: 'health_memory_built', status: 'ok', facts_written: records.length, duration_ms: Date.now() - started });
      return json(200, snapshot);
    } catch {
      deps.log.error({ event: 'health_memory_failed', error_code: 'records_unavailable', duration_ms: Date.now() - started });
      return json(500, { error: 'unavailable' });
    }
  };
}
