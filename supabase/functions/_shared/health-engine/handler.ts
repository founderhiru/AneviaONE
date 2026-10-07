/**
 * process-document HTTP handler (steps 1–6 of the Gate 1 spec), with every
 * dependency injected.
 *
 *   POST { "document_id": "<uuid>", "reprocess"?: boolean }
 *   Authorization: Bearer <the signed-in person's Supabase JWT>
 *
 *   202 { document_id, status: "processing" }   claimed; processing continues in the background
 *   200 { document_id, status: "completed" }    already done — no AI call is repeated
 *   400 invalid_request · 401 unauthenticated · 404 not_found (also for other people's documents)
 *   409 already_processing | not_retryable | not_eligible · 412 consent_required
 *
 * Identity comes ONLY from the JWT. A user_id in the body is ignored.
 * Responses never contain secrets, report text or health data.
 */

import { processClaimedDocument, type EngineContext } from './pipeline.ts';

export type HandlerDeps = EngineContext & {
  /** Verifies the JWT with Supabase Auth; returns the user id or null. */
  authenticate(jwt: string): Promise<string | null>;
  /** Keeps background work alive after the response (EdgeRuntime.waitUntil). */
  background(task: Promise<unknown>): void;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_RETRYABLE = new Set(['unsupported', 'identity_mismatch']);

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function createProcessDocumentHandler(deps: HandlerDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    // 1–2. Authenticate; identity is derived from the JWT only.
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
    const userId = token ? await deps.authenticate(token).catch(() => null) : null;
    if (!userId) return json(401, { error: 'unauthenticated' });

    let body: { document_id?: unknown; reprocess?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'invalid_request' });
    }
    const documentId = typeof body.document_id === 'string' && UUID.test(body.document_id) ? body.document_id : null;
    if (!documentId) return json(400, { error: 'invalid_request' });
    const reprocess = body.reprocess === true;

    // 4. Ownership (another person's document looks exactly like a missing one).
    const owned = await deps.db.getOwnedDocument(documentId, userId);
    if (!owned) return json(404, { error: 'not_found' });

    // Idempotent: refreshing never re-runs a completed document.
    if (owned.status === 'completed' && !reprocess) return json(200, { document_id: documentId, status: 'completed' });
    if (owned.status === 'pending_upload') return json(409, { error: 'not_eligible' });
    if (owned.status === 'failed' && owned.failure_kind && NOT_RETRYABLE.has(owned.failure_kind)) {
      return json(409, { error: 'not_retryable', failure_kind: owned.failure_kind });
    }

    // No AI processing without recorded consent — and no state change either.
    if (!(await deps.db.hasAiConsent(userId, deps.config.consentVersion))) {
      return json(412, { error: 'consent_required' });
    }

    // 5–6. Eligibility + atomic claim (concurrent calls: exactly one wins).
    const claimed = await deps.db.claimDocument(documentId, userId, reprocess, deps.config.maxAttempts);
    if (!claimed) {
      return json(409, { error: owned.status === 'processing' ? 'already_processing' : 'not_eligible' });
    }

    deps.log.info({ event: 'document_claimed', document_id: documentId, attempt: claimed.processing_attempts });
    deps.background(processClaimedDocument(deps, claimed, userId));
    return json(202, { document_id: documentId, status: 'processing' });
  };
}
