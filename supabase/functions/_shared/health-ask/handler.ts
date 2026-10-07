/**
 * ask-health HTTP handler (Gate 3).
 *   POST { "question": string }   Authorization: Bearer <JWT>
 *   200 AskResponse · 400 invalid_request · 401 unauthenticated · 405 · 500 unavailable
 * Records are read AS THE CALLER (RLS). The question text is never logged.
 */
import type { Logger } from '../health-engine/log.ts';
import type { TrustedRecordSource } from '../health-memory/records.ts';
import { bearer, json } from '../health-memory/handler.ts';
import { answerQuestion, MAX_QUESTION_LENGTH } from './ask.ts';
import type { AskModel } from './model.ts';

export type AskHandlerDeps = {
  authenticate(jwt: string): Promise<string | null>;
  sourceFor(jwt: string): TrustedRecordSource;
  hasAiConsentFor(jwt: string): Promise<boolean>;
  model: AskModel | null;
  log: Logger;
};

export function createAskHandler(deps: AskHandlerDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    const token = bearer(req);
    const userId = token ? await deps.authenticate(token).catch(() => null) : null;
    if (!token || !userId) return json(401, { error: 'unauthenticated' });
    let question: unknown;
    try {
      question = (await req.json())?.question;
    } catch {
      return json(400, { error: 'invalid_request' });
    }
    if (typeof question !== 'string' || !question.trim() || question.length > MAX_QUESTION_LENGTH * 2) return json(400, { error: 'invalid_request' });
    try {
      const result = await answerQuestion(question, {
        source: deps.sourceFor(token),
        hasAiConsent: () => deps.hasAiConsentFor(token),
        model: deps.model,
        log: deps.log,
      });
      return json(200, result);
    } catch {
      deps.log.error({ event: 'ask_failed', error_code: 'records_unavailable' });
      return json(500, { error: 'unavailable' });
    }
  };
}
