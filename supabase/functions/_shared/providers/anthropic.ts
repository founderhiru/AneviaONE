/**
 * Anthropic Messages API extractor (fetch-based, forced tool call for JSON).
 * Sends ONLY the chunk text + fixed instructions (see docs/AI_DATA_FLOW.md).
 * Never logs prompts, responses or provider error bodies.
 */
import { EXTRACTION_TOOL, SYSTEM_PROMPT } from './prompt.ts';
import { ExtractorError, type StructuredExtractor } from './extractor.ts';

export type AnthropicOptions = {
  apiKey: string;
  model: string;
  inferenceGeo: 'us' | 'global';
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxOutputTokens?: number;
  baseUrl?: string;
};

export const ANTHROPIC_VERSION = '2023-06-01';

export function createAnthropicExtractor(opts: AnthropicOptions): StructuredExtractor {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`;
  return {
    async extract(chunkText) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);
      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
          body: JSON.stringify({
            model: opts.model,
            max_tokens: opts.maxOutputTokens ?? 16_000,
            system: SYSTEM_PROMPT,
            tools: [EXTRACTION_TOOL],
            tool_choice: { type: 'tool', name: EXTRACTION_TOOL.name },
            inference_geo: opts.inferenceGeo,
            messages: [{ role: 'user', content: `Document text follows.\n\n${chunkText}` }],
          }),
        });
      } catch {
        throw new ExtractorError('provider_unavailable'); // network error or timeout
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        // Drain without reading: bodies can echo request content.
        try { await res.body?.cancel(); } catch { /* ignore */ }
        const s = res.status;
        if (s === 401 || s === 403) throw new ExtractorError('provider_auth', s);
        if (s === 408 || s === 409 || s === 429 || s >= 500) throw new ExtractorError('provider_unavailable', s);
        throw new ExtractorError('provider_rejected', s);
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new ExtractorError('extraction_invalid_output');
      }
      const body = json as { stop_reason?: string; content?: { type?: string; name?: string; input?: unknown }[]; usage?: { input_tokens?: number; output_tokens?: number } };
      const usage = { inputTokens: Number(body.usage?.input_tokens) || 0, outputTokens: Number(body.usage?.output_tokens) || 0 };
      if (body.stop_reason === 'max_tokens') throw new ExtractorError('extraction_too_large');
      const block = Array.isArray(body.content) ? body.content.find((b) => b?.type === 'tool_use' && b.name === EXTRACTION_TOOL.name) : undefined;
      if (!block || typeof block.input !== 'object' || block.input === null) throw new ExtractorError('extraction_invalid_output');
      return { output: block.input, usage };
    },
  };
}
