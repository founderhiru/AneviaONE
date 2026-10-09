/**
 * Validation for the identity details (full name + date of birth). Pure, so
 * the screen and the service share one set of rules; the database enforces
 * the same limits again. Messages never repeat the value.
 */

export const FULL_NAME_MAX = 200;
const EARLIEST_BIRTH_YEAR = 1900;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * An empty field means "not provided" (null). Anything typed must look like a
 * name: at least one letter, no control characters, at most 200 characters.
 * Only surrounding spaces are removed — the name is otherwise kept as entered.
 */
export function checkFullName(raw: string): Checked<string | null> {
  if (raw.length === 0) return { ok: true, value: null };
  const value = raw.trim();
  if (value.length === 0) return { ok: false, error: 'Enter your full name.' };
  if (value.length > FULL_NAME_MAX) return { ok: false, error: `Your name can be up to ${FULL_NAME_MAX} characters.` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return { ok: false, error: 'Your name contains characters that can’t be used.' };
  if (!/\p{L}/u.test(value)) return { ok: false, error: 'Enter your name using letters.' };
  return { ok: true, value };
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** Today's calendar date on this device, YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
}

/**
 * Day, month and year as typed → a real calendar date (YYYY-MM-DD), or null
 * when all three are empty. Rejects partial dates, impossible dates
 * (31 April, 29 February in a non-leap year), dates before 1900 and dates
 * after today.
 */
export function checkDateOfBirth(day: string, month: string, year: string, today = localToday()): Checked<string | null> {
  const parts = [day.trim(), month.trim(), year.trim()];
  if (parts.every((p) => p === '')) return { ok: true, value: null };
  if (parts.some((p) => p === '')) return { ok: false, error: 'Enter the day, month and year.' };
  if (!/^\d{1,2}$/.test(parts[0]) || !/^\d{1,2}$/.test(parts[1]) || !/^\d{4}$/.test(parts[2])) {
    return { ok: false, error: 'Enter the date as numbers, for example 07 / 03 / 1990.' };
  }
  const [d, m, y] = parts.map(Number);
  if (m < 1 || m > 12) return { ok: false, error: 'Enter a month from 1 to 12.' };
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d < 1 || d > daysInMonth) return { ok: false, error: 'That date doesn’t exist. Check the day and month.' };
  if (y < EARLIEST_BIRTH_YEAR) return { ok: false, error: `Enter a year from ${EARLIEST_BIRTH_YEAR} onwards.` };
  const iso = `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
  if (iso > today) return { ok: false, error: 'Your date of birth can’t be in the future.' };
  return { ok: true, value: iso };
}

/** "YYYY-MM-DD" → the three fields, for editing a saved date. */
export function splitDate(iso: string | null): { day: string; month: string; year: string } {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  return match ? { day: match[3], month: match[2], year: match[1] } : { day: '', month: '', year: '' };
}
