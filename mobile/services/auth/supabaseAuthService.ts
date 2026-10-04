import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import type { AuthError, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';

import type { AuthProvider, LinkedIdentity, User } from '../../types';
import { isNetworkError, ServiceError, toServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';
import { appleFullName, isApplePrivateRelayEmail, isValidEmail, maskEmail, normalizeEmail, normalizeMobileNumber } from './authInput';
import { isAppleSignInAvailable, requestAppleCredential } from './appleAuth';
import type {
  AppleSignInResult,
  AuthService,
  GoogleSignInResult,
  LinkIdentityResult,
  SendOtpResult,
  VerifyOtpResult,
} from './authTypes';

WebBrowser.maybeCompleteAuthSession();

/**
 * Real Supabase-backed implementation (production mode). Supabase Auth owns
 * OTP generation, delivery and verification; the session is persisted in
 * the Keychain/Keystore (see supabaseClient.ts). Onboarding state lives in
 * `public.profiles` (RLS: own row only).
 */

const NOT_CONFIGURED = 'Sign-in is not available right now. Please try again later.';
const APPLE_UNAVAILABLE = 'Sign in with Apple isn’t available on this device.';
const OAUTH_REDIRECT = () => AuthSession.makeRedirectUri({ scheme: 'healthintelligence' });

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
    return 'Sign-in by SMS isn’t available yet. Please continue with Google or Apple.';
  }
  return 'We couldn’t send a code right now. Please try again.';
}

/** Finishes an OAuth browser round-trip (PKCE: exchange ?code= for a session). */
async function completeOAuthRedirect(client: SupabaseClient, url: string): Promise<AuthError | Error | null> {
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  const errorDescription = parsed.searchParams.get('error_description');
  if (errorDescription) return new Error(errorDescription);
  if (!code) return new Error('Missing authorization code.');
  const { error } = await client.auth.exchangeCodeForSession(code);
  return error;
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
      options: { shouldCreateUser: true },
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

  async signInWithGoogle(): Promise<GoogleSignInResult> {
    const client = getSupabaseClient();
    if (!client) return { success: false, errorMessage: NOT_CONFIGURED };
    const redirectTo = OAUTH_REDIRECT();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) return { success: false, errorMessage: authErrorMessage(error, 'oauth') };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return { success: false, cancelled: true };

    const exchangeError = await completeOAuthRedirect(client, result.url);
    if (exchangeError) return { success: false, errorMessage: authErrorMessage(exchangeError, 'oauth') };

    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) return { success: false, errorMessage: authErrorMessage(null, 'oauth') };
    return { success: true, ...(await signedInResult(client, sessionData.session.user)) };
  },

  async signInWithApple(): Promise<AppleSignInResult> {
    const client = getSupabaseClient();
    if (!client) return { success: false, errorMessage: NOT_CONFIGURED };
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
    const redirectTo = OAUTH_REDIRECT();
    const { data, error } = await client.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return { success: false, errorMessage: authErrorMessage(error, 'oauth') };
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return { success: false, errorMessage: 'Linking was cancelled.' };
    const exchangeError = await completeOAuthRedirect(client, result.url);
    if (exchangeError) return { success: false, errorMessage: authErrorMessage(exchangeError, 'oauth') };
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) return { success: false, errorMessage: authErrorMessage(userError, 'oauth') };
    return { success: true, user: (await signedInResult(client, userData.user)).user };
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
    const { error } = await client.auth.signOut();
    // Even if the server can't be reached, always end the session on this device.
    if (error) await client.auth.signOut({ scope: 'local' });
  },
};
