/**
 * Deterministic chunking. Pages are grouped in order into chunks of at most
 * `maxChars` characters; a page is never split and never dropped. The model
 * is never asked which pages exist — every chunk lists its pages explicitly.
 */

import { EngineError, USER_MESSAGES } from './errors.ts';
import type { Page } from './validate.ts';

export const CHUNKING = { MAX_PAGES: 40, MAX_CHARS_PER_CHUNK: 60_000 } as const;

export function chunkPages(pages: Page[], maxChars: number = CHUNKING.MAX_CHARS_PER_CHUNK, maxPages: number = CHUNKING.MAX_PAGES): Page[][] {
  if (pages.length > maxPages) throw new EngineError('unsupported', 'too_many_pages', USER_MESSAGES.tooLong);
  const chunks: Page[][] = [];
  let current: Page[] = [];
  let size = 0;
  for (const page of pages) {
    if (page.text.length > maxChars) throw new EngineError('unsupported', 'page_too_long', USER_MESSAGES.tooLong);
    if (current.length > 0 && size + page.text.length > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(page);
    size += page.text.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
