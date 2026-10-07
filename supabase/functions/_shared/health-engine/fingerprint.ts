/**
 * Fact fingerprints — deterministic identity for idempotency.
 *
 * fingerprint = SHA-256( version | original's SHA-256 | fact kind | page |
 *                        normalized identifying fields )
 *
 * The same report (same bytes) yields the same fingerprints however often it
 * is processed or uploaded, and the database keeps at most one live fact per
 * fingerprint per person (see the Gate 1 migration).
 */

export const FINGERPRINT_VERSION = 'fp1';

export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function factFingerprint(contentSha256: string, parts: string[]): Promise<string> {
  // JSON keeps field boundaries unambiguous ("a|b" + "c" ≠ "a" + "b|c").
  return sha256Hex(JSON.stringify([FINGERPRINT_VERSION, contentSha256, ...parts]));
}
