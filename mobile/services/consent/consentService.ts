import { isDemoMode } from '../../config/appMode';
import { ServiceError, toServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';

/**
 * Consent to read reports with AI (Gate 1).
 *
 * Two explicit, versioned consents are recorded together in the append-only
 * `consents` ledger (supabase/migrations/…_health_profile_consents_audit.sql):
 *   - `health_data_processing` — organise health information from my reports;
 *   - `ai_processing`          — let an AI service read the report text.
 * Revoking writes a new `granted = false` row; nothing is edited or deleted.
 *
 * The server (`process-document`) checks the SAME version via the
 * AI_CONSENT_VERSION secret, so changing the wording below requires a new
 * version here AND there — older consents then no longer count.
 */
export const AI_CONSENT_VERSION = 'ai-2026-11';

export const AI_CONSENT_COPY = {
  title: 'Read this report for you?',
  points: [
    'To add results to your Health Memory, your report is sent to our AI provider (Anthropic) to be read: its text, or — for photos and scans — images of its pages.',
    'Only the report itself is sent — not your account details or your other records.',
    'Anthropic may not use it to train its models. It deletes it within 30 days, or keeps it for up to 2 years if it’s flagged under its usage policies.',
    'Every result is checked against your report and shows the page it came from. Nothing here is a diagnosis.',
    'You can turn this off any time in Privacy. Reports already read stay in your Health Memory.',
  ],
  allow: 'Allow and read report',
  decline: 'Not now',
} as const;

export type AiConsentState = { granted: boolean; version: string | null; recordedAt: string | null };

export interface ConsentService {
  getAiConsent(): Promise<AiConsentState>;
  /** Records both consents at AI_CONSENT_VERSION. */
  grantAiConsent(): Promise<void>;
  revokeAiConsent(): Promise<void>;
}

const CONSENT_TYPES = ['ai_processing', 'health_data_processing'] as const;

/** Granted only when BOTH latest decisions are "granted" at the current version. */
export function summarizeConsents(
  rows: { consent_type: string; granted: boolean; policy_version: string; recorded_at: string }[]
): AiConsentState {
  const latest = CONSENT_TYPES.map((type) => rows.find((r) => r.consent_type === type));
  const granted = latest.every((r) => r?.granted === true && r.policy_version === AI_CONSENT_VERSION);
  const recordedAt = latest.map((r) => r?.recorded_at ?? '').sort().pop() || null;
  return { granted, version: granted ? AI_CONSENT_VERSION : null, recordedAt };
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new ServiceError('not_configured', 'This isn’t available right now.');
  return client;
}

export const supabaseConsentService: ConsentService = {
  async getAiConsent() {
    const { data, error } = await requireClient()
      .from('current_consents')
      .select('consent_type, granted, policy_version, recorded_at')
      .in('consent_type', [...CONSENT_TYPES]);
    if (error) throw toServiceError(error, { code: 'unknown', userMessage: 'We couldn’t check your privacy choices. Please try again.', retryable: true });
    return summarizeConsents(data ?? []);
  },
  async grantAiConsent() {
    const { error } = await requireClient()
      .from('consents')
      .insert(CONSENT_TYPES.map((consent_type) => ({ consent_type, policy_version: AI_CONSENT_VERSION, granted: true })));
    if (error) throw toServiceError(error, { code: 'save_failed', userMessage: 'We couldn’t save your choice. Please try again.', retryable: true });
  },
  async revokeAiConsent() {
    const { error } = await requireClient()
      .from('consents')
      .insert(CONSENT_TYPES.map((consent_type) => ({ consent_type, policy_version: AI_CONSENT_VERSION, granted: false })));
    if (error) throw toServiceError(error, { code: 'save_failed', userMessage: 'We couldn’t save your choice. Please try again.', retryable: true });
  },
};

/** DEMO MODE: in memory for this app session only. */
let demoConsent: AiConsentState = { granted: false, version: null, recordedAt: null };
export const demoConsentService: ConsentService = {
  getAiConsent: async () => demoConsent,
  grantAiConsent: async () => {
    demoConsent = { granted: true, version: AI_CONSENT_VERSION, recordedAt: new Date().toISOString() };
  },
  revokeAiConsent: async () => {
    demoConsent = { granted: false, version: null, recordedAt: new Date().toISOString() };
  },
};

export const consentService: ConsentService = isDemoMode ? demoConsentService : supabaseConsentService;
