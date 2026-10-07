/**
 * Countries offered for Mobile sign-in. India-first: it is the default and,
 * for now, the only country listed. Add a country here once SMS delivery to
 * it is enabled — the phone field, its picker, validation and the code
 * screen's display all read from this list, nothing else is India-specific.
 *
 * `nationalLength` is the number of digits after the dial code; `groups`
 * is how those digits are spaced for display ("98765 43210").
 */
export type PhoneCountry = {
  iso: string;
  name: string;
  flag: string;
  dialCode: string;
  nationalLength: number;
  groups: number[];
};

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { iso: 'IN', name: 'India', flag: '🇮🇳', dialCode: '+91', nationalLength: 10, groups: [5, 5] },
];

export const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES[0];

/** Digits only, at most the country's length. */
export function nationalDigits(input: string, country: PhoneCountry): string {
  return input.replace(/\D/g, '').slice(0, country.nationalLength);
}

/** The full international number (E.164) for a complete national number, or null. */
export function toInternational(national: string, country: PhoneCountry): string | null {
  const digits = national.replace(/\D/g, '');
  return digits.length === country.nationalLength ? `${country.dialCode}${digits}` : null;
}

/** "+91 98765 43210" for a number in one of the listed countries; otherwise as given. */
export function formatInternational(number: string): string {
  const country = PHONE_COUNTRIES.find((c) => number.startsWith(c.dialCode));
  if (!country) return number;
  const digits = number.slice(country.dialCode.length).replace(/\D/g, '');
  if (digits.length !== country.nationalLength) return number;
  const parts: string[] = [];
  let at = 0;
  for (const size of country.groups) {
    parts.push(digits.slice(at, at + size));
    at += size;
  }
  return `${country.dialCode} ${parts.join(' ')}`;
}
