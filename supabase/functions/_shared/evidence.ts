/**
 * Evidence validation — the hard boundary. A model-proposed fact is accepted
 * only if its page exists, its quote is really on that page, and the value is
 * really in the quote. Nothing here uses a model.
 */
import { containsText, containsTextCI, normalizeText } from './text.ts';
import { quoteLengthProblem } from './schema.ts';
import type { RejectionReason } from './types.ts';

export type PageIndex = ReadonlyMap<number, string>;

export function indexPages(pages: { pageNumber: number; text: string }[]): PageIndex {
  return new Map(pages.map((p) => [p.pageNumber, p.text]));
}

export type EvidenceCheck = { ok: true; quote: string } | { ok: false; reason: RejectionReason };

/** The page must exist, and the quote must appear on it (whitespace/NFKC-insensitive, otherwise verbatim). */
export function checkQuote(pages: PageIndex, pageNumber: number, quote: string): EvidenceCheck {
  const pageText = pages.get(pageNumber);
  if (pageText === undefined) return { ok: false, reason: 'page_missing' };
  const q = normalizeText(quote);
  const lengthProblem = quoteLengthProblem(q);
  if (lengthProblem) return { ok: false, reason: lengthProblem };
  if (!containsText(pageText, q)) return { ok: false, reason: 'quote_not_on_page' };
  return { ok: true, quote: q };
}

/** The value must be present in the quote (case-insensitive for words, exact for digits). */
export function valueInQuote(quote: string, value: string): boolean {
  return containsTextCI(quote, value);
}

/** An optional field is kept only if it is present in the quote. */
export function optionalInQuote(quote: string, field: string | null): string | null {
  return field && containsTextCI(quote, field) ? field : null;
}

/** Dates that live in a report header are checked against the whole document. */
export function textOnAnyPage(pages: PageIndex, text: string | null): boolean {
  if (!text) return false;
  for (const pageText of pages.values()) if (containsTextCI(pageText, text)) return true;
  return false;
}
