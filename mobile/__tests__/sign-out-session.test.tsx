/**
 * Sign-out must end the session on this device — always, quickly, and for
 * good — even when the network is down and the access token has expired
 * (e.g. a simulator or phone left idle, then signed out on a bad network).
 *
 * Uses the REAL supabase-js client against an in-memory session store and a
 * fake network, so the library's own refresh/lock behaviour is exercised.
 * Synthetic tokens only.
 */
import React from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useFocusEffect, useSegments } from 'expo-router';

import MeScreen from '../app/(tabs)/me';
import RootLayout from '../app/_layout';
import { useAuth } from '../hooks/useAuth';
import { AuthProvider } from '../hooks/useAuth';
import { supabaseAuthService } from '../services/auth/supabaseAuthService';
import { profileService } from '../services/profile/profileService';
import { getSupabaseClient } from '../services/supabaseClient';
import { renderWithProviders } from './testUtils';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(), isSupabaseConfigured: true }));
// The app's auth service, as in a production build (tests otherwise run in demo mode).
jest.mock('../services/auth/authService', () => ({
  authService: jest.requireActual('../services/auth/supabaseAuthService').supabaseAuthService,
}));
jest.mock('../services/auth/googleAuth', () => ({
  ...jest.requireActual('../services/auth/googleAuth'),
  signOutOfGoogle: jest.fn(async () => undefined),
}));

const URL = 'https://abcdefghijklmnop.supabase.co';
const STORAGE_KEY = 'sb-abcdefghijklmnop-auth-token';
const USER_ID = '22222222-2222-4222-8222-222222222222';

/** A syntactically valid, synthetic JWT (never verified client-side beyond decoding). */
function jwt(expSecondsFromNow: number) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, exp, role: 'authenticated', aud: 'authenticated' })}.c2lnbmF0dXJl`;
}

function storedSession(expSecondsFromNow: number) {
  return JSON.stringify({
    access_token: jwt(expSecondsFromNow),
    refresh_token: 'synthetic-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + expSecondsFromNow,
    user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' },
  });
}

type Network = 'down' | 'up' | 'hangs';

function makeClient(initial: Network, session: string | Map<string, string>) {
  let network: Network = initial;
  // A Map is the same device storage reused by a fresh client (an app relaunch).
  const store = session instanceof Map ? session : new Map<string, string>([[STORAGE_KEY, session]]);
  const storage = {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
  };
  const calls: string[] = [];
  const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
    calls.push(String(input).replace(URL, ''));
    if (network === 'down') throw new TypeError('Network request failed');
    if (network === 'hangs') return new Promise<Response>(() => {});
    if (String(input).includes('grant_type=refresh_token')) {
      // A working network would refresh the (stored) session and restore it.
      return new Response(storedSession(3600), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(null, { status: 204 });
  });
  const client = createClient(URL, 'synthetic-anon-key', {
    auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce' },
    global: { fetch: fetchImpl as unknown as typeof fetch },
  });
  (getSupabaseClient as jest.Mock).mockReturnValue(client);
  return { client: client as SupabaseClient, store, calls, setNetwork: (n: Network) => (network = n) };
}

/** Runs `fn` while advancing fake time, so the library's retries/back-off can play out. */
async function withTime<T>(fn: () => Promise<T>, maxMs = 120_000): Promise<{ value: T; elapsedMs: number }> {
  let done = false;
  let value: T;
  const started = Date.now();
  const p = fn().then((v) => {
    done = true;
    value = v;
  });
  while (!done && Date.now() - started < maxMs) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
  }
  if (!done) throw new Error(`did not finish within ${maxMs / 1000}s of (simulated) time`);
  await p;
  return { value: value!, elapsedMs: Date.now() - started };
}

/** Advances (simulated) time until `cond` holds. */
async function until(cond: () => boolean, maxMs = 30_000) {
  const started = Date.now();
  while (!cond() && Date.now() - started < maxMs) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });
  }
  if (!cond()) throw new Error(`condition not met within ${maxMs / 1000}s of (simulated) time`);
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-09T12:00:00Z') });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('signing out ends the session on this device', () => {
  it('network fine: session removed, server told', async () => {
    const { store, calls } = makeClient('up', storedSession(3600));
    await withTime(() => supabaseAuthService.signOut());
    expect(store.has(STORAGE_KEY)).toBe(false);
    expect(calls.some((c) => c.startsWith('/auth/v1/logout'))).toBe(true);
  });

  it('network down, token still valid: session removed', async () => {
    const { store } = makeClient('down', storedSession(3600));
    await withTime(() => supabaseAuthService.signOut());
    expect(store.has(STORAGE_KEY)).toBe(false);
  });

  it('network down AND access token expired (idle device): session still removed, promptly', async () => {
    const { store } = makeClient('down', storedSession(-600));
    const { elapsedMs } = await withTime(() => supabaseAuthService.signOut());
    expect(store.has(STORAGE_KEY)).toBe(false);
    expect(elapsedMs).toBeLessThanOrEqual(10_000);
  });

  it('server never answers: sign-out still finishes and the session is gone', async () => {
    const { store } = makeClient('hangs', storedSession(3600));
    const { elapsedMs } = await withTime(() => supabaseAuthService.signOut());
    expect(store.has(STORAGE_KEY)).toBe(false);
    expect(elapsedMs).toBeLessThanOrEqual(10_000);
  });

  it('signed out offline, then the network returns: the next launch stays signed out', async () => {
    const { store } = makeClient('down', storedSession(-600));
    await withTime(() => supabaseAuthService.signOut());
    // Relaunch: a new client over the same device storage, network back.
    makeClient('up', store);
    const { value: restored } = await withTime(() => supabaseAuthService.getCurrentUser());
    expect(restored).toBeNull();
  });
});

describe('the Me screen sign-out, end to end through the app state', () => {
  let current: () => ReturnType<typeof useAuth> | null = () => null;
  function Capture() {
    const auth = useAuth();
    current = () => auth;
    return null;
  }

  beforeEach(() => {
    (useFocusEffect as jest.Mock).mockImplementation((effect: () => void) => {
      React.useEffect(effect, [effect]);
    });
    jest.spyOn(profileService, 'getMyIdentity').mockResolvedValue({ fullName: null, dateOfBirth: null });
  });

  it('tapping Sign out on a bad network signs out the app and clears the stored session', async () => {
    const { store } = makeClient('down', storedSession(-600));
    jest.spyOn(supabaseAuthService, 'getCurrentUser').mockResolvedValueOnce({
      id: USER_ID, createdAt: '2026-10-01T00:00:00Z', linkedIdentities: [], onboardingComplete: true,
      identityOnboardingComplete: true, identityUploadPromptSeen: true,
    });
    await renderWithProviders(
      <AuthProvider>
        <MeScreen />
        <Capture />
      </AuthProvider>
    );
    await until(() => Boolean(current()?.user));
    expect(current()?.user?.id).toBe(USER_ID);

    await act(async () => {
      fireEvent.press(screen.getByTestId('me-sign-out'));
    });
    await until(() => current()?.user === null);
    expect(current()?.user).toBeNull();
    expect(store.has(STORAGE_KEY)).toBe(false);
  });

  it('once signed out, the signed-in screens send the person to Welcome', async () => {
    (useSegments as jest.Mock).mockReturnValue(['(tabs)', 'me']);
    makeClient('down', storedSession(-600));
    await withTime(() => supabaseAuthService.signOut());
    (router.replace as jest.Mock).mockClear();
    await act(async () => {
      await renderWithProviders(<RootLayout />);
    });
    await until(() => (router.replace as jest.Mock).mock.calls.length > 0);
    expect(router.replace).toHaveBeenCalledWith('/(auth)/welcome');
    expect(router.replace).not.toHaveBeenCalledWith('/(tabs)/home');
  });
});

describe('the Sign out row while signing out', () => {
  it('shows progress and a second tap does not start a second sign-out', async () => {
    (useFocusEffect as jest.Mock).mockImplementation((effect: () => void) => {
      React.useEffect(effect, [effect]);
    });
    jest.spyOn(profileService, 'getMyIdentity').mockResolvedValue({ fullName: null, dateOfBirth: null });
    makeClient('hangs', storedSession(3600));
    jest.spyOn(supabaseAuthService, 'getCurrentUser').mockResolvedValueOnce({
      id: USER_ID, createdAt: '2026-10-01T00:00:00Z', linkedIdentities: [], onboardingComplete: true,
      identityOnboardingComplete: true, identityUploadPromptSeen: true,
    });
    const signOut = jest.spyOn(supabaseAuthService, 'signOut');
    await renderWithProviders(
      <AuthProvider>
        <MeScreen />
      </AuthProvider>
    );
    await until(() => screen.queryByText('Sign out') !== null);
    await act(async () => {
      fireEvent.press(screen.getByTestId('me-sign-out'));
    });
    expect(screen.getByText('Signing out…')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('me-sign-out'));
    });
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
