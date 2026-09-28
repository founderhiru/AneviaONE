import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import type { AuthProvider, User } from '../../types';
import { getSupabaseClient } from '../supabaseClient';
import type {
  AuthService,
  GoogleSignInResult,
  LinkIdentityResult,
  SendOtpResult,
  VerifyOtpResult,
} from './authTypes';

WebBrowser.maybeCompleteAuthSession();

/**
 * Real Supabase-backed implementation. Selected automatically once
 * `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set (see
 * `services/supabaseClient.ts` and `docs/MOBILE_AUTH.md`). Never stores an
 * OTP itself — Supabase Auth owns OTP generation, delivery and
 * verification. Uses Supabase's identity-linking so a Mobile-OTP account
 * and a later Google sign-in resolve to the SAME user rather than creating
 * a duplicate Health Memory.
 */
function toDomainUser(supabaseUser: NonNullable<Awaited<ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>['auth']['getUser']>>['data']['user']>): User {
  const identities = supabaseUser.identities ?? [];
  return {
    id: supabaseUser.id,
    mobileNumber: supabaseUser.phone ?? undefined,
    email: supabaseUser.email ?? undefined,
    createdAt: supabaseUser.created_at,
    onboardingComplete: Boolean(supabaseUser.user_metadata?.onboarding_complete),
    linkedIdentities: identities.map((identity) => ({
      provider: (identity.provider === 'google' ? 'google' : 'mobile_otp') as AuthProvider,
      displayValue: identity.provider === 'google' ? String(identity.identity_data?.email ?? '') : supabaseUser.phone ?? '',
      linkedAt: identity.created_at ?? supabaseUser.created_at,
    })),
  };
}

export const supabaseAuthService: AuthService = {
  async sendMobileOtp(mobileNumber: string): Promise<SendOtpResult> {
    const client = getSupabaseClient();
    if (!client) return { success: false, errorMessage: 'Supabase is not configured yet.' };
    const { error } = await client.auth.signInWithOtp({ phone: mobileNumber });
    if (error) return { success: false, errorMessage: error.message };
    return { success: true };
  },

  async verifyMobileOtp(mobileNumber: string, otp: string): Promise<VerifyOtpResult> {
    const client = getSupabaseClient();
    if (!client) return { success: false, errorMessage: 'Supabase is not configured yet.' };
    const { data, error } = await client.auth.verifyOtp({ phone: mobileNumber, token: otp, type: 'sms' });
    if (error || !data.user) return { success: false, errorMessage: error?.message ?? 'Verification failed.' };
    // Supabase does not directly expose "is new user" on verifyOtp; treat a
    // user created within the last 10 seconds as new for onboarding routing.
    const isNewUser = Date.now() - new Date(data.user.created_at).getTime() < 10_000;
    return { success: true, user: toDomainUser(data.user), isNewUser };
  },

  async signInWithGoogle(): Promise<GoogleSignInResult> {
    const client = getSupabaseClient();
    if (!client) return { success: false, errorMessage: 'Supabase is not configured yet.' };
    const redirectTo = AuthSession.makeRedirectUri({ scheme: 'healthintelligence' });
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) return { success: false, errorMessage: error?.message ?? 'Could not start Google sign-in.' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return { success: false, cancelled: true };

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) return { success: false, errorMessage: userError?.message ?? 'Sign-in failed.' };
    const isNewUser = Date.now() - new Date(userData.user.created_at).getTime() < 10_000;
    return { success: true, user: toDomainUser(userData.user), isNewUser };
  },

  async linkIdentity(provider: AuthProvider): Promise<LinkIdentityResult> {
    const client = getSupabaseClient();
    if (!client) return { success: false, errorMessage: 'Supabase is not configured yet.' };
    if (provider !== 'google') {
      return { success: false, errorMessage: 'Only linking a Google account is supported from here.' };
    }
    // supabase-js identity linking (manual linking must be enabled in the
    // Supabase project's Auth settings).
    const { data, error } = await client.auth.linkIdentity({ provider: 'google' });
    if (error || !data?.url) return { success: false, errorMessage: error?.message ?? 'Could not start linking.' };
    const redirectTo = AuthSession.makeRedirectUri({ scheme: 'healthintelligence' });
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return { success: false, errorMessage: 'Linking was cancelled.' };
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) return { success: false, errorMessage: userError?.message ?? 'Linking failed.' };
    return { success: true, user: toDomainUser(userData.user) };
  },

  async getCurrentUser(): Promise<User | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data } = await client.auth.getUser();
    return data.user ? toDomainUser(data.user) : null;
  },

  async signOut(): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;
    await client.auth.signOut();
  },
};
