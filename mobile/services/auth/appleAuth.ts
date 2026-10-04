import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

/**
 * Native Sign in with Apple (iOS only, via `expo-apple-authentication`).
 * This file only talks to the device; exchanging the identity token for a
 * Supabase session happens in the auth services.
 */

let availability: Promise<boolean> | null = null;

/**
 * True only where the system Apple sign-in sheet can actually be shown:
 * iOS 13+ with Sign in with Apple available. Always false on Android/web.
 * Cached — the answer can't change while the app runs.
 */
export function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return Promise.resolve(false);
  availability ??= AppleAuthentication.isAvailableAsync().catch(() => false);
  return availability;
}

/** For tests: forget the cached availability. */
export function resetAppleAvailabilityForTests() {
  availability = null;
}

export type AppleCredentialResult =
  | {
      kind: 'success';
      identityToken: string;
      /** The raw nonce; Apple signed its SHA-256 into the token. */
      rawNonce: string;
      /** Only present the first time this Apple ID authorises the app. */
      fullName: AppleAuthentication.AppleAuthenticationFullName | null;
    }
  | { kind: 'cancelled' }
  | { kind: 'error'; error: Error };

/**
 * Shows the system Apple sheet asking for name and email. A fresh random
 * nonce is hashed into the request and the raw value returned, so Supabase
 * can reject a replayed identity token.
 */
export async function requestAppleCredential(): Promise<AppleCredentialResult> {
  const rawNonce = Crypto.randomUUID();
  try {
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) return { kind: 'error', error: new Error('Apple returned no identity token.') };
    return { kind: 'success', identityToken: credential.identityToken, rawNonce, fullName: credential.fullName };
  } catch (error) {
    if ((error as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return { kind: 'cancelled' };
    return { kind: 'error', error: error instanceof Error ? error : new Error(String(error)) };
  }
}
