/**
 * process-document — Gate 1 document understanding.
 *
 * Wiring only: real Supabase (service role), real storage, unpdf text
 * extraction, the scan transcription step and the Anthropic extractor. All logic lives in
 * ../_shared/health-engine/ and is unit-tested there with fakes.
 *
 * Secrets (Supabase Edge Function secrets, never in the app):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — provided by Supabase
 *   AI_CONSENT_VERSION                       — must match the app's consent text version
 *   ANTHROPIC_API_KEY, ANTHROPIC_MODEL       — required for report reading; read only by
 *                                              ../_shared/ai/provider.ts (see providerFromEnv).
 *                                              If missing, the function still boots and each
 *                                              document fails as provider_not_configured.
 */

import { createClient } from '@supabase/supabase-js';

import { providerFromEnv } from '../_shared/ai/provider.ts';
import { ModelStructuredExtractor } from '../_shared/health-engine/extractor.ts';
import { createProcessDocumentHandler } from '../_shared/health-engine/handler.ts';
import { consoleLogger } from '../_shared/health-engine/log.ts';
import { ModelOcrProvider } from '../_shared/health-engine/ocr.ts';
import { UnpdfPageTextProvider } from '../_shared/health-engine/pages.ts';
import { supabaseAuthenticate, supabaseEngineDb, supabaseEngineStorage } from '../_shared/health-engine/supabase-adapter.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const required = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret ${name}`);
  return value;
};

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ai = providerFromEnv(Deno.env);
if (!ai.configured) consoleLogger.error({ event: 'provider_not_configured', error_code: 'provider_not_configured', missing_config: ai.missing.join(',') });

const handler = createProcessDocumentHandler({
  authenticate: supabaseAuthenticate(admin),
  db: supabaseEngineDb(admin),
  storage: supabaseEngineStorage(admin),
  pageText: new UnpdfPageTextProvider(() => import('unpdf')),
  // Scanned / image-only reports (camera captures): transcribed, then read as text.
  ocr: new ModelOcrProvider(ai.provider),
  extractor: new ModelStructuredExtractor(ai.provider),
  log: consoleLogger,
  config: { consentVersion: required('AI_CONSENT_VERSION'), maxAttempts: 3 },
  background: (task) => {
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(task);
    else void task;
  },
});

Deno.serve(handler);
