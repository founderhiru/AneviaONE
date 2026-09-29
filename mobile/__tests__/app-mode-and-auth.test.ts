/* eslint-disable @typescript-eslint/no-require-imports -- jest.isolateModules needs require() to load fresh module instances */
/**
 * App mode, service selection (production must never fall back to mocks),
 * encrypted session storage, and auth input/mapping.
 */
import * as SecureStore from 'expo-secure-store';

import { resolveAppMode } from '../config/appMode';
import { isValidEmail, maskEmail, normalizeEmail, normalizeMobileNumber } from '../services/auth/authInput';
import { SECURE_CHUNK_SIZE, secureStorageAdapter } from '../services/auth/secureStorageAdapter';
import { toDomainUser } from '../services/auth/supabaseAuthService';

describe('resolveAppMode', () => {
  const configured = { supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'anon-key' };

  it('defaults to production when Supabase is configured', () => {
    expect(resolveAppMode(configured)).toEqual({ mode: 'production', supabaseConfigured: true });
  });

  it('reports a configuration error instead of falling back when production is unconfigured', () => {
    expect(resolveAppMode({})).toMatchObject({ mode: 'production', configurationError: expect.stringMatching(/not configured/) });
    expect(resolveAppMode({ supabaseUrl: 'https://abc.supabase.co' }).configurationError).toBeTruthy();
  });

  it('uses demo mode only when explicitly requested', () => {
    expect(resolveAppMode({ appMode: 'demo' }).mode).toBe('demo');
    expect(resolveAppMode({ ...configured, appMode: 'DEMO' }).mode).toBe('demo');
  });

  it('rejects unknown modes', () => {
    expect(resolveAppMode({ ...configured, appMode: 'mock' }).configurationError).toMatch(/Unknown EXPO_PUBLIC_APP_MODE/);
  });
});

describe('service selection by mode', () => {
  function load(env: Record<string, string>) {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    let loaded: Record<string, unknown> = {};
    jest.isolateModules(() => {
      const auth = require('../services/auth/authService');
      const docs = require('../services/documents/documentsService');
      const health = require('../services/health/healthService');
      const ai = require('../services/ai/aiService');
      const profile = require('../services/profile/profileService');
      loaded = {
        authService: auth.authService,
        mockAuthService: require('../services/auth/mockAuthService').mockAuthService,
        supabaseAuthService: require('../services/auth/supabaseAuthService').supabaseAuthService,
        documentsService: docs.documentsService,
        supabaseDocumentsService: require('../services/documents/supabaseDocumentsService').supabaseDocumentsService,
        demoDocumentsService: require('../services/documents/demoDocumentsService').demoDocumentsService,
        healthService: health.healthService,
        productionHealthService: health.productionHealthService,
        aiService: ai.aiService,
        productionAiService: ai.productionAiService,
        profileService: profile.profileService,
        productionProfileService: profile.productionProfileService,
        client: require('../services/supabaseClient').getSupabaseClient(),
      };
    });
    process.env = saved;
    return loaded;
  }

  const configured = { EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' };

  it('production uses the real/production implementations everywhere', () => {
    const s = load({ EXPO_PUBLIC_APP_MODE: 'production', ...configured });
    expect(s.authService).toBe(s.supabaseAuthService);
    expect(s.documentsService).toBe(s.supabaseDocumentsService);
    expect(s.healthService).toBe(s.productionHealthService);
    expect(s.aiService).toBe(s.productionAiService);
    expect(s.profileService).toBe(s.productionProfileService);
    expect(s.client).not.toBeNull();
  });

  it('production WITHOUT configuration still never selects a mock', () => {
    const s = load({ EXPO_PUBLIC_APP_MODE: 'production', EXPO_PUBLIC_SUPABASE_URL: '', EXPO_PUBLIC_SUPABASE_ANON_KEY: '' });
    expect(s.authService).not.toBe(s.mockAuthService);
    expect(s.documentsService).not.toBe(s.demoDocumentsService);
    expect(s.healthService).toBe(s.productionHealthService);
    expect(s.client).toBeNull();
  });

  it('demo mode uses the isolated mocks and never creates a Supabase client', () => {
    const s = load({ EXPO_PUBLIC_APP_MODE: 'demo', ...configured });
    expect(s.authService).toBe(s.mockAuthService);
    expect(s.documentsService).toBe(s.demoDocumentsService);
    expect(s.healthService).not.toBe(s.productionHealthService);
    expect(s.client).toBeNull();
  });
});

describe('sign-in input', () => {
  it('normalises Indian mobile numbers to E.164', () => {
    expect(normalizeMobileNumber('98765 43210')).toBe('+919876543210');
    expect(normalizeMobileNumber('+91 98765-43210')).toBe('+919876543210');
    expect(normalizeMobileNumber('12345')).toBeNull();
  });

  it('validates, normalises and masks emails', () => {
    expect(isValidEmail(' Person@Example.com ')).toBe(true);
    expect(normalizeEmail(' Person@Example.com ')).toBe('person@example.com');
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(maskEmail('priya@example.com')).toBe('pr•••@example.com');
  });
});

describe('toDomainUser', () => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'priya@example.com',
    phone: '',
    created_at: '2026-09-29T10:00:00Z',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    identities: [
      { id: 'x', identity_id: 'x', user_id: 'u', provider: 'email', identity_data: { email: 'priya@example.com' }, created_at: '2026-09-29T10:00:00Z' },
    ],
  };

  it('maps an email identity and reads onboarding from the profile row', () => {
    const mapped = toDomainUser(user as never, { onboarding_completed_at: '2026-09-29T10:05:00Z', display_name: 'Priya' });
    expect(mapped.linkedIdentities[0]).toMatchObject({ provider: 'email', displayValue: 'pr•••@example.com' });
    expect(mapped.onboardingComplete).toBe(true);
  });

  it('treats a missing/incomplete profile as needing onboarding', () => {
    expect(toDomainUser(user as never, null).onboardingComplete).toBe(false);
  });
});

describe('secureStorageAdapter (session in Keychain/Keystore, not AsyncStorage)', () => {
  beforeEach(() => (SecureStore as unknown as { __clearSecureStoreForTests: () => void }).__clearSecureStoreForTests());

  it('round-trips a large session across chunks', async () => {
    const session = JSON.stringify({ access_token: 'a'.repeat(3000), refresh_token: 'r'.repeat(900) });
    await secureStorageAdapter.setItem('sb-test-auth-token', session);
    expect(await secureStorageAdapter.getItem('sb-test-auth-token')).toBe(session);
  });

  it('cleans up leftover chunks on shrink and removal', async () => {
    await secureStorageAdapter.setItem('k', 'x'.repeat(SECURE_CHUNK_SIZE * 3));
    await secureStorageAdapter.setItem('k', 'short');
    expect(await SecureStore.getItemAsync('k.1')).toBeNull();
    await secureStorageAdapter.removeItem('k');
    expect(await secureStorageAdapter.getItem('k')).toBeNull();
  });

  it('treats a torn write as signed out', async () => {
    await secureStorageAdapter.setItem('k', 'x'.repeat(SECURE_CHUNK_SIZE * 2));
    await SecureStore.deleteItemAsync('k.1');
    expect(await secureStorageAdapter.getItem('k')).toBeNull();
  });
});
