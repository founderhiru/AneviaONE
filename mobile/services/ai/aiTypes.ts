import type { ConversationMessage, Evidence } from '../../types';

export type AskQuestionResult = {
  recordAnswer?: { text: string; evidence: Evidence[] };
  aiExplanation?: { text: string };
};

/**
 * AI service boundary. No provider (OpenAI/Claude/etc.) is called yet —
 * screens go through this interface only, so a real provider can be wired
 * in later behind one seam:
 *
 *   AI Provider -> AI Service -> screens
 *
 * The contract deliberately separates a record-backed answer from an
 * AI-generated explanation so the UI can always show which is which.
 */
export interface AiService {
  askQuestion(question: string): Promise<AskQuestionResult>;
  getSuggestedQuestions(): Promise<string[]>;
  getConversationHistory(): Promise<ConversationMessage[]>;
}
