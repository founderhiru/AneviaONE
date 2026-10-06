/**
 * Deterministic chunking. The language model never decides which pages exist
 * or how a document is split: whole pages are packed in order up to a
 * character budget; a single over-long page is split at line boundaries.
 */
import type { PageText } from './types.ts';
import { visibleCharCount } from './text.ts';

export type Segment = { pageNumber: number; text: string; part: number; parts: number };
export type Chunk = { index: number; segments: Segment[]; chars: number };

export function splitLongText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf('\n', maxChars);
    if (cut < maxChars * 0.5) cut = maxChars; // no usable line break → hard split
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}

export function chunkPages(pages: PageText[], maxChars: number, minVisibleChars = 1): Chunk[] {
  const ordered = [...pages]
    .filter((p) => visibleCharCount(p.text) >= minVisibleChars)
    .sort((a, b) => a.pageNumber - b.pageNumber);

  const chunks: Chunk[] = [];
  let current: Chunk = { index: 0, segments: [], chars: 0 };
  const flush = () => {
    if (current.segments.length > 0) {
      chunks.push(current);
      current = { index: chunks.length, segments: [], chars: 0 };
    }
  };

  for (const page of ordered) {
    const parts = splitLongText(page.text, maxChars);
    parts.forEach((text, i) => {
      if (current.chars > 0 && current.chars + text.length > maxChars) flush();
      current.segments.push({ pageNumber: page.pageNumber, text, part: i + 1, parts: parts.length });
      current.chars += text.length;
    });
  }
  flush();
  return chunks;
}

export function formatChunkForPrompt(chunk: Chunk): string {
  return chunk.segments
    .map((s) => `=== PAGE ${s.pageNumber}${s.parts > 1 ? ` (part ${s.part} of ${s.parts})` : ''} ===\n${s.text}`)
    .join('\n\n');
}
