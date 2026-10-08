import { isDemoMode } from '../../config/appMode';
import type { HealthProfile, IdentityProfile } from '../../types';
import { healthService } from '../health/healthService';
import { isNetworkError, ServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';
import { checkFullName } from './identityValidation';

export type DataSharingSetting = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
};

/**
 * Profile / account-settings service boundary — backs the Me and Privacy &
 * Security screens. Destructive/data-sensitive actions are modeled
 * explicitly so the real backend calls have an obvious seam:
 *   data sharing  → `consents` ledger (proposed schema)
 *   download      → Edge Function `export-my-data`
 *   delete        → Edge Function `delete-account`
 * None of those exist yet, so production reports them as unavailable instead
 * of pretending a request was made.
 */
export interface ProfileService {
  getHealthProfile(): Promise<HealthProfile>;
  getDataSharingSettings(): Promise<DataSharingSetting[]>;
  setDataSharingSetting(id: string, enabled: boolean): Promise<void>;
  requestDataDownload(): Promise<{ requested: true }>;
  requestAccountDeletion(): Promise<{ requested: true }>;
  /** The signed-in person's own identity details (never anyone else's). */
  getMyIdentity(): Promise<IdentityProfile>;
  /** Saves both values (null = not provided / clears it). Throws on invalid input. */
  updateMyIdentity(identity: IdentityProfile): Promise<IdentityProfile>;
}

/**
 * Errors here never carry the cause: a database refusal can include the
 * submitted row, and the name / date of birth must not reach any log.
 */
const IDENTITY_LOAD_FAILED = 'We couldn’t load your identity details. Please try again.';
const IDENTITY_SAVE_FAILED = 'We couldn’t save your identity details. Nothing was changed — please try again.';
const identityError = (error: unknown, message: string) =>
  isNetworkError(error)
    ? new ServiceError('network', 'You appear to be offline. Check your connection and try again.', { retryable: true })
    : new ServiceError('unknown', message, { retryable: true });

/** Rejects anything the database would refuse, before it is sent. */
function assertValidIdentity(identity: IdentityProfile) {
  if (identity.fullName !== null) {
    const name = checkFullName(identity.fullName);
    if (!name.ok || name.value === null) throw new ServiceError('invalid_input', name.ok ? 'Enter your full name.' : name.error);
  }
  if (identity.dateOfBirth !== null && !/^\d{4}-\d{2}-\d{2}$/.test(identity.dateOfBirth)) {
    throw new ServiceError('invalid_input', 'Enter a valid date of birth.');
  }
}

const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 300));

const SHARING_OPTIONS: DataSharingSetting[] = [
  {
    id: 'share-doctor-brief',
    label: 'Allow sharing a Doctor Brief',
    description: 'Lets you generate and share a summary with a doctor when you choose to.',
    enabled: false,
  },
  {
    id: 'share-anonymized-research',
    label: 'Anonymized research contribution',
    description: 'Share de-identified data to help improve health insights. Off by default.',
    enabled: false,
  },
];

/** DEMO MODE ONLY — in-memory settings and simulated requests. */
let demoIdentity: IdentityProfile = { fullName: null, dateOfBirth: null };
let demoSharingSettings: DataSharingSetting[] = SHARING_OPTIONS.map((s) =>
  s.id === 'share-doctor-brief' ? { ...s, enabled: true } : s
);

export const demoProfileService: ProfileService = {
  getHealthProfile: () => healthService.getHealthProfile(),
  getDataSharingSettings: () => delay(demoSharingSettings),
  async setDataSharingSetting(id, enabled) {
    demoSharingSettings = demoSharingSettings.map((s) => (s.id === id ? { ...s, enabled } : s));
    await delay(undefined);
  },
  requestDataDownload: () => delay({ requested: true }),
  requestAccountDeletion: () => delay({ requested: true }),
  getMyIdentity: () => delay({ ...demoIdentity }),
  async updateMyIdentity(identity) {
    assertValidIdentity(identity);
    demoIdentity = { fullName: identity.fullName?.trim() ?? null, dateOfBirth: identity.dateOfBirth };
    return delay({ ...demoIdentity });
  },
};

const notAvailable = (what: string) =>
  new ServiceError('not_available', `${what} isn’t available in the app yet. Your data has not been changed.`);

/**
 * PRODUCTION (Phase 1). Nothing has been shared, so every option shows as
 * off, and changes/requests are refused honestly until their backend exists.
 */
export const productionProfileService: ProfileService = {
  getHealthProfile: () => healthService.getHealthProfile(),
  getDataSharingSettings: async () => SHARING_OPTIONS,
  async setDataSharingSetting() {
    throw notAvailable('Changing sharing preferences');
  },
  async requestDataDownload() {
    throw notAvailable('Downloading your data');
  },
  async requestAccountDeletion() {
    throw notAvailable('Deleting your account');
  },

  async getMyIdentity() {
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', IDENTITY_LOAD_FAILED);
    const { data } = await client.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) throw new ServiceError('not_signed_in', 'Please sign in again to continue.');
    // RLS returns only the signed-in person's rows; the filter is for clarity.
    const [profile, health] = await Promise.all([
      client.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
      client.from('health_profiles').select('date_of_birth').eq('user_id', userId).maybeSingle(),
    ]);
    if (profile.error || health.error) throw identityError(profile.error ?? health.error, IDENTITY_LOAD_FAILED);
    return {
      fullName: (profile.data as { full_name: string | null } | null)?.full_name ?? null,
      dateOfBirth: (health.data as { date_of_birth: string | null } | null)?.date_of_birth ?? null,
    };
  },
  async updateMyIdentity(identity) {
    assertValidIdentity(identity);
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', IDENTITY_SAVE_FAILED);
    // One call, as the signed-in person: both values are saved together or not at all.
    const { error } = await client.rpc('set_my_identity', {
      p_full_name: identity.fullName === null ? null : identity.fullName.trim(),
      p_date_of_birth: identity.dateOfBirth,
    });
    if (error) throw identityError(error, IDENTITY_SAVE_FAILED);
    return { fullName: identity.fullName === null ? null : identity.fullName.trim(), dateOfBirth: identity.dateOfBirth };
  },
};

export const profileService: ProfileService = isDemoMode ? demoProfileService : productionProfileService;
