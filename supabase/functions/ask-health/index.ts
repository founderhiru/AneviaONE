/**
 * ask-health — Gate 3: grounded answers about the caller's own recorded
 * health history. Logic: ../_shared/health-ask/ (unit-tested there).
 *
 * Secrets: SUPABASE_URL, SUPABASE_ANON_KEY (provided by Supabase),
 * AI_CONSENT_VERSION (must match the app), ANTHROPIC_API_KEY + ANTHROPIC_MODEL
 * (read only by ../_shared/ai/provider.ts; without them answers are
 * record-built only and the gap is logged server-side).
 */
import { providerFromEnv } from '../_shared/ai/provider.ts';
import { createAskHandler } from '../_shared/health-ask/handler.ts';
import { ProviderAskModel } from '../_shared/health-ask/model.ts';
import { consoleLogger } from '../_shared/health-engine/log.ts';
import { supabaseRecordSource } from '../_shared/health-memory/records.ts';
import { authenticateJwt, requiredEnv, userClient } from '../_shared/user-client.ts';

const consentVersion = requiredEnv('AI_CONSENT_VERSION');

const ai = providerFromEnv(Deno.env);
if (!ai.configured) consoleLogger.error({ event: 'provider_not_configured', error_code: 'provider_not_configured', missing_config: ai.missing.join(',') });
const model = ai.configured ? new ProviderAskModel(ai.provider) : null;

/** Both AI consents granted at the current version — read as the caller (RLS). */
async function hasAiConsentFor(jwt: string): Promise<boolean> {
  const { data, error } = await userClient(jwt)
    .from('current_consents')
    .select('consent_type, granted, policy_version')
    .in('consent_type', ['ai_processing', 'health_data_processing']);
  if (error || !data) return false;
  return ['ai_processing', 'health_data_processing'].every((type) =>
    data.some((r: { consent_type: string; granted: boolean; policy_version: string }) => r.consent_type === type && r.granted && r.policy_version === consentVersion)
  );
}

Deno.serve(
  createAskHandler({
    authenticate: authenticateJwt,
    sourceFor: (jwt) => supabaseRecordSource(userClient(jwt)),
    hasAiConsentFor,
    model,
    log: consoleLogger,
  }),
);
