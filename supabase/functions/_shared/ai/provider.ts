/**
 * The ONLY module that talks to an AI provider SDK. Everything else depends
 * on the provider-neutral `JsonModelProvider` interface, so the provider is
 * replaceable and every call goes through the same error mapping.
 *
 * Output is requested as strict JSON (structured outputs) but callers must
 * still treat it as untrusted and validate it before using it.
 */

import Anthropic from '@anthropic-ai/sdk';

import { EngineError, isEngineError, type ProviderDiagnostics, USER_MESSAGES } from '../health-engine/errors.ts';

export type JsonRequest = {
  system: string;
  /** The user-turn content (already minimised by the caller). */
  content: string;
  /** Optional original PDF, sent as a document the model reads visually
   * (scanned / image-only reports — see health-engine/ocr.ts). */
  pdf?: Uint8Array;
  /** JSON schema for the answer. Must never contain personal or health data. */
  schema: Record<string, unknown>;
  maxTokens: number;
  effort?: 'low' | 'medium' | 'high';
};

export interface JsonModelProvider {
  readonly provider: string;
  readonly model: string;
  /** Returns the parsed JSON answer (unvalidated). Throws EngineError. */
  generateJson(request: JsonRequest): Promise<unknown>;
}

const fail = (code: string, userMessage: string, cause: unknown, diagnostics: ProviderDiagnostics = {}) =>
  new EngineError('provider', code, userMessage, { cause, diagnostics });

/**
 * Maps SDK errors to a stable code and the retry policy. Provider messages
 * are never surfaced to the app or stored; the HTTP status, error type,
 * request id and the message truncated to 200 characters are kept as
 * server-side log diagnostics only.
 *
 *   provider_auth               401  key missing/invalid/revoked
 *   provider_permission_denied  403  key valid but not allowed (workspace, model, region)
 *   provider_billing            402  account billing problem
 *   provider_model_unavailable  404  ANTHROPIC_MODEL unknown or not enabled for this key
 *   provider_bad_request        400/413/422  request rejected (format, schema, size)
 *   provider_rate_limited       429
 *   provider_unavailable        5xx/529
 *   provider_timeout            no response within the client timeout
 *   provider_connection         network failure
 */
/** The provider's own error message (not the SDK's "400 {json}" wrapper), truncated. */
function providerMessage(error: InstanceType<typeof Anthropic.APIError>): string | undefined {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const message = body?.error?.message;
  // Defensive: never let anything key-shaped through, even if a provider echoed one.
  return typeof message === 'string' ? message.replace(/sk-ant-[\w-]*/g, '[redacted]').replace(/\s+/g, ' ').slice(0, 200) : undefined;
}

export function classifyProviderError(error: unknown): EngineError {
  if (isEngineError(error)) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new EngineError('transient', 'provider_timeout', USER_MESSAGES.generic, { cause: error });
  if (error instanceof Anthropic.APIConnectionError) return new EngineError('transient', 'provider_connection', USER_MESSAGES.generic, { cause: error });
  if (error instanceof Anthropic.APIError) {
    const diagnostics: ProviderDiagnostics = {
      http_status: typeof error.status === 'number' ? error.status : undefined,
      provider_error_type: typeof error.type === 'string' ? error.type : undefined,
      provider_request_id: typeof error.requestID === 'string' ? error.requestID : undefined,
      provider_error_message: providerMessage(error),
    };
    const config = USER_MESSAGES.serviceUnavailable;
    if (error instanceof Anthropic.AuthenticationError) return fail('provider_auth', config, error, diagnostics);
    if (error instanceof Anthropic.PermissionDeniedError) return fail('provider_permission_denied', config, error, diagnostics);
    if (error instanceof Anthropic.NotFoundError) return fail('provider_model_unavailable', config, error, diagnostics);
    if (error instanceof Anthropic.RateLimitError) return fail('provider_rate_limited', USER_MESSAGES.generic, error, diagnostics);
    if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.UnprocessableEntityError || error.status === 413) {
      return fail('provider_bad_request', USER_MESSAGES.generic, error, diagnostics);
    }
    if (error.status === 402) return fail('provider_billing', config, error, diagnostics);
    if (error instanceof Anthropic.InternalServerError) return fail('provider_unavailable', USER_MESSAGES.generic, error, diagnostics);
    return fail('provider_error', USER_MESSAGES.generic, error, diagnostics);
  }
  return new EngineError('transient', 'extractor_error', USER_MESSAGES.generic, { cause: error });
}

/** Base64 for large binaries, in chunks (no stack-size limits). */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export type AnthropicProviderOptions = {
  /** Required. Comes from ANTHROPIC_MODEL; there is deliberately no default. */
  model: string;
  /** "us" keeps inference in US infrastructure (1.1× price); unset uses the workspace default. */
  inferenceGeo?: 'us' | 'global';
};

export class AnthropicJsonProvider implements JsonModelProvider {
  readonly provider = 'anthropic';
  readonly model: string;
  private readonly inferenceGeo?: 'us' | 'global';

  constructor(private readonly client: Anthropic, options: AnthropicProviderOptions) {
    this.model = options.model;
    this.inferenceGeo = options.inferenceGeo;
  }

  async generateJson(request: JsonRequest): Promise<unknown> {
    let message: Anthropic.Message;
    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [
          {
            role: 'user',
            content: request.pdf
              ? [
                  { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: toBase64(request.pdf) } },
                  { type: 'text', text: request.content },
                ]
              : request.content,
          },
        ],
        output_config: {
          effort: request.effort ?? 'high',
          format: { type: 'json_schema', schema: request.schema },
        },
        ...(this.inferenceGeo ? { inference_geo: this.inferenceGeo } : {}),
      });
      message = await stream.finalMessage();
    } catch (error) {
      throw classifyProviderError(error);
    }

    if (message.stop_reason === 'refusal') throw new EngineError('provider', 'provider_refusal', USER_MESSAGES.generic);
    if (message.stop_reason === 'max_tokens') throw new EngineError('validation', 'output_truncated', USER_MESSAGES.generic);

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    try {
      return JSON.parse(text);
    } catch {
      throw new EngineError('validation', 'invalid_json', USER_MESSAGES.generic);
    }
  }
}

/**
 * Stand-in when the provider isn't configured: every call fails with a
 * classified, non-retryable-in-practice error naming the missing variables
 * (names only) in server-side diagnostics. Lets the function boot and report
 * the problem instead of crashing on a missing secret.
 */
export class UnconfiguredProvider implements JsonModelProvider {
  readonly provider = 'anthropic';
  readonly model: string;
  constructor(readonly missing: string[], model?: string) {
    this.model = model ?? 'unconfigured';
  }
  generateJson(): Promise<unknown> {
    return Promise.reject(
      new EngineError('provider', 'provider_not_configured', USER_MESSAGES.serviceUnavailable, { diagnostics: { missing_config: this.missing.join(',') } }),
    );
  }
}

export type ProviderEnv = { get(name: string): string | undefined };

/**
 * Builds the configured provider from server-side environment (Supabase Edge
 * Function secrets). The ONLY place the API key is read; it goes straight to
 * the SDK client and is never stored elsewhere, returned or logged.
 *
 *   ANTHROPIC_API_KEY        required
 *   ANTHROPIC_MODEL          required, e.g. claude-opus-5-5
 *   ANTHROPIC_INFERENCE_GEO  optional: "us" | "global"
 *   ANTHROPIC_TIMEOUT_MS     optional: client timeout per attempt (SDK default otherwise)
 *   ANTHROPIC_MAX_RETRIES    optional: SDK retries for 408/409/429/5xx/connection (default 2)
 */
export function providerFromEnv(env: ProviderEnv, fetchImpl?: typeof fetch): { provider: JsonModelProvider; configured: boolean; missing: string[] } {
  const apiKey = env.get('ANTHROPIC_API_KEY')?.trim();
  const model = env.get('ANTHROPIC_MODEL')?.trim();
  const missing = [...(apiKey ? [] : ['ANTHROPIC_API_KEY']), ...(model ? [] : ['ANTHROPIC_MODEL'])];
  if (!apiKey || !model) return { provider: new UnconfiguredProvider(missing, model), configured: false, missing };

  const geo = env.get('ANTHROPIC_INFERENCE_GEO');
  const timeout = Number(env.get('ANTHROPIC_TIMEOUT_MS'));
  const retries = Number(env.get('ANTHROPIC_MAX_RETRIES'));
  const client = new Anthropic({
    apiKey,
    ...(Number.isFinite(timeout) && timeout > 0 ? { timeout } : {}),
    ...(env.get('ANTHROPIC_MAX_RETRIES') && Number.isInteger(retries) && retries >= 0 ? { maxRetries: retries } : {}),
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
  const provider = new AnthropicJsonProvider(client, { model, inferenceGeo: geo === 'us' || geo === 'global' ? geo : undefined });
  return { provider, configured: true, missing: [] };
}
