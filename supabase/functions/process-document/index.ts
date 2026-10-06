/**
 * Entry point (Supabase Edge Function, Deno). Wires real dependencies into the
 * tested handler. Secrets are read ONLY here, from the function environment.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as unpdf from 'npm:unpdf@1';
import { loadRuntimeConfig } from '../_shared/config.ts';
import { sha256Hex } from '../_shared/fingerprint.ts';
import { createAnthropicExtractor } from '../_shared/providers/anthropic.ts';
import { createUnpdfPageTextProvider, type UnpdfLike } from '../_shared/providers/pageText.ts';
import { createHandler } from './handler.ts';
import { createSupabaseDb } from './supabaseDb.ts';

const loaded = loadRuntimeConfig((name) => Deno.env.get(name));

Deno.serve(async (req) => {
  if (!loaded.ok) {
    // Names of missing secrets only — never values.
    console.error(JSON.stringify({ event: 'misconfigured', missing: loaded.missing }));
    return new Response(JSON.stringify({ error: 'processing_not_enabled' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
  const config = loaded.config;
  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const handler = createHandler({
    config,
    async authenticate(header) {
      const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return null;
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    db: createSupabaseDb(admin),
    async download(bucket, path) {
      const { data, error } = await admin.storage.from(bucket).download(path);
      if (error || !data) throw new Error('download_failed');
      return new Uint8Array(await data.arrayBuffer());
    },
    pageText: createUnpdfPageTextProvider(unpdf as unknown as UnpdfLike),
    extractor: createAnthropicExtractor({ apiKey: config.anthropicApiKey, model: config.anthropicModel, inferenceGeo: config.inferenceGeo }),
    sha256: sha256Hex,
    now: () => Date.now(),
    log: (e) => console.log(JSON.stringify(e)),
  });
  return handler(req);
});
