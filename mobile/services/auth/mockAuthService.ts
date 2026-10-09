import type { AuthProvider, User } from '../../types';
import { isValidEmail, maskEmail, normalizeEmail } from './authInput';
import { secureSession } from './secureSession';
import type {
  AppleSignInResult,
  AuthService,
  GoogleSignInResult,
  LinkIdentityResult,
  SendOtpResult,
  VerifyOtpResult,
} from './authTypes';

/**
 * MOCK, DEMO-ONLY implementation — clearly isolated in its own file and only
 * ever selected by `authService.ts` when the app is explicitly built in demo
 * mode (`EXPO_PUBLIC_APP_MODE=demo`, see config/appMode.ts). Production never
 * falls back to it. It never claims a real OTP was sent and never fakes a
 * real Google identity token; it simulates the UX flow and timing only,
 * using an obviously-fake fixed code so reviewers can exercise the screens.
 */
const MOCK_OTP = '123456';

function maskMobileNumber(mobileNumber: string): string {
  const digits = mobileNumber.replace(/\D/g, '');
  if (digits.length < 4) return mobileNumber;
  return `+${digits.slice(0, digits.length - 8)} ${'x'.repeat(Math.max(digits.length - 12, 0))}${digits.slice(-4)}`;
}

function buildUser(identity: { provider: AuthProvider; displayValue: string; mobileNumber?: string; email?: string }): User {
  return {
    id: `mock-user-${identity.provider}`,
    mobileNumber: identity.mobileNumber,
    email: identity.email,
    createdAt: new Date().toISOString(),
    linkedIdentities: [{ provider: identity.provider, displayValue: identity.displayValue, linkedAt: new Date().toISOString() }],
    onboardingComplete: false,
    identityOnboardingComplete: false,
    identityUploadPromptSeen: false,
  };
}

export const mockAuthService: AuthService = {
  async sendMobileOtp(mobileNumber: string): Promise<SendOtpResult> {
    await delay(600);
    if (mobileNumber.replace(/\D/g, '').length < 10) {
      return { success: false, errorMessage: 'Enter a valid 10-digit mobile number.' };
    }
    return { success: true };
  },

  async verifyMobileOtp(mobileNumber: string, otp: string): Promise<VerifyOtpResult> {
    await delay(500);
    if (otp !== MOCK_OTP) {
      return { success: false, errorMessage: 'Incorrect code. Please try again.' };
    }
    const existing = await secureSession.load();
    const user =
      existing?.mobileNumber === mobileNumber
        ? existing
        : buildUser({ provider: 'mobile_otp', displayValue: maskMobileNumber(mobileNumber), mobileNumber });
    await secureSession.save(user);
    return { success: true, user, isNewUser: !existing };
  },

  async sendEmailOtp(email: string): Promise<SendOtpResult> {
    await delay(600);
    if (!isValidEmail(email)) return { success: false, errorMessage: 'Enter a valid email address.' };
    return { success: true };
  },

  async completeEmailLink(): Promise<VerifyOtpResult> {
    // Demo sign-in has no emailed links — only the code.
    return { success: false, errorMessage: 'Sign-in links aren’t available in the demo. Enter the code instead.' };
  },

  async verifyEmailOtp(email: string, otp: string): Promise<VerifyOtpResult> {
    await delay(500);
    if (otp !== MOCK_OTP) {
      return { success: false, errorMessage: 'Incorrect code. Please try again.' };
    }
    const normalized = normalizeEmail(email);
    const existing = await secureSession.load();
    const user =
      existing?.email === normalized
        ? existing
        : buildUser({ provider: 'email', displayValue: maskEmail(normalized), email: normalized });
    await secureSession.save(user);
    return { success: true, user, isNewUser: !user.onboardingComplete };
  },

  async signInWithGoogle(): Promise<GoogleSignInResult> {
    await delay(700);
    // Mock mode never fabricates a "successful" real Google identity in a
    // way that could be mistaken for production auth — this path is only
    // reachable while `isSupabaseConfigured` is false and Google OAuth
    // credentials have not been configured (see docs/MOBILE_AUTH.md).
    const existing = await secureSession.load();
    const user =
      existing?.linkedIdentities.some((i) => i.provider === 'google')
        ? existing
        : buildUser({ provider: 'google', displayValue: 'demo.reviewer@gmail.com', email: 'demo.reviewer@gmail.com' });
    await secureSession.save(user);
    return { success: true, user, isNewUser: !existing };
  },

  async signInWithApple(): Promise<AppleSignInResult> {
    await delay(700);
    // Like Google above: simulates the flow only. No Apple sheet is shown and
    // no identity token is fabricated; the placeholder identity mirrors a
    // "Hide My Email" sign-in.
    const existing = await secureSession.load();
    const user = existing?.linkedIdentities.some((i) => i.provider === 'apple')
      ? existing
      : buildUser({ provider: 'apple', displayValue: 'Email hidden by Apple' });
    await secureSession.save(user);
    return { success: true, user, isNewUser: !existing };
  },

  async linkIdentity(provider: AuthProvider): Promise<LinkIdentityResult> {
    await delay(500);
    const existing = await secureSession.load();
    if (!existing) return { success: false, errorMessage: 'Sign in first before linking another account.' };
    if (existing.linkedIdentities.some((i) => i.provider === provider)) {
      return { success: true, user: existing };
    }
    const displayValue =
      provider === 'google'
        ? 'demo.reviewer@gmail.com'
        : provider === 'apple'
          ? 'Email hidden by Apple'
          : maskMobileNumber(existing.mobileNumber ?? '');
    const newIdentity = { provider, displayValue, linkedAt: new Date().toISOString() };
    const updated: User = { ...existing, linkedIdentities: [...existing.linkedIdentities, newIdentity] };
    await secureSession.save(updated);
    return { success: true, user: updated };
  },

  async getCurrentUser(): Promise<User | null> {
    return secureSession.load();
  },

  async completeOnboarding(): Promise<void> {
    const existing = await secureSession.load();
    if (existing) await secureSession.save({ ...existing, onboardingComplete: true });
  },

  async saveOnboardingFlags(flags): Promise<void> {
    const existing = await secureSession.load();
    if (existing) await secureSession.save({ ...existing, ...flags });
  },

  onSignedOut() {
    return () => undefined;
  },

  async signOut(): Promise<void> {
    await secureSession.clear();
  },
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
