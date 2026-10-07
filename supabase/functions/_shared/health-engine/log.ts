/**
 * Structured, redacted logging for document processing.
 *
 * Only an allow-list of non-sensitive keys is ever written: ids, statuses,
 * error codes, counts and timings. Report text, quotes, health values,
 * prompts, model output, names, dates of birth and tokens can't be logged —
 * any other key is dropped, and string values are length-capped.
 */

const ALLOWED_KEYS = new Set([
  'event',
  'document_id',
  'run_id',
  'status',
  'failure_kind',
  'error_code',
  'attempt',
  'pages',
  'chunks',
  'facts_written',
  'facts_needs_review',
  'facts_discarded',
  'facts_duplicate',
  'facts_rejected',
  'duration_ms',
  'model',
  'pipeline_version',
  'text_layer',
  'identity_check',
  'http_status',
  'provider_error_type',
  'provider_request_id',
  'provider_error_message',
  'missing_config',
]);

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export type Logger = { info(fields: LogFields): void; error(fields: LogFields): void };

/** Per-reason rejection counts (`rejected_quote_not_on_page`, …): numbers only. */
const REJECTION_COUNT = /^rejected_[a-z_]{1,40}$/;

export function redact(fields: LogFields): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REJECTION_COUNT.test(key) && typeof value === 'number') {
      safe[key] = value;
      continue;
    }
    if (!ALLOWED_KEYS.has(key) || value === undefined) continue;
    safe[key] = typeof value === 'string' ? value.slice(0, key === 'provider_error_message' ? 200 : 80) : value;
  }
  return safe;
}

export const consoleLogger: Logger = {
  info: (fields) => console.log(JSON.stringify({ level: 'info', ...redact(fields) })),
  error: (fields) => console.error(JSON.stringify({ level: 'error', ...redact(fields) })),
};
