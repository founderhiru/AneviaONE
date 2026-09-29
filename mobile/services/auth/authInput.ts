/**
 * Pure input helpers for sign-in (no network, easy to unit test).
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const value = normalizeEmail(email);
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

/**
 * Converts what someone types into E.164 for Supabase phone auth.
 * India-first: a bare 10-digit number is treated as +91. Numbers typed with
 * a leading `+` are kept as-is (digits only). Returns null when invalid.
 */
export function normalizeMobileNumber(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return null;
}

/** Shows only the last few characters of an identity, e.g. for the Me screen. */
export function maskEmail(email: string): string {
  const [local, domain] = normalizeEmail(email).split('@');
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'•'.repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
}
