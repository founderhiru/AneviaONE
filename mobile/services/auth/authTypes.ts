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
 * Supabase directly — so the mock implementation can be swapped for a real
 * Supabase-backed one without touching any screen.
 */
export interface AuthService {
  /** Sends a one-time passcode to the given mobile number via Supabase Auth
   * (phone OTP). We never generate or store OTPs ourselves. */
  sendMobileOtp(mobileNumber: string): Promise<SendOtpResult>;
  /** Verifies the OTP and returns/creates the linked user. */
  verifyMobileOtp(mobileNumber: string, otp: string): Promise<VerifyOtpResult>;
  /** Starts Google OAuth via Supabase Auth + `expo-auth-session`. */
  signInWithGoogle(): Promise<GoogleSignInResult>;
  /** Links a second identity (e.g. Google) to the currently signed-in
   * account rather than creating a duplicate Health Memory. */
  linkIdentity(provider: AuthProvider): Promise<LinkIdentityResult>;
  getCurrentUser(): Promise<User | null>;
  signOut(): Promise<void>;
}
