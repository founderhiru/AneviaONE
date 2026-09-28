import { mockConversations, suggestedQuestions } from '../../mock/conversations';
import type { AiService, AskQuestionResult } from './aiTypes';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mock AI service. Answers are canned per known mock question so the "Ask
 * My Health" screen has something believable to render; a real
 * implementation will call an actual AI Provider from behind this same
 * interface. Never generates diagnosis or treatment content — see
 * `docs/MOBILE_ARCHITECTURE.md` for the product safety rule this
 * enforces.
 */
export const aiService: AiService = {
  async askQuestion(question: string): Promise<AskQuestionResult> {
    await delay(900);
    const normalized = question.trim().toLowerCase();

    if (normalized.includes('hba1c')) {
      return {
        recordAnswer: {
          text: 'Your most recent HbA1c was 6.5% on 12 Aug 2026, compared with 6.1% on 18 Dec 2025.',
          evidence: [
            { documentId: 'doc-2026-annual', documentTitle: 'Annual Health Check — Comprehensive Panel', pageNumber: 2, excerpt: 'HbA1c: 6.5 %' },
            { documentId: 'doc-2025-blood', documentTitle: 'Blood Test — Lipid & Glucose Panel', pageNumber: 1, excerpt: 'HbA1c: 6.1 %' },
          ],
        },
        aiExplanation: {
          text: 'This is a rising trend across your last three records. It may be worth discussing with your doctor at your next visit — this is not a diagnosis.',
        },
      };
    }

    if (normalized.includes('cholesterol')) {
      return {
        recordAnswer: {
          text: 'Your LDL cholesterol was highest in your most recent record: 142 mg/dL on 12 Aug 2026.',
          evidence: [{ documentId: 'doc-2026-annual', documentTitle: 'Annual Health Check — Comprehensive Panel', pageNumber: 2, excerpt: 'LDL Cholesterol: 142 mg/dL' }],
        },
        aiExplanation: {
          text: 'Your LDL has increased gradually across your last six annual records.',
        },
      };
    }

    if (normalized.includes('medication')) {
      return {
        recordAnswer: {
          text: 'You currently have 3 active medications on file: Atorvastatin, Metformin, and Vitamin D3.',
          evidence: [{ documentId: 'doc-2026-annual', documentTitle: 'Annual Health Check — Comprehensive Panel' }],
        },
      };
    }

    if (normalized.includes('changed') || normalized.includes('latest')) {
      return {
        recordAnswer: {
          text: 'Your latest health check on 12 Aug 2026 found 3 changes: HbA1c rose from 6.1% to 6.5%, Vitamin D dropped from 31 to 22 ng/mL, and Atorvastatin 10 mg was newly prescribed.',
          evidence: [{ documentId: 'doc-2026-annual', documentTitle: 'Annual Health Check — Comprehensive Panel' }],
        },
      };
    }

    return {
      aiExplanation: {
        text: "I don't have enough in your Health Memory yet to answer that precisely. Try asking about a specific test, like HbA1c or cholesterol.",
      },
    };
  },

  async getSuggestedQuestions() {
    return suggestedQuestions;
  },

  async getConversationHistory() {
    return mockConversations.flatMap((c) => c.messages);
  },
};
