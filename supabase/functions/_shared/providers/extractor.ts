/** StructuredExtractor — the only thing that talks to a language model. */

export type ExtractorErrorCode =
  | 'provider_unavailable' // network, 429, 5xx, 529 — retry later
  | 'provider_auth' // 401/403 — configuration problem on our side
  | 'provider_rejected' // other 4xx — retrying the same request will not help
  | 'extraction_invalid_output' // no tool call / not JSON — one retry may help
  | 'extraction_too_large'; // output truncated

export class ExtractorError extends Error {
  constructor(readonly code: ExtractorErrorCode, readonly status?: number) {
    super(code); // never include provider bodies: they may echo health text
    this.name = 'ExtractorError';
  }
}

export type ExtractorUsage = { inputTokens: number; outputTokens: number };

export interface StructuredExtractor {
  /**
   * `chunkText` is already formatted (`=== PAGE n ===` markers). Returns the
   * model's raw JSON object; it is NOT trusted — the pipeline validates it.
   */
  extract(chunkText: string): Promise<{ output: unknown; usage: ExtractorUsage }>;
}
