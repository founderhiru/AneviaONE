import { isDemoMode } from '../../config/appMode';
import { loadDemoServices } from '../demo/demoServices';
import { getSupabaseClient } from '../supabaseClient';
import type { AiService, AskQuestionResult } from './aiTypes';

/** Shown when an answer couldn't be fetched (offline, server unavailable). */
export const ASK_UNAVAILABLE_MESSAGE = 'I couldn’t reach your records just now. Please check your connection and try again.';

/** Example V1 questions — generic, never derived from sample data. */
export const SUGGESTED_QUESTIONS = [
  'What medications have I taken?',
  'When was my last blood test?',
  'What changed between my two latest reports?',
  'Which allergies are recorded?',
  'Show my recent health history.',
];

type AskResponse = {
  status: 'answered' | 'no_data' | 'insufficient' | 'safety' | 'unsupported';
  answer: string;
  sources: { documentId: string | null; documentName: string | null; pageNumber: number | null; excerpt: string | null }[];
  generatedBy: 'ai' | 'records' | 'none';
};

/** Maps the server's grounded answer to the screen's contract. */
export function toAskResult(r: AskResponse): AskQuestionResult {
  if (r.status !== 'answered') return { aiExplanation: { text: r.answer } };
  return {
    recordAnswer: {
      text: r.answer,
      wordedByAi: r.generatedBy === 'ai',
      evidence: r.sources
        .filter((s) => s.documentId)
        .map((s) => ({
          documentId: s.documentId!,
          documentTitle: s.documentName ?? 'Your report',
          pageNumber: s.pageNumber ?? undefined,
          excerpt: s.excerpt ?? undefined,
        })),
    },
  };
}

/**
 * PRODUCTION. Questions go to the `ask-health` Edge Function, which answers
 * only from the person's trusted records (RLS), validates every citation and
 * refuses diagnosis/treatment questions. No sample answers.
 */
export const productionAiService: AiService = {
  async askQuestion(question) {
    const client = getSupabaseClient();
    if (!client) return { aiExplanation: { text: ASK_UNAVAILABLE_MESSAGE } };
    const { data, error } = await client.functions.invoke('ask-health', { body: { question } });
    if (error || !data) return { aiExplanation: { text: ASK_UNAVAILABLE_MESSAGE } };
    return toAskResult(data as AskResponse);
  },
  async getSuggestedQuestions() {
    return SUGGESTED_QUESTIONS;
  },
  async getConversationHistory() {
    return [];
  },
};

export const aiService: AiService = isDemoMode ? loadDemoServices().ai : productionAiService;
