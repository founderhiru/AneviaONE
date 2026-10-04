/**
 * Sign in with Apple, production path (supabaseAuthService): the native
 * sheet's identity token and nonce go to Supabase `signInWithIdToken`, the
 * result maps onto the same User model as Mobile/Google, private-relay
 * emails are handled, and nothing is attempted where Apple isn't available.
 * The Supabase client and the native modules are faked.
 */
import { Platform } from 'react-native';
import type { User as SupabaseUser } from '@supabase/supabase-js';

import { appleFullName, isApplePrivateRelayEmail } from '../services/auth/authInput';
import { isAppleSignInAvailable, resetAppleAvailabilityForTests } from '../services/auth/appleAuth';
import { supabaseAuthService, toDomainUser } from '../services/auth/supabaseAuthService';
import { getSupabaseClient } from '../services/supabaseClient';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  randomUUID: jest.fn(() => 'raw-nonce-123'),
  digestStringAsync: jest.fn(async (_alg: string, value: string) => `sha256(${value})`),
}));

const Apple = require('expo-apple-authentication');

const RELAY = 'x7k2p9@privaterelay.appleid.com';

function appleUser(overrides: Partial<SupabaseUser> = {}): SupabaseUser {
  return {
    id: 'apple-user-1',
    aud: 'authenticated',
    app_metadata: { provider: 'apple' },
    user_metadata: {},
    email: RELAY,
    created_at: '2026-10-05T10:00:00Z',
    identities: [
      {
        id: 'i1',
        identity_id: 'i1',
        user_id: 'apple-user-1',
        provider: 'apple',
        identity_data: { email: RELAY },
        created_at: '2026-10-05T10:00:00Z',
      },
    ],
    ...overrides,
  } as SupabaseUser;
}

function fakeClient(user: SupabaseUser | null, error: unknown = null) {
  const updates: { table: string; payload: unknown; filters: unknown[][] }[] = [];
  const client = {
    updates,
    auth: {
      signInWithIdToken: jest.fn(async () => ({ data: { user, session: user ? {} : null }, error })),
      linkIdentity: jest.fn(async () => ({ data: { user, session: {} }, error })),
      updateUser: jest.fn(async () => ({ data: {}, error: null })),
    },
    from: jest.fn((table: string) => {
      const record = { table, payload: undefined as unknown, filters: [] as unknown[][] };
      const builder = {
        select: () => builder,
        update: (payload: unknown) => ((record.payload = payload), updates.push(record), builder),
        eq: (...f: unknown[]) => (record.filters.push(['eq', ...f]), builder),
        is: (...f: unknown[]) => (record.filters.push(['is', ...f]), builder),
        maybeSingle: () => builder,
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: { onboarding_completed_at: null, display_name: null }, error: null }),
      };
      return builder;
    }),
  };
  (getSupabaseClient as jest.Mock).mockReturnValue(client);
  return client;
}

beforeEach(() => {
  Apple.__setAppleAvailableForTests(true);
  resetAppleAvailabilityForTests();
  Apple.signInAsync.mockReset();
});

describe('signInWithApple (Supabase)', () => {
  it('exchanges the Apple identity token and raw nonce with Supabase; Apple only sees the hashed nonce', async () => {
    const client = fakeClient(appleUser());
    Apple.signInAsync.mockResolvedValue({ identityToken: 'apple.jwt', fullName: null, email: RELAY });

    const result = await supabaseAuthService.signInWithApple();

    expect(Apple.signInAsync).toHaveBeenCalledWith({
      requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
      nonce: 'sha256(raw-nonce-123)',
    });
    expect(client.auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'apple.jwt', nonce: 'raw-nonce-123' });
    expect(result).toMatchObject({ success: true, isNewUser: true, user: { id: 'apple-user-1' } });
  });

  it('maps into the same account model, with a private-relay email shown as hidden', async () => {
    fakeClient(appleUser());
    Apple.signInAsync.mockResolvedValue({ identityToken: 'apple.jwt', fullName: null });
    const result = await supabaseAuthService.signInWithApple();
    if (!result.success) throw new Error('expected success');
    expect(result.user.email).toBe(RELAY); // deliverable via Apple's relay
    expect(result.user.linkedIdentities).toEqual([
      { provider: 'apple', displayValue: 'Email hidden by Apple', linkedAt: '2026-10-05T10:00:00Z' },
    ]);
  });

  it('keeps the name Apple shares on first authorisation, without overwriting an existing one', async () => {
    const client = fakeClient(appleUser());
    Apple.signInAsync.mockResolvedValue({ identityToken: 'apple.jwt', fullName: { givenName: 'Priya', familyName: 'Sharma' } });
    await supabaseAuthService.signInWithApple();
    expect(client.auth.updateUser).toHaveBeenCalledWith({
      data: { full_name: 'Priya Sharma', given_name: 'Priya', family_name: 'Sharma' },
    });
    expect(client.updates).toEqual([
      {
        table: 'profiles',
        payload: { display_name: 'Priya Sharma' },
        filters: [
          ['eq', 'id', 'apple-user-1'],
          ['is', 'display_name', null],
        ],
      },
    ]);
  });

  it('does not write a name on later sign-ins (Apple sends none)', async () => {
    const client = fakeClient(appleUser());
    Apple.signInAsync.mockResolvedValue({ identityToken: 'apple.jwt', fullName: { givenName: null, familyName: null } });
    await supabaseAuthService.signInWithApple();
    expect(client.auth.updateUser).not.toHaveBeenCalled();
    expect(client.updates).toEqual([]);
  });

  it('treats a dismissed Apple sheet as a cancellation, not an error', async () => {
    const client = fakeClient(appleUser());
    Apple.signInAsync.mockRejectedValue(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
    expect(await supabaseAuthService.signInWithApple()).toEqual({ success: false, cancelled: true });
    expect(client.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('returns a safe message, never the raw backend error', async () => {
    fakeClient(null, { message: 'Unacceptable audience in id_token: [host.exp.Exponent]', status: 400, code: 'bad_jwt' });
    Apple.signInAsync.mockResolvedValue({ identityToken: 'apple.jwt', fullName: null });
    expect(await supabaseAuthService.signInWithApple()).toEqual({
      success: false,
      errorMessage: 'Could not complete sign-in. Please try again.',
    });
  });

  it('does nothing where Sign in with Apple is unavailable', async () => {
    const client = fakeClient(appleUser());
    Apple.__setAppleAvailableForTests(false);
    expect(await supabaseAuthService.signInWithApple()).toEqual({
      success: false,
      errorMessage: 'Sign in with Apple isn’t available on this device.',
    });
    expect(Apple.signInAsync).not.toHaveBeenCalled();
    expect(client.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('refuses when the backend is not configured', async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(null);
    expect(await supabaseAuthService.signInWithApple()).toEqual({
      success: false,
      errorMessage: 'Sign-in is not available right now. Please try again later.',
    });
  });
});

describe('linking Apple to an existing account', () => {
  it('links via the identity token rather than creating a second account', async () => {
    const client = fakeClient(appleUser());
    Apple.signInAsync.mockResolvedValue({ identityToken: 'apple.jwt', fullName: null });
    const result = await supabaseAuthService.linkIdentity('apple');
    expect(client.auth.linkIdentity).toHaveBeenCalledWith({ provider: 'apple', token: 'apple.jwt', nonce: 'raw-nonce-123' });
    expect(client.auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, user: { id: 'apple-user-1' } });
  });
});

describe('Apple helpers', () => {
  it('availability is iOS-only', async () => {
    const os = Platform.OS;
    try {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
      resetAppleAvailabilityForTests();
      expect(await isAppleSignInAvailable()).toBe(false);
      expect(Apple.isAvailableAsync).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    }
  });

  it('recognises private-relay addresses and builds names', () => {
    expect(isApplePrivateRelayEmail(RELAY)).toBe(true);
    expect(isApplePrivateRelayEmail('X7K2P9@PrivateRelay.AppleID.com')).toBe(true);
    expect(isApplePrivateRelayEmail('priya@example.com')).toBe(false);
    expect(isApplePrivateRelayEmail(null)).toBe(false);
    expect(appleFullName({ givenName: ' Priya ', familyName: 'Sharma' })).toBe('Priya Sharma');
    expect(appleFullName({ givenName: null, familyName: null })).toBeNull();
    expect(appleFullName(null)).toBeNull();
  });

  it('toDomainUser maps an Apple identity with a real email as a masked email', () => {
    const user = toDomainUser(
      appleUser({ email: 'priya@example.com', identities: [{ ...appleUser().identities![0], identity_data: { email: 'priya@example.com' } }] }),
      null
    );
    expect(user.linkedIdentities[0]).toMatchObject({ provider: 'apple', displayValue: 'pr•••@example.com' });
  });
});
