export type AuthProvider = 'mobile_otp' | 'email' | 'google';

export type LinkedIdentity = {
  provider: AuthProvider;
  /** Masked mobile number ("+91 9xxxxx210") or email address, never raw secrets. */
  displayValue: string;
  linkedAt: string; // ISO date
};

export type User = {
  id: string;
  fullName?: string;
  /** E.164-ish display, masked in most UI contexts. */
  mobileNumber?: string;
  email?: string;
  avatarUrl?: string;
  createdAt: string;
  /** Every identity this account can authenticate with (account-linking). */
  linkedIdentities: LinkedIdentity[];
  onboardingComplete: boolean;
};
