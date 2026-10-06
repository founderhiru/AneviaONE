import { createAnthropicExtractor } from '../../../supabase/functions/_shared/providers/anthropic.ts';
import { ExtractorError } from '../../../supabase/functions/_shared/providers/extractor.ts';
import { NoOcrProvider } from '../../../supabase/functions/_shared/providers/ocr.ts';
import { EXTRACTION_TOOL, SYSTEM_PROMPT } from '../../../supabase/functions/_shared/providers/prompt.ts';

describe('OcrProvider boundary', () => {
  it('has no implementation in Gate 1', async () => {
    const ocr = new NoOcrProvider();
    expect(ocr.available).toBe(false);
    await expect(ocr.recognize()).rejects.toThrow('ocr_not_implemented');
  });
});

describe('Anthropic extractor', () => {
  const ok = (input: unknown, extra: object = {}) =>
    new Response(JSON.stringify({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'record_extraction', input }], usage: { input_tokens: 10, output_tokens: 5 }, ...extra }), { status: 200 });
  const make = (fetchImpl: typeof fetch) => createAnthropicExtractor({ apiKey: 'sk-test-key', model: 'claude-sonnet-5-5', inferenceGeo: 'us', fetchImpl });

  it('sends only instructions + the chunk text, with forced tool use', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ex = make((async (url: string, init: RequestInit) => { calls.push({ url, init }); return ok({ a: 1 }); }) as never);
    const r = await ex.extract('=== PAGE 1 ===\nHbA1c 5.8 %');
    expect(r).toEqual({ output: { a: 1 }, usage: { inputTokens: 10, outputTokens: 5 } });
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.inference_geo).toBe('us');
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_extraction' });
    expect(body.system).toBe(SYSTEM_PROMPT);
    expect(body.tools[0]).toEqual(EXTRACTION_TOOL);
    expect(body.messages).toHaveLength(1);
    expect(Object.keys(body).sort()).toEqual(['inference_geo', 'max_tokens', 'messages', 'model', 'system', 'tool_choice', 'tools']);
    expect(body.messages[0].content).toContain('HbA1c 5.8 %');
  });
  it.each([
    [401, 'provider_auth'], [403, 'provider_auth'], [429, 'provider_unavailable'], [500, 'provider_unavailable'],
    [529, 'provider_unavailable'], [400, 'provider_rejected'], [404, 'provider_rejected'],
  ])('HTTP %i → %s', async (status, code) => {
    const ex = make((async () => new Response('{"error":"echoes HbA1c 5.8"}', { status })) as never);
    const err = await ex.extract('x').catch((e) => e);
    expect(err).toBeInstanceOf(ExtractorError);
    expect(err.code).toBe(code);
    expect(err.message).toBe(code); // provider body is never carried
  });
  it('network failure / timeout → provider_unavailable', async () => {
    const ex = make((async () => { throw new Error('boom HbA1c'); }) as never);
    await expect(ex.extract('x')).rejects.toMatchObject({ code: 'provider_unavailable' });
  });
  it('truncated output and missing tool call are distinguished', async () => {
    await expect(make((async () => ok({}, { stop_reason: 'max_tokens' })) as never).extract('x')).rejects.toMatchObject({ code: 'extraction_too_large' });
    await expect(make((async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'hi' }] }), { status: 200 })) as never).extract('x'))
      .rejects.toMatchObject({ code: 'extraction_invalid_output' });
    await expect(make((async () => new Response('not json', { status: 200 })) as never).extract('x')).rejects.toMatchObject({ code: 'extraction_invalid_output' });
  });
  it('the tool schema requires evidence on every fact type', () => {
    const props = EXTRACTION_TOOL.input_schema.properties as Record<string, { items?: { required: string[] } }>;
    for (const k of ['observations', 'medications', 'conditions', 'allergies', 'procedures', 'encounters']) {
      expect(props[k].items!.required).toEqual(expect.arrayContaining(['page_number', 'source_text', 'confidence']));
    }
  });
});
