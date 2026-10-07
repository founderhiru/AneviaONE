/**
 * Service-layer error model. Screens only ever show `userMessage`, which is
 * written for people — never a raw database/storage/network message, which
 * could leak backend details. The underlying cause is logged in development
 * builds only.
 */

export type ServiceErrorCode =
  | 'not_configured'
  | 'not_signed_in'
  | 'network'
  | 'permission'
  | 'not_found'
  | 'invalid_file'
  | 'upload_failed'
  | 'save_failed'
  | 'rate_limited'
  | 'invalid_code'
  | 'not_available'
  | 'consent_required'
  | 'unknown';

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly userMessage: string;
  /** Whether trying the same action again may succeed. */
  readonly retryable: boolean;

  constructor(code: ServiceErrorCode, userMessage: string, options: { retryable?: boolean; cause?: unknown } = {}) {
    super(userMessage);
    this.name = 'ServiceError';
    this.code = code;
    this.userMessage = userMessage;
    this.retryable = options.retryable ?? false;
    if (options.cause !== undefined && __DEV__) {
      console.warn(`[ServiceError:${code}]`, options.cause);
    }
  }
}

export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

type BackendError = { message?: string; status?: number; statusCode?: string | number; code?: string };

/** True for errors that look like connectivity problems. */
export function isNetworkError(error: unknown): boolean {
  const message = String((error as BackendError)?.message ?? error ?? '').toLowerCase();
  return message.includes('network request failed') || message.includes('failed to fetch') || message.includes('timeout');
}

/** Converts any thrown value into a safe ServiceError. */
export function toServiceError(error: unknown, fallback: { code: ServiceErrorCode; userMessage: string; retryable?: boolean }): ServiceError {
  if (error instanceof ServiceError) return error;
  if (isNetworkError(error)) {
    return new ServiceError('network', 'You appear to be offline. Check your connection and try again.', {
      retryable: true,
      cause: error,
    });
  }
  const status = Number((error as BackendError)?.status ?? (error as BackendError)?.statusCode);
  if (status === 401 || status === 403) {
    return new ServiceError('permission', 'Your session has expired. Please sign in again.', { cause: error });
  }
  if (status === 429) {
    return new ServiceError('rate_limited', 'Too many attempts. Please wait a minute and try again.', {
      retryable: true,
      cause: error,
    });
  }
  return new ServiceError(fallback.code, fallback.userMessage, { retryable: fallback.retryable, cause: error });
}
