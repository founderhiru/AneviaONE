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
  /**
   * Deletes the signed-in person's account and everything in it (server:
   * delete-account). Resolves only once the account is gone. Throws
   * `reauthentication_required` (sign in again first), `busy` (a report is
   * being read), `incomplete` (started but not finished — calling again
   * resumes) or `network`/`unknown`.
   */
  deleteAccount(): Promise<void>;
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
    description: 'Lets you generate and share a summary with a Doctor when you choose to.',
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
  deleteAccount: () => delay(undefined),
  getMyIdentity: () => delay({ ...demoIdentity }),
  async updateMyIdentity(identity) {
    assertValidIdentity(identity);
    demoIdentity = { fullName: identity.fullName?.trim() ?? null, dateOfBirth: identity.dateOfBirth };
    return delay({ ...demoIdentity });
  },
};

const ACCOUNT_DELETE_FAILED = 'We couldn’t delete your account. Please try again.';

/** The function's HTTP status and error code, if the failure was an HTTP response. */
async function functionError(error: unknown): Promise<{ status: number; code: string | null } | null> {
  const response = (error as { context?: unknown })?.context;
  if (!(response instanceof Response)) return null;
  const body = await response.json().catch(() => null);
  return { status: response.status, code: typeof body?.error === 'string' ? body.error : null };
}

/**
 * What each outcome means for the person. Once deletion has started the
 * account is frozen; an unclear outcome is never reported as "nothing changed".
 */
function accountDeleteError(http: { status: number; code: string | null } | null, cause: unknown): ServiceError {
  if (http?.code === 'reauthentication_required') {
    return new ServiceError('reauthentication_required', 'For your security, sign in again, then delete your account within 15 minutes. Nothing has been deleted.');
  }
  if (http?.code === 'account_busy') {
    return new ServiceError('busy', 'A report is being read right now. Try again in a few minutes. Nothing has been deleted.', { retryable: true });
  }
  if (http && (http.code === 'storage_delete_failed' || http.code === 'delete_failed')) {
    return new ServiceError(
      'incomplete',
      'Deleting your account started but didn’t finish. Some of your data may already be removed, and no new reports can be added. Please try again — it continues where it stopped.',
      { retryable: true, cause }
    );
  }
  if (!http) {
    // No answer (offline, timeout): the request may or may not have reached the server.
    return new ServiceError(
      'network',
      'We couldn’t reach the server, so we can’t tell whether deletion started. Check your connection and try again — trying again is safe.',
      { retryable: true, cause }
    );
  }
  return new ServiceError('unknown', ACCOUNT_DELETE_FAILED, { retryable: true, cause });
}

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
  async deleteAccount() {
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', ACCOUNT_DELETE_FAILED, { retryable: true });
    let result: Awaited<ReturnType<typeof client.functions.invoke>>;
    try {
      result = await client.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
    } catch (error) {
      throw accountDeleteError(null, error);
    }
    if (!result.error) {
      if ((result.data as { status?: string } | null)?.status === 'deleted') return;
      // An answer that doesn't confirm deletion is never treated as success.
      throw new ServiceError('unknown', ACCOUNT_DELETE_FAILED, { retryable: true });
    }
    throw accountDeleteError(await functionError(result.error), result.error);
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
