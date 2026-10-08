export type AuthProvider = 'mobile_otp' | 'email' | 'google' | 'apple';

export type LinkedIdentity = {
  provider: AuthProvider;
  /** Masked mobile number ("+91 9xxxxx210") or email address (Apple private
   * relay addresses are shown as "Hidden by Apple"), never raw secrets. */
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

/**
 * The person's identity details, used later to check that a health report
 * belongs to them. Both are optional until they choose to add them; nothing
 * is ever derived from the email address, sign-in provider or documents.
 */
export type IdentityProfile = {
  /** Exactly as entered (surrounding spaces trimmed). */
  fullName: string | null;
  /** Calendar date, YYYY-MM-DD. */
  dateOfBirth: string | null;
};
