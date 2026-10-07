/**
 * Page text — the boundary between a PDF and everything downstream.
 *
 * PDFs with a TEXT LAYER are read here. Scanned / image-only PDFs are
 * detected (never guessed) and handed to the OCR step (ocr.ts).
 */

import { EngineError, USER_MESSAGES } from './errors.ts';
import type { Page } from './validate.ts';

export type PageTextResult = {
  pages: Page[];
  metadata: { pageCount: number; textLayer: 'present' | 'absent'; extractor: string };
};

export interface PageTextProvider {
  /** Text of every page, in order. Throws EngineError('unsupported', 'malformed_pdf') for unreadable files. */
  extract(pdf: Uint8Array): Promise<PageTextResult>;
}

/** A page "has text" when it holds at least this many letters/digits. */
export const MIN_CHARS_PER_TEXT_PAGE = 20;

/** Text layer present when most pages carry real text. */
export function detectTextLayer(pages: Page[]): 'present' | 'absent' {
  if (pages.length === 0) return 'absent';
  const withText = pages.filter((p) => (p.text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= MIN_CHARS_PER_TEXT_PAGE).length;
  return withText / pages.length >= 0.5 ? 'present' : 'absent';
}

type UnpdfModule = {
  getDocumentProxy(data: Uint8Array): Promise<unknown>;
  extractText(pdf: unknown, options: { mergePages: false }): Promise<{ totalPages: number; text: string[] }>;
};

/** Text-layer extraction with unpdf (a serverless build of Mozilla pdf.js). */
export class UnpdfPageTextProvider implements PageTextProvider {
  constructor(private readonly load: () => Promise<UnpdfModule>) {}

  async extract(pdf: Uint8Array): Promise<PageTextResult> {
    const header = new TextDecoder().decode(pdf.subarray(0, 1024));
    if (!header.includes('%PDF-')) throw new EngineError('unsupported', 'malformed_pdf', USER_MESSAGES.malformed);
    let totalPages: number;
    let text: string[];
    try {
      const unpdf = await this.load();
      // pdf.js may transfer/detach the buffer it is given — pass a copy.
      const doc = await unpdf.getDocumentProxy(new Uint8Array(pdf));
      ({ totalPages, text } = await unpdf.extractText(doc, { mergePages: false }));
    } catch (cause) {
      throw new EngineError('unsupported', 'malformed_pdf', USER_MESSAGES.malformed, { cause });
    }
    const pages = text.map((t, i) => ({ page_number: i + 1, text: t ?? '' }));
    return { pages, metadata: { pageCount: totalPages, textLayer: detectTextLayer(pages), extractor: 'unpdf' } };
  }
}
