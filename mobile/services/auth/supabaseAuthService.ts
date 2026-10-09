import type { AuthError, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';

import type { AuthProvider, LinkedIdentity, OnboardingFlags, User } from '../../types';
import { isNetworkError, ServiceError, toServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';
import { appleFullName, isApplePrivateRelayEmail, isValidEmail, maskEmail, normalizeEmail, normalizeMobileNumber } from './authInput';
import { isAppleSignInAvailable, requestAppleCredential } from './appleAuth';
import { emailLinkRedirect } from './emailLink';
import { requestGoogleIdToken, signOutOfGoogle } from './googleAuth';
import type {
  AppleSignInResult,
  AuthService,
  GoogleSignInResult,
  LinkIdentityResult,
  SendOtpResult,
  VerifyOtpResult,
} from './authTypes';

/**
 * Real Supabase-backed implementation (production mode). Supabase Auth owns
 * OTP generation, delivery and verification; the session is persisted in
 * the Keychain/Keystore (see supabaseClient.ts). Onboarding state lives in
 * `public.profiles` (RLS: own row only).
 */

const NOT_CONFIGURED = 'Sign-in is not available right now. Please try again later.';
const EMAIL_LINK_FAILED =
  'This sign-in link has expired, was already used, or was opened on a different device. Enter the 6-digit code from the email instead, or request a new one.';
const APPLE_UNAVAILABLE = 'Sign in with Apple isn’t available on this device.';
const GOOGLE_UNAVAILABLE = 'Sign in with Google isn’t available in this version of the app.';

/** user_metadata keys for the one-time onboarding steps. */
const ONBOARDING_FLAG_KEYS: Record<keyof OnboardingFlags, string> = {
  identityOnboardingComplete: 'identity_onboarding_complete',
  identityUploadPromptSeen: 'identity_upload_prompt_seen',
};

type ProfileRow = { onboarding_completed_at: string | null; display_name: string | null };

function mapProvider(provider: string): AuthProvider {
  if (provider === 'google') return 'google';
  if (provider === 'apple') return 'apple';
  if (provider === 'email') return 'email';
  return 'mobile_otp';
}

function identityDisplay(provider: AuthProvider, user: SupabaseUser, identityEmail?: unknown): string {
  if (provider === 'mobile_otp') return user.phone ? `+${user.phone.replace(/^\+/, '')}` : '';
  const email = typeof identityEmail === 'string' && identityEmail ? identityEmail : user.email ?? '';
  if (isApplePrivateRelayEmail(email)) return 'Email hidden by Apple';
  return email ? maskEmail(email) : '';
}

export function toDomainUser(supabaseUser: SupabaseUser, profile: ProfileRow | null): User {
  const identities = supabaseUser.identities ?? [];
  const linkedIdentities: LinkedIdentity[] = identities.map((identity) => {
    const provider = mapProvider(identity.provider);
    return {
      provider,
      displayValue: identityDisplay(provider, supabaseUser, identity.identity_data?.email),
      linkedAt: identity.created_at ?? supabaseUser.created_at,
    };
  });
  return {
    id: supabaseUser.id,
    fullName: profile?.display_name ?? undefined,
    mobileNumber: supabaseUser.phone || undefined,
    email: supabaseUser.email || undefined,
    createdAt: supabaseUser.created_at,
    // Source of truth is profiles.onboarding_completed_at; the user_metadata
    // mirror lets an offline cold start route correctly.
    onboardingComplete: Boolean(profile?.onboarding_completed_at) || Boolean(supabaseUser.user_metadata?.onboarding_complete),
    // One-time UX steps, kept in the account's metadata (no schema change):
    // they only decide whether a note is shown, never what is trusted.
    identityOnboardingComplete: Boolean(supabaseUser.user_metadata?.[ONBOARDING_FLAG_KEYS.identityOnboardingComplete]),
    identityUploadPromptSeen: Boolean(supabaseUser.user_metadata?.[ONBOARDING_FLAG_KEYS.identityUploadPromptSeen]),
    linkedIdentities,
  };
}

async function loadProfile(client: SupabaseClient, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from('profiles')
    .select('onboarding_completed_at, display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    if (__DEV__) console.warn('[auth] could not load profile', error.message);
    return null;
  }
  return data;
}

async function signedInResult(client: SupabaseClient, user: SupabaseUser): Promise<{ user: User; isNewUser: boolean }> {
  const profile = await loadProfile(client, user.id);
  const domainUser = toDomainUser(user, profile);
  return { user: domainUser, isNewUser: !domainUser.onboardingComplete };
}

/** User-safe message for an Auth error — never the raw backend text. */
function authErrorMessage(error: AuthError | Error | null | undefined, context: 'send' | 'verify' | 'oauth'): string {
  if (!error) return 'Something went wrong. Please try again.';
  if (isNetworkError(error)) return 'You appear to be offline. Check your connection and try again.';
  const status = (error as AuthError).status;
  const code = (error as AuthError).code ?? '';
  if (status === 429 || code.includes('rate_limit')) return 'Too many attempts. Please wait a minute and try again.';
  if (context === 'verify') return 'That code is incorrect or has expired. Please try again or request a new code.';
  if (context === 'oauth') return 'Could not complete sign-in. Please try again.';
  if (code === 'phone_provider_disabled' || code === 'sms_send_failed') {
    return 'Sign-in by SMS isn’t available yet. Please use one of the other options below.';
  }
  return 'We couldn’t send a code right now. Please try again.';
}

/** A failed OAuth step with a known, non-secret diagnostic code. */
class OAuthStepError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'OAuthStepError';
  }
}

const SAFE_CODE = /^[a-z0-9_]{1,64}$/;

/**
 * A short, non-secret identifier for why an OAuth sign-in failed — the
 * Supabase Auth error code (e.g. `bad_code_verifier`,
 * `flow_state_not_found`, `pkce_code_verifier_not_found`) or one of ours.
 * Only ever a fixed lower-case token: never a message, URL, code, token,
 * verifier or email, so it is safe to show and to report.
 */
export function oauthDiagnosticCode(error: unknown): string {
  if (error instanceof OAuthStepError) return error.code;
  if (isNetworkError(error)) return 'network_error';
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && SAFE_CODE.test(code)) return code;
  // supabase-js's own client-side errors (e.g. AuthSessionMissingError →
  // auth_session_missing) carry no server code; name them by their type.
  const name = (error as { name?: unknown } | null)?.name;
  if (typeof name === 'string' && /^Auth[A-Za-z]+Error$/.test(name) && name !== 'AuthApiError' && name !== 'AuthUnknownError') {
    return name.replace(/Error$/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  }
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number') return `auth_http_${status}`;
  return 'unexpected_error';
}

/**
 * Development-only diagnostics for a failed sign-in step. Logs what
 * identifies the failure (stage, error name/code/status) — never a token,
 * authorization code or PKCE verifier. Production stays silent; people only
 * ever see the friendly message.
 */
function diagnose(stage: string, error: unknown) {
  if (!__DEV__) return;
  const e = (error ?? {}) as { name?: string; code?: string; status?: number; message?: string };
  console.warn(`[auth] ${stage} failed`, { diagnosticCode: oauthDiagnosticCode(error), name: e.name, code: e.code, status: e.status, message: e.message });
}

const SIGN_OUT_SERVER_TIMEOUT_MS = 3000;
const GOOGLE_SIGN_OUT_TIMEOUT_MS = 2000;
const TIMED_OUT = Symbol('timed out');

/** Resolves with `promise`'s value, or TIMED_OUT after `ms` (the promise is left to settle on its own). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Deletes this device's stored session directly from the auth client's own
 * storage (the Keychain adapter in the app), without a network round-trip.
 * supabase-js only clears it after reading the session — which, for an
 * expired token, means refreshing it over the network first; offline, that
 * fails and the session is left in place. The keys are the client's own
 * (`storageKey`, plus its `-user` and `-code-verifier` companions).
 */
async function removeStoredSession(client: SupabaseClient): Promise<void> {
  const auth = client.auth as unknown as { storageKey?: string; storage?: { removeItem(key: string): Promise<void> | void } };
  if (!auth.storageKey || !auth.storage) return;
  for (const key of [auth.storageKey, `${auth.storageKey}-user`, `${auth.storageKey}-code-verifier`]) {
    try {
      await auth.storage.removeItem(key);
    } catch (error) {
      diagnose('sign-out:clear', error);
    }
  }
}

/** The friendly OAuth failure, plus a safe code for diagnosing it. */
function oauthFailure(error: unknown): { success: false; errorMessage: string; diagnosticCode: string } {
  return { success: false, errorMessage: authErrorMessage(error as Error, 'oauth'), diagnosticCode: oauthDiagnosticCode(error) };
}

/** One Google round-trip at a time: a second tap joins the attempt in flight. */
let googleInFlight: Promise<GoogleSignInResult> | null = null;
/** Likewise for the Apple sheet. */
let appleInFlight: Promise<AppleSignInResult> | null = null;

/**
 * Native Google Sign-In: Google's iOS SDK returns a Google ID token, which
 * Supabase verifies (signature, issuer, audience = the configured client
 * IDs) and exchanges for a session in one call — the same pattern as Sign
 * in with Apple. There is no browser redirect, callback, PKCE code or
 * stored flow state to redeem (the browser flow's code redemption failed
 * for returning accounts with `flow_state_not_found`).
 */
async function runGoogleSignIn(client: SupabaseClient): Promise<GoogleSignInResult> {
  // The Google entry point is only offered while signed out. A session still
  // in storage here is left over from an incomplete sign-out; clear it so the
  // new sign-in starts from a clean slate.
  const { data: existing } = await client.auth.getSession();
  if (existing.session) await client.auth.signOut({ scope: 'local' });

  const google = await requestGoogleIdToken();
  if (google.kind === 'cancelled') return { success: false, cancelled: true };
  if (google.kind === 'unavailable') {
    return { success: false, errorMessage: GOOGLE_UNAVAILABLE, diagnosticCode: 'google_signin_unavailable' };
  }
  if (google.kind === 'no_id_token') {
    const error = new OAuthStepError('google_no_id_token', 'Google returned no ID token.');
    diagnose('google:token', error);
    return oauthFailure(error);
  }
  if (google.kind === 'error') {
    diagnose('google:native', google.error);
    return oauthFailure(google.error.code ? new OAuthStepError(googleErrorCode(google.error.code), google.error.message) : google.error);
  }

  const { data, error } = await client.auth.signInWithIdToken({ provider: 'google', token: google.idToken });
  if (error || !data.user) {
    diagnose('google:supabase', error);
    return oauthFailure(error ?? new OAuthStepError('no_session', 'No session from Google ID token.'));
  }
  return { success: true, ...(await signedInResult(client, data.user)) };
}

/** Google SDK error codes as safe diagnostics (`google_<code>`). */
function googleErrorCode(code: string): string {
  const safe = code.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 48);
  return `google_${safe || 'error'}`;
}

async function runAppleSignIn(client: SupabaseClient): Promise<AppleSignInResult> {
  if (!(await isAppleSignInAvailable())) return { success: false, errorMessage: APPLE_UNAVAILABLE };

  const credential = await requestAppleCredential();
  if (credential.kind === 'cancelled') return { success: false, cancelled: true };
  if (credential.kind === 'error') return { success: false, errorMessage: authErrorMessage(credential.error, 'oauth') };

  // Supabase verifies the token (audience = the app's bundle ID, set as a
  // Client ID on the Apple provider) and the nonce, then signs in — or
  // creates the auth user, whose `profiles` row the database trigger adds,
  // exactly as for Mobile and Google. A "Hide My Email" relay address is
  // stored as the account email like any other; it reaches the person.
  const { data, error } = await client.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: credential.rawNonce,
  });
  if (error || !data.user) return { success: false, errorMessage: authErrorMessage(error, 'oauth') };

  // Apple shares the person's name only on the very first authorisation,
  // so keep it now (never overwriting a name already set).
  const fullName = appleFullName(credential.fullName);
  if (fullName && !data.user.user_metadata?.full_name) {
    await client.auth
      .updateUser({
        data: {
          full_name: fullName,
          given_name: credential.fullName?.givenName ?? undefined,
          family_name: credential.fullName?.familyName ?? undefined,
        },
      })
      .catch(() => undefined);
    await client.from('profiles').update({ display_name: fullName }).eq('id', data.user.id).is('display_name', null);
  }
  return { success: true, ...(await signedInResult(client, data.user)) };
}

export const supabaseAuthService: AuthService = {
  async sendMobileOtp(mobileNumber) {
    const client = getSupabaseClient();
    if (!client) return { success: false, errorMessage: NOT_CONFIGURED };
    const phone = normalizeMobileNumber(mobileNumber);
    if (!phone) return { success: false, errorMessage: 'Enter a valid 10-digit mobile number.' };
    const { error } = await client.auth.signInWithOtp({ phone });
    if (error) return { success: false, errorMessage: authErrorMessage(error, 'send') };
    return { success: true };
  },

  async verifyMobileOtp(mobileNumber, otp): Promise<VerifyOtpResult> {
    const client = getSupabaseClient();
    if (!client) return { success: false, errorMessage: NOT_CONFIGURED };
    const phone = normalizeMobileNumber(mobileNumber);
    if (!phone) return { success: false, errorMessage: 'Enter a valid 10-digit mobile number.' };
    const { data, error } = await client.auth.verifyOtp({ phone, token: otp, type: 'sms' });
    if (error || !data.user) return { success: false, errorMessage: authErrorMessage(error, 'verify') };
    return { success: true, ...(await signedInResult(client, data.user)) };
  },

  async sendEmailOtp(email): Promise<SendOtpResult> {
    const client = getSupabaseClient();
    if (!client) return { success: false, errorMessage: NOT_CONFIGURED };
    if (!isValidEmail(email)) return { success: false, errorMessage: 'Enter a valid email address.' };
    const { error } = await client.auth.signInWithOtp({
      email: normalizeEmail(email),
      // The email's link returns to the app (not the Site URL); the 6-digit
      // code in the same email works on any device.
      options: { shouldCreateUser: true, emailRedirectTo: emailLinkRedirect() },
    });
    if (error) return { success: false, errorMessage: authErrorMessage(error, 'send') };
    return { success: true };
  },

  async verifyEmailOtp(email, otp): Promise<VerifyOtpResult> {
    const client = getSupabaseClient();
    if (!client) return { success: false, errorMessage: NOT_CONFIGURED };
    const { data, error } = await client.auth.verifyOtp({ email: normalizeEmail(email), token: otp, type: 'email' });
    if (error || !data.user) return { success: false, errorMessage: authErrorMessage(error, 'verify') };
    return { success: true, ...(await signedInResult(client, data.user)) };
  },

  async completeEmailLink(code): Promise<VerifyOtpResult> {
    const client = getSupabaseClient();
    if (!client) return { success: false, errorMessage: NOT_CONFIGURED };
    // PKCE: only the device that asked for the email holds the matching
    // verifier, so a link opened elsewhere fails here — the code still works.
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error || !data.user) return { success: false, errorMessage: EMAIL_LINK_FAILED };
    return { success: true, ...(await signedInResult(client, data.user)) };
  },

  async signInWithGoogle(): Promise<GoogleSignInResult> {
    const client = getSupabaseClient();
    if (!client) return { success: false, errorMessage: NOT_CONFIGURED };
    if (googleInFlight) return googleInFlight;
    googleInFlight = runGoogleSignIn(client)
      .catch((error: unknown): GoogleSignInResult => {
        // Never let a thrown error (browser failed to open, network) escape
        // and leave the sign-in screen waiting forever.
        diagnose('google', error);
        return oauthFailure(error);
      })
      .finally(() => {
        googleInFlight = null;
      });
    return googleInFlight;
  },

  async signInWithApple(): Promise<AppleSignInResult> {
    const client = getSupabaseClient();
    if (!client) return { success: false, errorMessage: NOT_CONFIGURED };
    if (appleInFlight) return appleInFlight;
    appleInFlight = runAppleSignIn(client)
      .catch((error: unknown): AppleSignInResult => {
        diagnose('apple', error);
        return { success: false, errorMessage: authErrorMessage(error as Error, 'oauth') };
      })
      .finally(() => {
        appleInFlight = null;
      });
    return appleInFlight;
  },

  async linkIdentity(provider): Promise<LinkIdentityResult> {
    const client = getSupabaseClient();
    if (!client) return { success: false, errorMessage: NOT_CONFIGURED };
    // Both require "Manual linking" to be enabled in Supabase Auth settings.
    if (provider === 'apple') {
      if (!(await isAppleSignInAvailable())) return { success: false, errorMessage: APPLE_UNAVAILABLE };
      const credential = await requestAppleCredential();
      if (credential.kind === 'cancelled') return { success: false, errorMessage: 'Linking was cancelled.' };
      if (credential.kind === 'error') return { success: false, errorMessage: authErrorMessage(credential.error, 'oauth') };
      const { data, error } = await client.auth.linkIdentity({
        provider: 'apple',
        token: credential.identityToken,
        nonce: credential.rawNonce,
      });
      if (error || !data.user) return { success: false, errorMessage: authErrorMessage(error, 'oauth') };
      return { success: true, user: (await signedInResult(client, data.user)).user };
    }
    if (provider !== 'google') {
      return { success: false, errorMessage: 'Only linking a Google or Apple account is supported from here.' };
    }
    // Google: link with a native Google ID token, like Apple above.
    const google = await requestGoogleIdToken();
    if (google.kind === 'cancelled') return { success: false, errorMessage: 'Linking was cancelled.' };
    if (google.kind === 'unavailable') return { success: false, errorMessage: GOOGLE_UNAVAILABLE };
    if (google.kind !== 'success') {
      diagnose('google:link', google.kind === 'error' ? google.error : new OAuthStepError('google_no_id_token', 'No ID token.'));
      return { success: false, errorMessage: authErrorMessage(null, 'oauth') };
    }
    const { data, error } = await client.auth.linkIdentity({ provider: 'google', token: google.idToken });
    if (error || !data.user) {
      diagnose('google:link', error);
      return { success: false, errorMessage: authErrorMessage(error, 'oauth') };
    }
    return { success: true, user: (await signedInResult(client, data.user)).user };
  },

  async getCurrentUser() {
    const client = getSupabaseClient();
    if (!client) return null;
    // Restores the persisted session (refreshing it if needed) — works offline
    // with a still-valid session, so a cold start never logs people out.
    const { data } = await client.auth.getSession();
    const session = data.session;
    if (!session) return null;
    const profile = await loadProfile(client, session.user.id);
    return toDomainUser(session.user, profile);
  },

  async completeOnboarding() {
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', NOT_CONFIGURED);
    const { data } = await client.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) throw new ServiceError('not_signed_in', 'Please sign in again.');
    const { error } = await client
      .from('profiles')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) {
      throw toServiceError(error, { code: 'save_failed', userMessage: 'We couldn’t save your progress. Please try again.', retryable: true });
    }
    // Mirror for offline cold starts; failure here is harmless.
    await client.auth.updateUser({ data: { onboarding_complete: true } }).catch(() => undefined);
  },

  async saveOnboardingFlags(flags) {
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', NOT_CONFIGURED);
    const data: Record<string, true> = {};
    for (const key of Object.keys(flags) as (keyof OnboardingFlags)[]) {
      if (flags[key]) data[ONBOARDING_FLAG_KEYS[key]] = true;
    }
    if (Object.keys(data).length === 0) return;
    // Merged into the existing metadata; nothing else about the account changes.
    const { error } = await client.auth.updateUser({ data });
    if (error) {
      throw toServiceError(error, { code: 'save_failed', userMessage: 'We couldn’t save your progress. Please try again.', retryable: true });
    }
  },

  onSignedOut(listener) {
    const client = getSupabaseClient();
    if (!client) return () => undefined;
    const { data } = client.auth.onAuthStateChange((event) => {
      // Keep this callback synchronous — Supabase warns against awaiting
      // other auth calls inside it.
      if (event === 'SIGNED_OUT') listener();
    });
    return () => data.subscription.unsubscribe();
  },

  async signOut() {
    const client = getSupabaseClient();
    if (!client) return;
    // No background token refresh may write the session back mid-sign-out.
    await client.auth.stopAutoRefresh();
    try {
      // Tell the server (revokes this session's refresh token). Best-effort
      // and time-limited: on a lost network supabase-js first retries
      // refreshing an expired token for ~30s, and a request that never
      // answers would otherwise hold sign-out forever.
      const result = await withTimeout(client.auth.signOut(), SIGN_OUT_SERVER_TIMEOUT_MS);
      if (result === TIMED_OUT) diagnose('sign-out', new Error('sign-out timed out'));
      else if (result.error) diagnose('sign-out', result.error);
    } catch (error) {
      diagnose('sign-out', error);
    }
    // Whatever the server said, nothing of the session may remain on this
    // device — otherwise the next launch silently signs the person back in.
    await removeStoredSession(client);
    // Also end Google's own sign-in on this device (best-effort, bounded), so
    // the next Google sign-in can choose an account rather than reusing one.
    await withTimeout(signOutOfGoogle(), GOOGLE_SIGN_OUT_TIMEOUT_MS);
    // Token refresh resumes for whoever signs in next (nothing to refresh now).
    await client.auth.startAutoRefresh();
  },
};
