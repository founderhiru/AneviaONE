import type { Conversation } from '../types';

/**
 * Mock "Ask My Health" conversation content. Every assistant message is
 * tagged with `source` so the UI can visually separate record-backed facts
 * from AI-generated explanation, and evidence-bearing answers carry an
 * `evidence` array pointing at real mock document ids.
 */
export const suggestedQuestions: string[] = [
  'When was my cholesterol highest?',
  'Has my HbA1c changed?',
  'What medications have I taken?',
  'What changed in my latest health check?',
];

export const mockConversations: Conversation[] = [
  {
    id: 'conv-hba1c',
    title: 'Has my HbA1c changed?',
    createdAt: '2026-08-13T08:00:00.000Z',
    updatedAt: '2026-08-13T08:00:12.000Z',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        text: 'Has my HbA1c changed?',
        createdAt: '2026-08-13T08:00:00.000Z',
      },
      {
        id: 'msg-2',
        role: 'assistant',
        text: 'Your most recent HbA1c was 6.5% on 12 Aug 2026, compared with 6.1% on 18 Dec 2025.',
        source: 'record',
        evidence: [
          { documentId: 'doc-2026-annual', documentTitle: 'Annual Health Check — Comprehensive Panel', pageNumber: 2, excerpt: 'HbA1c: 6.5 %' },
          { documentId: 'doc-2025-blood', documentTitle: 'Blood Test — Lipid & Glucose Panel', pageNumber: 1, excerpt: 'HbA1c: 6.1 %' },
        ],
        createdAt: '2026-08-13T08:00:05.000Z',
      },
      {
        id: 'msg-3',
        role: 'assistant',
        text: 'This is a rising trend across your last three records. It may be worth discussing with your doctor at your next visit — this is not a diagnosis.',
        source: 'ai_explanation',
        createdAt: '2026-08-13T08:00:12.000Z',
      },
    ],
  },
];

export function getConversationById(id: string): Conversation | undefined {
  return mockConversations.find((c) => c.id === id);
}
