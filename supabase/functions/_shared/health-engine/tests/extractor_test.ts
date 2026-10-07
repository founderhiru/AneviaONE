/**
 * AnthropicStructuredExtractor against a fake fetch (no network, no real
 * provider). Verifies exactly what would be sent and how every provider
 * outcome maps to the retry policy.
 */
import Anthropic from '@anthropic-ai/sdk';
import { assertEquals, assertRejects } from '@std/assert';

import { EngineError, USER_MESSAGES } from '../errors.ts';
import { EXTRACTION_JSON_SCHEMA } from '../extraction-schema.ts';
import { AnthropicStructuredExtractor, EXTRACTION_SYSTEM_PROMPT } from '../extractor.ts';
import type { Page } from '../validate.ts';

const PAGES: Page[] = [{ page_number: 1, text: 'HbA1c 5.8 % 4.0 - 5.6' }];

function sse(text: string, stopReason = 'end_turn'): Response {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 5 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  const body = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function errorResponse(status: number, type = 'api_error'): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message: 'provider detail that must not leak' }, request_id: 'req_test_1' }), {
    status,
    headers: { 'content-type': 'application/json', 'request-id': 'req_test_1' },
  });
}

function make(respond: () => Response | Promise<Response>, options: { inferenceGeo?: 'us' | 'global' } = {}) {
  const requests: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const client = new Anthropic({
    apiKey: 'test-key',
    maxRetries: 0,
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
      return await respond();
    },
  });
  return { extractor: new AnthropicStructuredExtractor(client, { model: 'test-model', ...options }), requests };
}

const VALID = JSON.stringify({ patient_name: null, patient_date_of_birth: null, report_date: null, observations: [], medications: [], conditions: [], allergies: [], procedures: [], encounters: [] });

Deno.test('request: page text only, strict JSON schema, no fallbacks, no PHI in the schema', async () => {
  const { extractor, requests } = make(() => sse(VALID));
  const result = await extractor.extract(PAGES);
  assertEquals((result as { observations: unknown[] }).observations, []);
  assertEquals(requests.length, 1);
  const { url, body } = requests[0];
  assertEquals(url.endsWith('/v1/messages'), true);
  assertEquals(body.model, 'test-model'); // always the configured ANTHROPIC_MODEL
  assertEquals(body.stream, true);
  assertEquals(body.system, EXTRACTION_SYSTEM_PROMPT);
  assertEquals(body.messages, [{ role: 'user', content: '<page number="1">\nHbA1c 5.8 % 4.0 - 5.6\n</page>' }]);
  assertEquals(body.output_config, { effort: 'high', format: { type: 'json_schema', schema: EXTRACTION_JSON_SCHEMA } });
  // No tools, no files, no server-side fallbacks, no metadata identifying the person.
  for (const key of ['tools', 'fallbacks', 'metadata', 'container', 'inference_geo']) assertEquals(key in body, false, key);
  // The schema (cached by the provider for up to 24h) carries no report data.
  const schemaText = JSON.stringify(EXTRACTION_JSON_SCHEMA);
  for (const s of ['HbA1c', 'Asha', 'Verma', '1985']) assertEquals(schemaText.includes(s), false);
});

Deno.test('request: inference_geo is sent only when configured', async () => {
  const { extractor, requests } = make(() => sse(VALID), { inferenceGeo: 'us' });
  await extractor.extract(PAGES);
  assertEquals(requests[0].body.inference_geo, 'us');
});

Deno.test('refusal → provider failure; truncation / bad JSON → validation failure', async () => {
  await assertRejects(() => make(() => sse('', 'refusal')).extractor.extract(PAGES), EngineError, 'provider_refusal');
  await assertRejects(() => make(() => sse('{"observ', 'max_tokens')).extractor.extract(PAGES), EngineError, 'output_truncated');
  await assertRejects(() => make(() => sse('not json')).extractor.extract(PAGES), EngineError, 'invalid_json');
});

Deno.test('HTTP errors map to the retry policy, without the provider message', async () => {
  const cases: [number, string, string, string][] = [
    [429, 'provider_rate_limited', 'rate_limit_error', USER_MESSAGES.generic],
    [401, 'provider_auth', 'authentication_error', USER_MESSAGES.serviceUnavailable],
    [403, 'provider_permission_denied', 'permission_error', USER_MESSAGES.serviceUnavailable],
    [402, 'provider_billing', 'billing_error', USER_MESSAGES.serviceUnavailable],
    [404, 'provider_model_unavailable', 'not_found_error', USER_MESSAGES.serviceUnavailable],
    [400, 'provider_bad_request', 'invalid_request_error', USER_MESSAGES.generic],
    [413, 'provider_bad_request', 'request_too_large', USER_MESSAGES.generic],
    [500, 'provider_unavailable', 'api_error', USER_MESSAGES.generic],
    [529, 'provider_unavailable', 'overloaded_error', USER_MESSAGES.generic],
  ];
  for (const [status, code, type, userMessage] of cases) {
    const error = await assertRejects(() => make(() => errorResponse(status, type)).extractor.extract(PAGES), EngineError);
    assertEquals([error.kind, error.code, error.userMessage], ['provider', code, userMessage], `HTTP ${status}`);
    // Server-side (log-only) diagnostics: status, type, request id, truncated provider message.
    assertEquals(error.diagnostics, { http_status: status, provider_error_type: type, provider_request_id: 'req_test_1', provider_error_message: 'provider detail that must not leak' });
    // …and the provider message never reaches the app-facing fields.
    for (const text of [error.message, error.userMessage]) assertEquals(text.includes('provider detail'), false);
  }
  const offline = await assertRejects(
    () => make(() => Promise.reject(new TypeError('network down'))).extractor.extract(PAGES),
    EngineError,
  );
  assertEquals([offline.kind, offline.code], ['transient', 'provider_connection']);
});
