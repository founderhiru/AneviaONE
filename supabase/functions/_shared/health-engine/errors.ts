/**
 * Every processing failure is classified, because the class decides the retry
 * policy (see engine_claim_document in the Gate 1 migration):
 *
 *   transient          network, timeout, our infrastructure         → retry
 *   provider           AI provider error, overload or refusal       → retry
 *   validation         extraction failed deterministic validation   → limited retry
 *   unsupported        scanned/image-only, malformed, too long      → no retry
 *   identity_mismatch  report appears to belong to someone else     → review, no retry
 *   consent_required   AI processing not consented                  → retry after consent
 */
export type FailureKind = 'transient' | 'provider' | 'validation' | 'unsupported' | 'identity_mismatch' | 'consent_required';

/** User-facing messages: friendly, honest, never internal detail. */
export const USER_MESSAGES = {
  generic: 'Couldn’t read this report yet. Please try again.',
  scanned: 'Scanned PDFs aren’t supported yet. Report reading needs a PDF with selectable text.',
  malformed: 'This file couldn’t be opened as a PDF.',
  tooLong: 'This report is too long to read automatically yet.',
  identity: 'This report may belong to someone else, so it wasn’t added to your Health Memory. Please check the name and date of birth on the report.',
  consent: 'Allow report reading in the app to read this report.',
  noText: 'No readable text was found in this report.',
  unreadableScan: 'This photo or scan couldn’t be read clearly. Try a sharper, well-lit photo, or upload the original PDF.',
  scanTooLarge: 'This scan is too large to read automatically. Try fewer pages, or upload the original PDF.',
  /** Our configuration or provider account is at fault — not the person's report. */
  serviceUnavailable: 'Report reading is temporarily unavailable. Please try again later.',
} as const;

/**
 * Server-side-only diagnostics for a provider failure. Safe to log: an HTTP
 * status, the provider's error type enum, its opaque request id and its
 * truncated error message. Never a prompt, output or credential. Never sent
 * to the app or stored in the database.
 */
export type ProviderDiagnostics = {
  http_status?: number;
  provider_error_type?: string;
  provider_request_id?: string;
  /**
   * The provider's error message, truncated to 200 characters. Logged only
   * (never stored or returned). Provider validation messages name request
   * parameters, not report content.
   */
  provider_error_message?: string;
  /** Names (never values) of missing configuration variables. */
  missing_config?: string;
};

export class EngineError extends Error {
  readonly diagnostics: ProviderDiagnostics;
  constructor(
    readonly kind: FailureKind,
    /** Short, non-sensitive, machine-readable: ^[a-z0-9_]{1,64}$ */
    readonly code: string,
    readonly userMessage: string,
    options?: { cause?: unknown; diagnostics?: ProviderDiagnostics },
  ) {
    super(code, options);
    this.diagnostics = options?.diagnostics ?? {};
    this.name = 'EngineError';
  }
}

export function isEngineError(error: unknown): error is EngineError {
  return error instanceof EngineError;
}
