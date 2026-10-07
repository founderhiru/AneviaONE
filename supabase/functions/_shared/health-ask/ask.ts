/**
 * Ask My Health (Gate 3): question → safety screen → classify → minimal
 * retrieval (as the caller, RLS) → constrained model answer → citation and
 * content validation → answer with sources.
 *
 * The model is used only with recorded AI consent. Without consent, or when
 * the model's answer fails validation or the provider fails, the
 * deterministic record-built answer is returned — it is grounded by
 * construction. Nothing the model says is ever written to the database.
 */

import { isEngineError } from '../health-engine/errors.ts';
import type { Logger } from '../health-engine/log.ts';
import type { TrustedRecordSource } from '../health-memory/records.ts';
import { classifyQuestion, INTENT_TYPES, NOT_ENOUGH_INFORMATION, SAFETY_MESSAGES, type Intent } from './classify.ts';
import type { AskModel } from './model.ts';
import { retrieve, type Citable, type Sentence, type Source } from './retrieve.ts';
import { validateAnswer } from './validate-answer.ts';

export type AskStatus = 'answered' | 'no_data' | 'insufficient' | 'safety' | 'unsupported';

export type AskResponse = {
  status: AskStatus;
  /** The whole answer as one text, for simple display. */
  answer: string;
  sentences: Sentence[];
  /** Evidence for every cited item: document, page, verbatim excerpt. */
  sources: Source[];
  generatedBy: 'ai' | 'records' | 'none';
  intent: Intent['type'] | null;
};

export type AskDeps = {
  source: TrustedRecordSource;
  hasAiConsent(): Promise<boolean>;
  /** null when no provider is configured. */
  model: AskModel | null;
  log: Logger;
};

export const MAX_QUESTION_LENGTH = 500;
export const NO_RECORDS_MESSAGE = 'There are no records in your Health Memory yet. Add a report and, once it has been read, you can ask about it here.';
export const UNSUPPORTED_MESSAGE =
  'I can answer questions about your recorded health history — for example your medications, recent tests, how a test result changed, or what changed between reports.';

const respond = (status: AskStatus, answer: string, intent: Intent['type'] | null = null): AskResponse => ({
  status,
  answer,
  sentences: [],
  sources: [],
  generatedBy: 'none',
  intent,
});

function sourcesFor(sentences: Sentence[], items: Citable[]): Source[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of sentences) for (const c of s.citations) for (const src of byId.get(c)?.sources ?? []) {
    if (seen.has(src.recordId)) continue;
    seen.add(src.recordId);
    out.push(src);
  }
  return out;
}

function parseModelIntent(raw: unknown): Intent | null {
  if (!raw || typeof raw !== 'object') return null;
  const { intent, term } = raw as { intent?: unknown; term?: unknown };
  if (typeof intent !== 'string' || !(INTENT_TYPES as readonly string[]).includes(intent)) return null;
  const t = typeof term === 'string' && term.trim().length >= 2 && term.length <= 60 ? term.trim() : null;
  if ((intent === 'trend' || intent === 'medication_mentions') && !t) return null;
  if (intent === 'trend' || intent === 'medication_mentions') return { type: intent, term: t! };
  if (intent === 'medications' || intent === 'last_test' || intent === 'condition_first') return { type: intent, term: t };
  return { type: intent as 'changes' | 'conditions' | 'allergies' | 'procedures' | 'vaccinations' | 'history' };
}

export async function answerQuestion(rawQuestion: string, deps: AskDeps): Promise<AskResponse> {
  const question = rawQuestion.replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION_LENGTH);
  const started = Date.now();
  const log = (status: AskStatus, extra: Record<string, string | number | null> = {}) =>
    deps.log.info({ event: 'ask_answered', status, duration_ms: Date.now() - started, ...extra });

  const classification = classifyQuestion(question);
  if (classification.kind === 'safety') {
    log('safety', { error_code: `safety_${classification.reason}` });
    return respond('safety', SAFETY_MESSAGES[classification.reason]);
  }

  const consent = await deps.hasAiConsent().catch(() => false);
  let intent: Intent | null = classification.kind === 'intent' ? classification.intent : null;
  if (!intent && consent && deps.model) {
    intent = await deps.model.classify(question).then(parseModelIntent).catch(() => null);
  }
  if (!intent) {
    log('unsupported');
    return respond('unsupported', UNSUPPORTED_MESSAGE);
  }

  const retrieval = await retrieve(intent, deps.source);
  if (retrieval.recordCount === 0) {
    // Distinguish an empty account from a question about something not recorded.
    const anything = await retrieve({ type: 'history' }, deps.source).then((r) => r.recordCount > 0).catch(() => true);
    log('no_data', { pages: retrieval.recordCount });
    return respond(anything ? 'insufficient' : 'no_data', anything ? NOT_ENOUGH_INFORMATION : NO_RECORDS_MESSAGE, intent.type);
  }
  const cited = retrieval.deterministic.filter((s) => s.citations.length > 0);
  if (cited.length === 0) {
    log('insufficient');
    return respond('insufficient', NOT_ENOUGH_INFORMATION, intent.type);
  }

  const deterministicAnswer = (): AskResponse => ({
    status: 'answered',
    answer: retrieval.deterministic.map((s) => s.text).join(' '),
    sentences: retrieval.deterministic,
    sources: sourcesFor(retrieval.deterministic, retrieval.items),
    generatedBy: 'records',
    intent: intent!.type,
  });

  if (!consent || !deps.model) {
    log('answered', { model: 'records' });
    return deterministicAnswer();
  }

  try {
    const check = validateAnswer(await deps.model.answer(question, retrieval.items), retrieval.items);
    if (check.ok && check.status === 'answered') {
      log('answered', { model: deps.model.model, chunks: retrieval.items.length });
      return {
        status: 'answered',
        answer: check.sentences.map((s) => s.text).join(' '),
        sentences: check.sentences,
        sources: sourcesFor(check.sentences, retrieval.items),
        generatedBy: 'ai',
        intent: intent.type,
      };
    }
    // Model said "insufficient" or failed validation: fall back to the record-built answer.
    log('answered', { model: 'records', error_code: check.ok ? 'model_insufficient' : `answer_rejected_${check.reason}` });
    return deterministicAnswer();
  } catch (error) {
    log('answered', { model: 'records', ...(isEngineError(error) ? { error_code: error.code, ...error.diagnostics } : { error_code: 'model_error' }) });
    return deterministicAnswer();
  }
}
