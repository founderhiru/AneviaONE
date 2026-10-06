import { getRandomValues } from 'expo-crypto';

type CryptoLike = { getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T };

/**
 * Gives the JS runtime a cryptographically secure `crypto.getRandomValues`.
 *
 * Hermes (React Native) has no Web Crypto, so supabase-js falls back to
 * `Math.random()` when it generates the PKCE code verifier and flow id —
 * predictable values for a credential that must be unguessable. This routes
 * them through `expo-crypto`'s native generator (already part of the app for
 * Sign in with Apple; no new native module). Anything that already provides
 * `getRandomValues` (a newer runtime, Node in tests) is left untouched.
 *
 * Must run before the Supabase client is first used — `supabaseClient.ts`
 * imports this module first.
 */
export function installSecureRandom(target: { crypto?: CryptoLike } = globalThis as unknown as { crypto?: CryptoLike }): boolean {
  const existing = target.crypto;
  if (existing && typeof existing.getRandomValues === 'function') return false;
  const secureGetRandomValues = getRandomValues as unknown as NonNullable<CryptoLike['getRandomValues']>;
  if (existing) {
    existing.getRandomValues = secureGetRandomValues;
  } else {
    Object.defineProperty(target, 'crypto', {
      value: { getRandomValues: secureGetRandomValues },
      configurable: true,
      enumerable: false,
      writable: true,
    });
  }
  return true;
}

installSecureRandom();
