/**
 * Server-side validation of a model answer. The answer is used only if
 * EVERY sentence cites real retrieved items and contains no number, date or
 * judgement the cited items don't support. Otherwise it is rejected as a
 * whole and the deterministic, record-built answer is returned instead.
 */
import type { Citable, Sentence } from './retrieve.ts';

export type AnswerCheck =
  | { ok: true; status: 'answered'; sentences: Sentence[] }
  | { ok: true; status: 'insufficient' }
  | { ok: false; reason: 'malformed' | 'no_citation' | 'unknown_citation' | 'unsupported_number' | 'forbidden_language' | 'too_long' };

const FORBIDDEN =
  /\b(diagnos\w*|you (?:likely |probably |may )?have (?:diabetes|hypertension|cancer|disease)|should (?:take|stop|start|increase|decrease|consider)|recommend\w*|treat(?:ment|ed|ing)?|prescribe|dosage|worsen\w*|improv\w*|deteriorat\w*|normal|abnormal|healthy|unhealthy|risk|dangerous|because|due to|caused?|leads? to|good|bad|concerning)\b/i;

// Exact month names only ("May" is skipped: it is also a verb; the day and year numbers are still checked).
const MONTH_WORDS = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi;
const month = (m: string) => m.slice(0, 3).toLowerCase();

function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(',', '.')).map((n) => String(Number(n)));
}

export function validateAnswer(raw: unknown, items: Citable[]): AnswerCheck {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'malformed' };
  const { status, sentences } = raw as { status?: unknown; sentences?: unknown };
  if (status === 'insufficient') return { ok: true, status: 'insufficient' };
  if (status !== 'answered' || !Array.isArray(sentences) || sentences.length === 0) return { ok: false, reason: 'malformed' };
  if (sentences.length > 12) return { ok: false, reason: 'too_long' };
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: Sentence[] = [];
  for (const s of sentences) {
    if (!s || typeof s !== 'object' || typeof (s as Sentence).text !== 'string' || !Array.isArray((s as Sentence).citations)) return { ok: false, reason: 'malformed' };
    const text = (s as Sentence).text.trim();
    const citations = [...new Set((s as Sentence).citations)];
    if (!text || text.length > 500) return { ok: false, reason: 'too_long' };
    if (citations.length === 0) return { ok: false, reason: 'no_citation' };
    if (citations.some((c) => typeof c !== 'string' || !byId.has(c))) return { ok: false, reason: 'unknown_citation' };
    if (FORBIDDEN.test(text)) return { ok: false, reason: 'forbidden_language' };
    const support = citations.map((c) => byId.get(c)!.text).join(' ');
    const supported = new Set(numbersIn(support));
    // Citation labels like "R1" are not facts.
    const claimed = numbersIn(text.replace(/\b[RTCE]\d+\b/g, ''));
    if (claimed.some((n) => !supported.has(n))) return { ok: false, reason: 'unsupported_number' };
    const months = new Set([...support.matchAll(MONTH_WORDS)].map((m) => month(m[1])));
    if ([...text.matchAll(MONTH_WORDS)].some((m) => !months.has(month(m[1])))) return { ok: false, reason: 'unsupported_number' };
    out.push({ text, citations });
  }
  return { ok: true, status: 'answered', sentences: out };
}
