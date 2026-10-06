/**
 * Repeated native Google sign-in for the SAME account through the REAL
 * supabase-js client and the app's real Keychain storage adapter
 * (`secureStorageAdapter` over the in-memory expo-secure-store mock),
 * against a fake Supabase Auth server that behaves like the real one
 * (supabase/auth v2.197, `POST /token?grant_type=id_token`):
 *
 *   - a Google ID token is accepted only if its audience is one of the
 *     Google provider's configured client IDs (token_oidc.go);
 *   - global sign-out revokes the user's sessions.
 *
 * The Google SDK is mocked to return a fresh ID token per sign-in.
 * Covers: first → logout → second → logout → third → force-quit/reopen →
 * logout → sign in, and that no OAuth browser, redirect, PKCE code or flow
 * state is ever involved.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '../config/googleAuth';
import { resetGoogleSigninForTests } from '../services/auth/googleAuth';
import { secureStorageAdapter } from '../services/auth/secureStorageAdapter';
import { supabaseAuthService } from '../services/auth/supabaseAuthService';
import { getSupabaseClient } from '../services/supabaseClient';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn() }));

/** Google's SDK: each sign-in returns a fresh ID token whose audience is the
 * web client ID (what `webClientId` asks Google for). */
let issued = 0;
const mockGoogle = {
  configure: jest.fn(),
  signIn: jest.fn(async () => {
    issued += 1;
    return { type: 'success', data: { idToken: `idtoken.aud=${GOOGLE_WEB_CLIENT_ID}.n${issued}`, user: { email: 'priya@example.com' } } };
  }),
  signOut: jest.fn(async () => null),
};
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: mockGoogle,
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
  isSuccessResponse: (r: { type: string }) => r.type === 'success',
  isCancelledResponse: (r: { type: string }) => r.type === 'cancelled',
  isErrorWithCode: (e: unknown) => typeof (e as { code?: unknown })?.code === 'string',
}));

const { __clearSecureStoreForTests } = require('expo-secure-store');
const SUPABASE_URL = 'https://example.supabase.co';
const STORAGE_KEY = 'sb-example-auth-token';
/** Supabase → Authentication → Providers → Google → Client IDs. */
const SUPABASE_GOOGLE_CLIENT_IDS = [GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID];

const user = {
  id: 'google-user-1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'priya@example.com',
  app_metadata: { provider: 'google' },
  user_metadata: {},
  identities: [],
  created_at: '2026-10-05T07:47:11Z',
};

function fakeAuthServer() {
  const calls: string[] = [];
  let sessions = 0;
  let live = 0;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const fetch = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const grant = url.searchParams.get('grant_type');
    calls.push(`${init.method ?? 'GET'} ${url.pathname}${grant ? `?grant_type=${grant}` : ''}`);
    if (url.pathname === '/auth/v1/token' && grant === 'id_token') {
      const body = JSON.parse(String(init.body));
      const audience = /aud=([^.]+(?:\.[^.]+)*?\.apps\.googleusercontent\.com)/.exec(body.id_token ?? '')?.[1];
      if (body.provider !== 'google' || !audience || !SUPABASE_GOOGLE_CLIENT_IDS.includes(audience)) {
        return json(400, { code: 400, error_code: 'validation_failed', msg: 'Unacceptable audience in id_token' });
      }
      sessions += 1;
      live += 1;
      const exp = Math.floor(Date.now() / 1000) + 3600;
      return json(200, {
        access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: user.id, exp, aud: 'authenticated', role: 'authenticated', session_id: `s${sessions}` })}.sig`,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: exp,
        refresh_token: `refresh-${sessions}`,
        user,
      });
    }
    if (url.pathname === '/auth/v1/logout') {
      live = 0;
      return json(204);
    }
    if (url.pathname.startsWith('/rest/v1/profiles')) {
      return json(200, [{ onboarding_completed_at: '2026-10-05T07:48:00Z', display_name: null }]);
    }
    return json(404, { msg: `unhandled ${url.pathname}` });
  });

  return { fetch, calls, liveSessions: () => live };
}

type Server = ReturnType<typeof fakeAuthServer>;

function newClient(server: Server): SupabaseClient {
  const client = createClient(SUPABASE_URL, 'anon-key', {
    auth: { storage: secureStorageAdapter, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
    global: { fetch: server.fetch as unknown as typeof fetch },
  });
  (getSupabaseClient as jest.Mock).mockReturnValue(client);
  return client;
}

async function sessionStored(): Promise<boolean> {
  const SecureStore = require('expo-secure-store');
  return (await SecureStore.getItemAsync(`${STORAGE_KEY}.chunks`)) !== null;
}

beforeEach(() => {
  __clearSecureStoreForTests();
  resetGoogleSigninForTests();
  mockGoogle.signIn.mockClear();
  mockGoogle.signOut.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('repeated native Google sign-in, same account (real supabase-js + Keychain adapter)', () => {
  it('first → logout → second → logout → third → force-quit/reopen → logout → sign in: every one succeeds', async () => {
    const server = fakeAuthServer();
    let client = newClient(server);

    // 1. First sign-in
    expect(await supabaseAuthService.signInWithGoogle()).toMatchObject({ success: true, user: { id: user.id } });
    expect(await sessionStored()).toBe(true);

    // 2. Logout: device session gone, server sessions revoked, Google signed out
    await supabaseAuthService.signOut();
    expect(await sessionStored()).toBe(false);
    expect(server.liveSessions()).toBe(0);

    // 3. Second sign-in with the same account — the production failure case
    expect(await supabaseAuthService.signInWithGoogle()).toMatchObject({ success: true, user: { id: user.id } });

    // 4–5. Logout, third sign-in
    await supabaseAuthService.signOut();
    expect(await supabaseAuthService.signInWithGoogle()).toMatchObject({ success: true });

    // 6. Force-quit and reopen: a new client over the same Keychain restores the session
    client.auth.stopAutoRefresh();
    client = newClient(server);
    expect((await client.auth.getSession()).data.session?.user.id).toBe(user.id);

    // 7. Logout, then sign in again on the reopened app
    await supabaseAuthService.signOut();
    expect(await supabaseAuthService.signInWithGoogle()).toMatchObject({ success: true });
    expect((await client.auth.getSession()).data.session?.user.id).toBe(user.id);

    // Every sign-in was a single ID-token exchange — no PKCE code, no flow state.
    const tokenCalls = server.calls.filter((c) => c.startsWith('POST /auth/v1/token'));
    expect(tokenCalls).toEqual(Array(4).fill('POST /auth/v1/token?grant_type=id_token'));
    expect(mockGoogle.signOut).toHaveBeenCalledTimes(3);
  });

  it('Supabase rejecting the token (audience not configured) stores nothing and reports Supabase’s code', async () => {
    const server = fakeAuthServer();
    newClient(server);
    mockGoogle.signIn.mockResolvedValueOnce({ type: 'success', data: { idToken: 'idtoken.aud=999-other.apps.googleusercontent.com.n0', user: { email: 'priya@example.com' } } });
    expect(await supabaseAuthService.signInWithGoogle()).toEqual({
      success: false,
      errorMessage: 'Could not complete sign-in. Please try again.',
      diagnosticCode: 'validation_failed',
    });
    expect(await sessionStored()).toBe(false);
  });
});
