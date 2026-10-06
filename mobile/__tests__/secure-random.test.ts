/**
 * PKCE randomness: on Hermes there is no Web Crypto, so supabase-js would
 * generate the code verifier with Math.random(). `installSecureRandom`
 * provides expo-crypto's native generator instead, and leaves runtimes that
 * already have one alone.
 */
import { getRandomValues } from 'expo-crypto';

import { installSecureRandom } from '../services/auth/secureRandom';

jest.mock('expo-crypto', () => ({
  getRandomValues: jest.fn(<T extends ArrayBufferView>(array: T) => require('crypto').getRandomValues(array)),
}));

const { generatePKCEVerifier } = require('@supabase/auth-js/dist/main/lib/helpers');

type Runtime = NonNullable<Parameters<typeof installSecureRandom>[0]>;

describe('installSecureRandom', () => {
  it('installs a secure getRandomValues where the runtime has no crypto (Hermes)', () => {
    const runtime: Runtime = {};
    expect(installSecureRandom(runtime)).toBe(true);
    const bytes = new Uint8Array(16);
    runtime.crypto!.getRandomValues!(bytes);
    expect(getRandomValues).toHaveBeenCalledWith(bytes);
  });

  it('adds getRandomValues to a partial crypto object', () => {
    const runtime: Runtime = { crypto: {} };
    expect(installSecureRandom(runtime)).toBe(true);
    expect(typeof runtime.crypto!.getRandomValues).toBe('function');
  });

  it('leaves an existing secure implementation untouched', () => {
    const own = jest.fn();
    const runtime = { crypto: { getRandomValues: own } };
    expect(installSecureRandom(runtime)).toBe(false);
    expect(runtime.crypto.getRandomValues).toBe(own);
  });

  it('with it, supabase-js generates the verifier from secure random bytes, not Math.random', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const mathRandom = jest.spyOn(Math, 'random');
    try {
      Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
      installSecureRandom();
      (getRandomValues as jest.Mock).mockClear();
      const verifier: string = generatePKCEVerifier();
      expect(getRandomValues).toHaveBeenCalled();
      expect(mathRandom).not.toHaveBeenCalled();
      // 56 random 32-bit values → 112 hex characters (the Math.random fallback gives 56).
      expect(verifier).toMatch(/^[0-9a-f]{112}$/);
    } finally {
      mathRandom.mockRestore();
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});
