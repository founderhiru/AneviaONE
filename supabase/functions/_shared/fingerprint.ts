/** Stable fact fingerprints for idempotent re-processing. */
import { normalizeText } from './text.ts';

const encoder = new TextEncoder();

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash of the fields that identify a fact within a document. Wording of the
 * model's quote and the confidence are deliberately excluded so re-running
 * the extraction on the same report yields the same fingerprint.
 */
export function factFingerprint(parts: (string | number | null | undefined)[]): Promise<string> {
  const canonical = parts
    .map((p) => (p === null || p === undefined ? '' : normalizeText(String(p)).toLowerCase()))
    .join('\u001f');
  return sha256Hex(canonical);
}
