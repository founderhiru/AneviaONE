import type { Evidence } from './document';

export type MessageSource = 'record' | 'ai_explanation';

export type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Only present on assistant messages: distinguishes record-backed facts
   * from AI-generated explanation, per the UI's safety requirement. */
  source?: MessageSource;
  evidence?: Evidence[];
  /** A record-backed answer whose wording came from the AI (citations checked by the server). */
  wordedByAi?: boolean;
  createdAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
};
