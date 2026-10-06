import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '../../config/googleAuth';

/**
 * Native Google Sign-In (Google's own iOS SDK, via
 * `@react-native-google-signin/google-signin`). This file only talks to the
 * device and Google; exchanging the ID token for a Supabase session happens
 * in the auth services — the same shape as `appleAuth.ts`.
 *
 * The package resolves its native module as soon as it is imported, which
 * throws where that module isn't built in (Expo Go, unit tests), so it is
 * loaded lazily and its absence reported as `unavailable`.
 */

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

let module: GoogleSigninModule | null | undefined;
let configured = false;

function loadGoogleSignin(): GoogleSigninModule | null {
  if (module !== undefined) return module;
  try {
    module = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
  } catch {
    module = null;
  }
  return module;
}

function configuredGoogleSignin(): GoogleSigninModule | null {
  const google = loadGoogleSignin();
  if (google && !configured) {
    // webClientId makes Google issue an ID token for Supabase to verify;
    // iosClientId identifies this iOS app to Google.
    google.GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID });
    configured = true;
  }
  return google;
}

/** For tests: forget the loaded module and configuration. */
export function resetGoogleSigninForTests() {
  module = undefined;
  configured = false;
}

export type GoogleIdTokenResult =
  | { kind: 'success'; idToken: string }
  | { kind: 'cancelled' }
  /** Native Google Sign-In isn't part of this build (e.g. Expo Go). */
  | { kind: 'unavailable' }
  /** Google signed the person in but returned no ID token. */
  | { kind: 'no_id_token' }
  | { kind: 'error'; error: Error & { code?: string } };

/** Shows Google's native sign-in and returns the Google ID token. */
export async function requestGoogleIdToken(): Promise<GoogleIdTokenResult> {
  const google = configuredGoogleSignin();
  if (!google) return { kind: 'unavailable' };
  try {
    const response = await google.GoogleSignin.signIn();
    if (google.isCancelledResponse(response)) return { kind: 'cancelled' };
    const idToken = google.isSuccessResponse(response) ? response.data.idToken : null;
    return idToken ? { kind: 'success', idToken } : { kind: 'no_id_token' };
  } catch (error) {
    if (google.isErrorWithCode(error) && error.code === google.statusCodes.SIGN_IN_CANCELLED) return { kind: 'cancelled' };
    return { kind: 'error', error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Ends the Google SDK's own sign-in on this device, so the next Google
 * sign-in offers the account choice again. Best-effort: never throws, and
 * never blocks signing out of the app.
 */
export async function signOutOfGoogle(): Promise<void> {
  const google = loadGoogleSignin();
  if (!google) return;
  try {
    configuredGoogleSignin();
    await google.GoogleSignin.signOut();
  } catch {
    // Nothing to sign out of, or the SDK is unavailable — app sign-out proceeds.
  }
}
