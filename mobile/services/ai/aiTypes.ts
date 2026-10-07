import type { ConversationMessage, Evidence } from '../../types';

export type AskQuestionResult = {
  recordAnswer?: { text: string; evidence: Evidence[]; wordedByAi?: boolean };
  aiExplanation?: { text: string };
};

/**
 * AI service boundary. Screens go through this interface only; the provider
 * is called server-side (`ask-health` Edge Function), never from the app.
 *
 * The contract deliberately separates a record-backed answer from an
 * AI-generated explanation so the UI can always show which is which.
 */
export interface AiService {
  askQuestion(question: string): Promise<AskQuestionResult>;
  getSuggestedQuestions(): Promise<string[]>;
  getConversationHistory(): Promise<ConversationMessage[]>;
}
