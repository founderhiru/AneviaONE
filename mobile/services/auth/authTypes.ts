import type { AuthProvider, User } from '../../types';

export type SendOtpResult = { success: true } | { success: false; errorMessage: string };

export type VerifyOtpResult =
  | { success: true; user: User; isNewUser: boolean }
  | { success: false; errorMessage: string };

export type GoogleSignInResult =
  | { success: true; user: User; isNewUser: boolean }
  /** `diagnosticCode`: a short, non-secret reason (e.g. `bad_code_verifier`)
   * for support and TestFlight diagnosis — never a token, code or email. */
  | { success: false; errorMessage: string; diagnosticCode?: string }
  | { success: false; cancelled: true };

/** Native Sign in with Apple; same outcomes as Google. */
export type AppleSignInResult = GoogleSignInResult;

export type LinkIdentityResult = { success: true; user: User } | { success: false; errorMessage: string };

/**
 * Auth service contract. Screens depend only on this interface — never on
 * Supabase directly. `authService.ts` picks the real Supabase implementation
 * in production and the mock ONLY in explicit demo mode (config/appMode.ts).
 *
 * All `errorMessage` values are safe to show to people; raw backend errors
 * are never passed through.
 */
export interface AuthService {
  /** Sends a one-time passcode by SMS via Supabase Auth (phone OTP). We
   * never generate or store OTPs ourselves. */
  sendMobileOtp(mobileNumber: string): Promise<SendOtpResult>;
  /** Verifies the SMS code and returns/creates the linked user. */
  verifyMobileOtp(mobileNumber: string, otp: string): Promise<VerifyOtpResult>;
  /** Sends a one-time passcode by email via Supabase Auth (no password). */
  sendEmailOtp(email: string): Promise<SendOtpResult>;
  /** Verifies the emailed code and returns/creates the linked user. */
  verifyEmailOtp(email: string, otp: string): Promise<VerifyOtpResult>;
  /** Completes sign-in from the link in that same email, when it is opened
   * on this device: exchanges the link's one-time code for a session. */
  completeEmailLink(code: string): Promise<VerifyOtpResult>;
  /** Native Google Sign-In (Google's iOS SDK): the Google ID token is
   * exchanged for a Supabase session via `signInWithIdToken` — the same
   * account model as the other methods. */
  signInWithGoogle(): Promise<GoogleSignInResult>;
  /** Native Sign in with Apple (iOS): the system sheet's identity token is
   * exchanged for a Supabase session — the same account model as the other
   * methods. Fails safely where Apple sign-in isn't available. */
  signInWithApple(): Promise<AppleSignInResult>;
  /** Links a second identity (Google or Apple) to the currently signed-in
   * account rather than creating a duplicate Health Memory. */
  linkIdentity(provider: AuthProvider): Promise<LinkIdentityResult>;
  /** The signed-in user restored from the persisted session, or null. */
  getCurrentUser(): Promise<User | null>;
  /** Persists that the signed-in user has finished onboarding. */
  completeOnboarding(): Promise<void>;
  /** Notifies when the session ends outside the app's control (expired or
   * revoked refresh token, sign-out elsewhere). Returns an unsubscribe fn. */
  onSignedOut(listener: () => void): () => void;
  signOut(): Promise<void>;
}
