/**
 * Gate 1 constants. Pure — no environment access except through
 * `loadRuntimeConfig`, which receives the environment as an argument so it can
 * be tested.
 */

/** Must equal the version in docs/AI_DATA_FLOW.md. */
export const DATA_FLOW_VERSION = 'ai-data-flow-v1';
/** Version of the consent text shown in the app (mobile mirrors this). */
export const CONSENT_POLICY_VERSION = 'consent-2026-10-v1';
export const REQUIRED_CONSENTS = ['health_data_processing', 'ai_processing'] as const;

export const PIPELINE_VERSION = 'gate1.0';
export const PROMPT_VERSION = 'extract-v1';

export const LIMITS = {
  /** Documents with more pages than this are not read yet. */
  maxPages: 40,
  /** Characters of page text per provider request (whole pages where possible). */
  maxChunkChars: 24_000,
  /** Provider requests per document. */
  maxChunks: 8,
  /** A page with fewer non-whitespace characters than this has no usable text layer. */
  minPageTextChars: 20,
  /** Total non-whitespace characters below which a PDF counts as scanned/image-only. */
  minDocumentTextChars: 50,
  maxQuoteChars: 500,
  minQuoteChars: 3,
  /** Per-document attempt cap (enforced by the database as well). */
  maxAttempts: 5,
} as const;

/** Facts below this confidence need review before they feed anything. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.75;

export type RuntimeConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
  anthropicApiKey: string;
  anthropicModel: string;
  /** 'us' | 'global' — passed to the provider as `inference_geo`. */
  inferenceGeo: 'us' | 'global';
  confidenceThreshold: number;
  /** True only when the founder has signed off docs/AI_DATA_FLOW.md. */
  dataFlowApproved: boolean;
};

export type EnvReader = (name: string) => string | undefined;

/** Returns the config, or the names of missing secrets (never their values). */
export function loadRuntimeConfig(env: EnvReader): { ok: true; config: RuntimeConfig } | { ok: false; missing: string[] } {
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY'];
  const missing = required.filter((name) => !env(name)?.trim());
  if (missing.length) return { ok: false, missing };

  const geo = (env('ANTHROPIC_INFERENCE_GEO') ?? 'us').trim().toLowerCase();
  const threshold = Number(env('CONFIDENCE_THRESHOLD') ?? DEFAULT_CONFIDENCE_THRESHOLD);

  return {
    ok: true,
    config: {
      supabaseUrl: env('SUPABASE_URL')!.trim(),
      supabaseAnonKey: env('SUPABASE_ANON_KEY')!.trim(),
      serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY')!.trim(),
      anthropicApiKey: env('ANTHROPIC_API_KEY')!.trim(),
      anthropicModel: (env('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5').trim(),
      inferenceGeo: geo === 'global' ? 'global' : 'us',
      confidenceThreshold: Number.isFinite(threshold) && threshold > 0 && threshold <= 1 ? threshold : DEFAULT_CONFIDENCE_THRESHOLD,
      dataFlowApproved: env('AI_DATA_FLOW_APPROVED')?.trim() === DATA_FLOW_VERSION,
    },
  };
}
