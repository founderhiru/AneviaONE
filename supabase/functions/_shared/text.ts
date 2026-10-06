/** Small, pure text helpers used by every validator. */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Postgres rejects NUL; other control characters are never meaningful in a report. */
export function stripControlChars(input: string): string {
  return input.replace(CONTROL_CHARS, '');
}

/** NFKC, curly quotes/dashes folded, whitespace collapsed to single spaces, trimmed. */
export function normalizeText(input: string): string {
  return stripControlChars(input)
    .normalize('NFKC')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Case-sensitive containment after normalising both sides. */
export function containsText(haystack: string, needle: string): boolean {
  const n = normalizeText(needle);
  return n.length > 0 && normalizeText(haystack).includes(n);
}

/** Case-insensitive containment after normalising both sides. */
export function containsTextCI(haystack: string, needle: string): boolean {
  const n = normalizeText(needle).toLowerCase();
  return n.length > 0 && normalizeText(haystack).toLowerCase().includes(n);
}

/** Non-whitespace character count (used to detect pages with no text layer). */
export function visibleCharCount(text: string): number {
  return text.replace(/\s+/g, '').length;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && normalizeText(value).length > 0;
}
