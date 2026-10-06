/**
 * PageTextProvider — turns PDF bytes into per-page text. Text-layer only.
 * The PDF library is injected so the same code runs under Deno (`npm:unpdf`)
 * and under Jest (the `unpdf` dev dependency).
 */
import { LIMITS } from '../config.ts';
import { visibleCharCount } from '../text.ts';
import type { PageText, PageTextResult } from '../types.ts';

export type PdfErrorCode = 'invalid_pdf' | 'encrypted_pdf' | 'document_too_large';

export class PdfError extends Error {
  constructor(readonly code: PdfErrorCode) {
    super(code); // message is the code only — never document content
    this.name = 'PdfError';
  }
}

export interface PageTextProvider {
  extract(bytes: Uint8Array): Promise<PageTextResult>;
}

/** The slice of `unpdf` we use. */
export type UnpdfLike = {
  getDocumentProxy(data: Uint8Array): Promise<{ numPages: number; destroy?: () => Promise<void> | void }>;
  extractText(pdf: never, opts: { mergePages: false }): Promise<{ totalPages: number; text: string[] }>;
};

export function createUnpdfPageTextProvider(lib: UnpdfLike, maxPages: number = LIMITS.maxPages): PageTextProvider {
  return {
    async extract(bytes) {
      let pdf: Awaited<ReturnType<UnpdfLike['getDocumentProxy']>>;
      try {
        // unpdf may transfer the buffer; give it a copy so the caller can still hash the original.
        pdf = await lib.getDocumentProxy(new Uint8Array(bytes));
      } catch (e) {
        const name = (e as { name?: string })?.name ?? '';
        throw new PdfError(name === 'PasswordException' ? 'encrypted_pdf' : 'invalid_pdf');
      }
      try {
        if (pdf.numPages > maxPages) throw new PdfError('document_too_large');
        const out = await lib.extractText(pdf as never, { mergePages: false });
        const pages: PageText[] = out.text.map((text, i) => ({ pageNumber: i + 1, text: text ?? '' }));
        return { pages, pageCount: pdf.numPages, source: 'pdf_text_layer', meta: { provider: 'unpdf', version: '1' } };
      } catch (e) {
        if (e instanceof PdfError) throw e;
        const name = (e as { name?: string })?.name ?? '';
        throw new PdfError(name === 'PasswordException' ? 'encrypted_pdf' : 'invalid_pdf');
      } finally {
        try { await pdf.destroy?.(); } catch { /* ignore */ }
      }
    },
  };
}

export type TextLayerVerdict =
  | { kind: 'text_layer'; emptyPages: number }
  | { kind: 'scanned' };

/**
 * Scanned/image-only detection. A page with fewer than `minPageTextChars`
 * visible characters has no usable text. If all pages are empty, or the whole
 * document has too little text, it is treated as scanned — we never guess.
 * Some-but-not-all empty pages is processed and the count is recorded.
 */
export function judgeTextLayer(result: PageTextResult): TextLayerVerdict {
  const counts = result.pages.map((p) => visibleCharCount(p.text));
  const total = counts.reduce((a, b) => a + b, 0);
  const emptyPages = counts.filter((c) => c < LIMITS.minPageTextChars).length;
  if (result.pages.length === 0 || emptyPages === result.pages.length || total < LIMITS.minDocumentTextChars) {
    return { kind: 'scanned' };
  }
  return { kind: 'text_layer', emptyPages };
}
