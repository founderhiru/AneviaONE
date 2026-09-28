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
  createdAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
};
