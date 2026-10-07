/**
 * providerFromEnv and provider error classification, on a fake fetch: no
 * network and no real key. The fake key is a sentinel that must never appear
 * in an error, diagnostic or log line.
 */
import Anthropic from '@anthropic-ai/sdk';
import { assertEquals, assertRejects } from '@std/assert';

import { EngineError, USER_MESSAGES } from '../../health-engine/errors.ts';
import { redact } from '../../health-engine/log.ts';
import { classifyProviderError, providerFromEnv } from '../provider.ts';

const SENTINEL_KEY = 'sk-ant-test-SENTINEL-must-not-leak';
const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });
const REQUEST = { system: 's', content: 'c', schema: { type: 'object' }, maxTokens: 10 };

function ok(): Response {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"a":1}' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
}

Deno.test('missing configuration → provider_not_configured, names only, no SDK call', async () => {
  let calls = 0;
  const fetchSpy = (() => (calls++, Promise.resolve(ok()))) as unknown as typeof fetch;
  for (const [vars, missing] of [
    [{}, 'ANTHROPIC_API_KEY,ANTHROPIC_MODEL'],
    [{ ANTHROPIC_MODEL: 'm' }, 'ANTHROPIC_API_KEY'],
    [{ ANTHROPIC_API_KEY: SENTINEL_KEY }, 'ANTHROPIC_MODEL'],
    [{ ANTHROPIC_API_KEY: '  ', ANTHROPIC_MODEL: 'm' }, 'ANTHROPIC_API_KEY'],
  ] as [Record<string, string>, string][]) {
    const ai = providerFromEnv(env(vars), fetchSpy);
    assertEquals(ai.configured, false);
    const error = await assertRejects(() => ai.provider.generateJson(REQUEST), EngineError);
    assertEquals([error.kind, error.code, error.userMessage], ['provider', 'provider_not_configured', USER_MESSAGES.serviceUnavailable]);
    assertEquals(error.diagnostics.missing_config, missing);
    assertEquals(JSON.stringify({ ...error, m: error.message }).includes('SENTINEL'), false);
  }
  assertEquals(calls, 0);
});

Deno.test('configured: model comes from ANTHROPIC_MODEL, key only in the auth header', async () => {
  const seen: { body: Record<string, unknown>; headers: Headers }[] = [];
  const fetchFake = ((_url: string, init?: RequestInit) => {
    seen.push({ body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
    return Promise.resolve(ok());
  }) as unknown as typeof fetch;
  const ai = providerFromEnv(env({ ANTHROPIC_API_KEY: SENTINEL_KEY, ANTHROPIC_MODEL: ' configured-model ', ANTHROPIC_INFERENCE_GEO: 'us' }), fetchFake);
  assertEquals(ai.configured, true);
  assertEquals(ai.provider.model, 'configured-model');
  assertEquals(await ai.provider.generateJson(REQUEST), { a: 1 });
  assertEquals(seen[0].body.model, 'configured-model');
  assertEquals(seen[0].body.inference_geo, 'us');
  assertEquals(seen[0].headers.get('x-api-key'), SENTINEL_KEY);
  assertEquals(JSON.stringify(seen[0].body).includes('SENTINEL'), false);
});

Deno.test('401 with a configured key: classified, diagnostics loggable, key never present', async () => {
  const fetchFake = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key ${SENTINEL_KEY}` } }), {
        status: 401,
        headers: { 'content-type': 'application/json', 'request-id': 'req_abc' },
      }),
    )) as unknown as typeof fetch;
  const ai = providerFromEnv(env({ ANTHROPIC_API_KEY: SENTINEL_KEY, ANTHROPIC_MODEL: 'm', ANTHROPIC_MAX_RETRIES: '0' }), fetchFake);
  const error = await assertRejects(() => ai.provider.generateJson(REQUEST), EngineError);
  assertEquals(error.code, 'provider_auth');
  const line = JSON.stringify(redact({ event: 'document_failed', error_code: error.code, ...error.diagnostics }));
  assertEquals(line, JSON.stringify({ event: 'document_failed', error_code: 'provider_auth', http_status: 401, provider_error_type: 'authentication_error', provider_request_id: 'req_abc', provider_error_message: 'invalid x-api-key [redacted]' }));
  for (const text of [line, error.message, error.userMessage]) assertEquals(text.includes('SENTINEL'), false);
});

Deno.test('timeout and connection failures are transient and distinct', () => {
  assertEquals(classifyProviderError(new Anthropic.APIConnectionTimeoutError()).code, 'provider_timeout');
  assertEquals(classifyProviderError(new Anthropic.APIConnectionTimeoutError()).kind, 'transient');
  assertEquals(classifyProviderError(new Anthropic.APIConnectionError({ message: 'x' })).code, 'provider_connection');
  const already = new EngineError('provider', 'provider_not_configured', USER_MESSAGES.serviceUnavailable);
  assertEquals(classifyProviderError(already), already);
});

Deno.test('provider message is truncated to 200 characters in logs', () => {
  const long = new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'x'.repeat(500) } }, undefined, new Headers());
  const line = redact({ ...classifyProviderError(long).diagnostics });
  assertEquals(String(line.provider_error_message).length, 200);
});
