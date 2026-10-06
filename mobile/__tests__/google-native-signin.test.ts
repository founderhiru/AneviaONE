/**
 * Native Google Sign-In → Supabase `signInWithIdToken`, production path
 * (supabaseAuthService + services/auth/googleAuth.ts).
 *
 * The Google SDK (`@react-native-google-signin/google-signin`) is mocked at
 * the module boundary; the Supabase client is a stateful fake that issues a
 * session for a valid Google ID token. Covers success (new and existing
 * account), cancellation, a missing ID token, SDK and Supabase failures,
 * the native module being absent, logout (including Google's own sign-out)
 * and signing in again after logout.
 */
import type { User as SupabaseUser } from '@supabase/supabase-js';

import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '../config/googleAuth';
import { resetGoogleSigninForTests } from '../services/auth/googleAuth';
import { supabaseAuthService } from '../services/auth/supabaseAuthService';
import { getSupabaseClient } from '../services/supabaseClient';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn() }));

const mockGoogle = {
  configure: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(async () => null),
};
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: mockGoogle,
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED', IN_PROGRESS: 'IN_PROGRESS', SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED' },
  isSuccessResponse: (r: { type: string }) => r.type === 'success',
  isCancelledResponse: (r: { type: string }) => r.type === 'cancelled',
  isErrorWithCode: (e: unknown) => typeof (e as { code?: unknown })?.code === 'string',
}));

const SECRET = 'SECRET';
let tokens = 0;
/** A fresh Google ID token, as Google's SDK would return it. */
const googleSuccess = () => ({ type: 'success', data: { idToken: `google-id-token-${SECRET}-${++tokens}`, user: { email: 'priya@example.com' } } });

function supabaseUser(id = 'google-user-1'): SupabaseUser {
  return {
    id,
    aud: 'authenticated',
    app_metadata: { provider: 'google' },
    user_metadata: {},
    email: 'priya@example.com',
    created_at: '2026-10-05T10:00:00Z',
    identities: [],
  } as unknown as SupabaseUser;
}

/** Stateful fake Supabase: a valid Google ID token yields a session. */
function fakeClient({ onboarded = true }: { onboarded?: boolean } = {}) {
  const state = { session: null as { access_token: string; user: SupabaseUser } | null };
  const client = {
    state,
    auth: {
      signInWithIdToken: jest.fn(async ({ provider, token }: { provider: string; token: string }) => {
        if (provider !== 'google' || !token.startsWith('google-id-token-')) {
          return { data: { user: null, session: null }, error: Object.assign(new Error('Bad ID token'), { status: 400, code: 'validation_failed' }) };
        }
        state.session = { access_token: 'access', user: supabaseUser() };
        return { data: { user: state.session.user, session: state.session }, error: null };
      }),
      linkIdentity: jest.fn(async () => ({ data: { user: supabaseUser(), session: {} }, error: null })),
      getSession: jest.fn(async () => ({ data: { session: state.session }, error: null })),
      signOut: jest.fn(async () => {
        state.session = null;
        return { error: null };
      }),
      // Must never be used by Google sign-in any more.
      signInWithOAuth: jest.fn(),
      exchangeCodeForSession: jest.fn(),
    },
    from: jest.fn(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => builder,
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: { onboarding_completed_at: onboarded ? '2026-10-01T00:00:00Z' : null, display_name: null }, error: null }),
      };
      return builder;
    }),
  };
  (getSupabaseClient as jest.Mock).mockReturnValue(client);
  return client;
}

beforeEach(() => {
  resetGoogleSigninForTests();
  mockGoogle.configure.mockClear();
  mockGoogle.signIn.mockReset();
  mockGoogle.signOut.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('native Google Sign-In → Supabase signInWithIdToken', () => {
  it('signs in an existing account with the Google ID token', async () => {
    const client = fakeClient();
    mockGoogle.signIn.mockResolvedValueOnce(googleSuccess());

    const result = await supabaseAuthService.signInWithGoogle();

    expect(result).toMatchObject({ success: true, user: { id: 'google-user-1', onboardingComplete: true }, isNewUser: false });
    expect(client.auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: expect.stringMatching(/^google-id-token-/) });
    expect(client.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('a brand-new account is reported as new (onboarding follows)', async () => {
    fakeClient({ onboarded: false });
    mockGoogle.signIn.mockResolvedValueOnce(googleSuccess());
    expect(await supabaseAuthService.signInWithGoogle()).toMatchObject({ success: true, isNewUser: true, user: { onboardingComplete: false } });
  });

  it('configures Google with the iOS and web client IDs', async () => {
    fakeClient();
    mockGoogle.signIn.mockResolvedValueOnce(googleSuccess());
    await supabaseAuthService.signInWithGoogle();
    expect(mockGoogle.configure).toHaveBeenCalledWith({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID });
  });

  it('sign in → logout → sign in again (same account) → logout → sign in', async () => {
    const client = fakeClient();
    for (let attempt = 1; attempt <= 3; attempt++) {
      mockGoogle.signIn.mockResolvedValueOnce(googleSuccess());
      expect(await supabaseAuthService.signInWithGoogle()).toMatchObject({ success: true, user: { id: 'google-user-1' } });
      expect(client.state.session).not.toBeNull();

      await supabaseAuthService.signOut();
      expect(client.state.session).toBeNull();
    }
    expect(client.auth.signInWithIdToken).toHaveBeenCalledTimes(3);
    expect(mockGoogle.signOut).toHaveBeenCalledTimes(3);
  });

  it('logout signs out of Supabase AND (best-effort) out of Google on the device', async () => {
    const client = fakeClient();
    client.state.session = { access_token: 'a', user: supabaseUser() };
    await supabaseAuthService.signOut();
    expect(client.auth.signOut).toHaveBeenCalled();
    expect(mockGoogle.signOut).toHaveBeenCalled();
    expect(client.auth.signOut.mock.invocationCallOrder[0]).toBeLessThan(mockGoogle.signOut.mock.invocationCallOrder[0]);
  });

  it('a failing Google sign-out never blocks logging out of the app', async () => {
    const client = fakeClient();
    client.state.session = { access_token: 'a', user: supabaseUser() };
    mockGoogle.signOut.mockRejectedValueOnce(new Error('SDK error'));
    await expect(supabaseAuthService.signOut()).resolves.toBeUndefined();
    expect(client.state.session).toBeNull();
  });

  it('cancelling Google’s sheet is a cancellation, not an error — and nothing reaches Supabase', async () => {
    const client = fakeClient();
    mockGoogle.signIn.mockResolvedValueOnce({ type: 'cancelled', data: null });
    expect(await supabaseAuthService.signInWithGoogle()).toEqual({ success: false, cancelled: true });
    expect(client.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('a SIGN_IN_CANCELLED error from the SDK is also a cancellation', async () => {
    fakeClient();
    mockGoogle.signIn.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { code: 'SIGN_IN_CANCELLED' }));
    expect(await supabaseAuthService.signInWithGoogle()).toEqual({ success: false, cancelled: true });
  });

  it('Google returning no ID token is a friendly, coded failure', async () => {
    const client = fakeClient();
    mockGoogle.signIn.mockResolvedValueOnce({ type: 'success', data: { idToken: null, user: { email: 'priya@example.com' } } });
    expect(await supabaseAuthService.signInWithGoogle()).toEqual({
      success: false,
      errorMessage: 'Could not complete sign-in. Please try again.',
      diagnosticCode: 'google_no_id_token',
    });
    expect(client.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('a Google SDK failure is a friendly message with the SDK code as diagnostic', async () => {
    fakeClient();
    mockGoogle.signIn.mockRejectedValueOnce(Object.assign(new Error('A sign-in is already in progress'), { code: 'IN_PROGRESS' }));
    expect(await supabaseAuthService.signInWithGoogle()).toEqual({
      success: false,
      errorMessage: 'Could not complete sign-in. Please try again.',
      diagnosticCode: 'google_in_progress',
    });
  });

  it('Supabase rejecting the ID token is a friendly message with Supabase’s error code — never the token', async () => {
    const client = fakeClient();
    const warn = console.warn as jest.Mock;
    mockGoogle.signIn.mockResolvedValueOnce({ type: 'success', data: { idToken: `forged-${SECRET}`, user: {} } });
    const result = await supabaseAuthService.signInWithGoogle();
    expect(result).toEqual({
      success: false,
      errorMessage: 'Could not complete sign-in. Please try again.',
      diagnosticCode: 'validation_failed',
    });
    expect(client.state.session).toBeNull();
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
  });

  it('after a failure, the next attempt still works', async () => {
    fakeClient();
    mockGoogle.signIn.mockRejectedValueOnce(Object.assign(new Error('network'), { code: '-5' }));
    expect(await supabaseAuthService.signInWithGoogle()).toMatchObject({ success: false });
    mockGoogle.signIn.mockResolvedValueOnce(googleSuccess());
    expect(await supabaseAuthService.signInWithGoogle()).toMatchObject({ success: true });
  });

  it('a double tap starts only one Google sign-in', async () => {
    fakeClient();
    mockGoogle.signIn.mockImplementation(async () => googleSuccess());
    const [a, b] = await Promise.all([supabaseAuthService.signInWithGoogle(), supabaseAuthService.signInWithGoogle()]);
    expect(a).toBe(b);
    expect(mockGoogle.signIn).toHaveBeenCalledTimes(1);
  });

  it('clears a session left behind by an incomplete sign-out before starting', async () => {
    const client = fakeClient();
    client.state.session = { access_token: 'stale', user: supabaseUser() };
    mockGoogle.signIn.mockResolvedValueOnce(googleSuccess());
    await supabaseAuthService.signInWithGoogle();
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(client.auth.signOut.mock.invocationCallOrder[0]).toBeLessThan(mockGoogle.signIn.mock.invocationCallOrder[0]);
  });

  it('linking Google to the signed-in account uses the same native ID token', async () => {
    const client = fakeClient();
    mockGoogle.signIn.mockResolvedValueOnce(googleSuccess());
    expect(await supabaseAuthService.linkIdentity('google')).toMatchObject({ success: true });
    expect(client.auth.linkIdentity).toHaveBeenCalledWith({ provider: 'google', token: expect.stringMatching(/^google-id-token-/) });
  });
});

describe('when native Google Sign-In is not in the build (e.g. Expo Go)', () => {
  it('reports a friendly "unavailable" instead of crashing', async () => {
    jest.resetModules();
    jest.doMock('@react-native-google-signin/google-signin', () => {
      throw new Error("TurboModuleRegistry.getEnforcing(...): 'RNGoogleSignin' could not be found.");
    });
    jest.doMock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn() }));
    const { supabaseAuthService: service } = require('../services/auth/supabaseAuthService');
    const { getSupabaseClient: getClient } = require('../services/supabaseClient');
    const signInWithIdToken = jest.fn();
    (getClient as jest.Mock).mockReturnValue({ auth: { getSession: async () => ({ data: { session: null } }), signInWithIdToken } });

    expect(await service.signInWithGoogle()).toEqual({
      success: false,
      errorMessage: 'Sign in with Google isn’t available in this version of the app.',
      diagnosticCode: 'google_signin_unavailable',
    });
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });
});
