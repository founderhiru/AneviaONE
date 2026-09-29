import type { AuthProvider, User } from '../../types';

export type SendOtpResult = { success: true } | { success: false; errorMessage: string };

export type VerifyOtpResult =
  | { success: true; user: User; isNewUser: boolean }
  | { success: false; errorMessage: string };

export type GoogleSignInResult =
  | { success: true; user: User; isNewUser: boolean }
  | { success: false; errorMessage: string }
  | { success: false; cancelled: true };

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
  /** Starts Google OAuth via Supabase Auth + `expo-auth-session`. */
  signInWithGoogle(): Promise<GoogleSignInResult>;
  /** Links a second identity (e.g. Google) to the currently signed-in
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
