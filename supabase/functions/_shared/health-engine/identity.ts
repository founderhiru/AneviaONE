/**
 * Report-person check: does this report appear to belong to the account?
 *
 * Extraction says what a report contains; it never proves whose it is. Only
 * EXPLICIT identifiers count — a patient name and/or date of birth that the
 * extraction quoted from the report and the validator confirmed are on the
 * page. They are compared with the identity the PERSON entered (full name +
 * date of birth, `engine_account_identity`) — never a name taken from the
 * sign-in provider or email. No fuzzy matching beyond what is justified:
 *
 *   mismatch      — an identifier contradicts the account: a different exact
 *                   date of birth, or a name with NO word in common.
 *   consistent    — strong evidence: the exact date of birth matches, or the
 *                   full name matches (every word of the shorter name, at
 *                   least two words, is in the other), and nothing conflicts.
 *   unverifiable  — identifiers were found but can't establish ownership
 *                   (only a partial name overlap such as one shared word or
 *                   an initial, or the account has nothing to compare with).
 *   no_identifiers — the report names no one.
 *
 * Only `consistent` lets a report's facts enter trusted Health Memory (see
 * pipeline.ts); every other outcome holds them for review.
 * Identifiers are never stored or logged; only the result is.
 */

import { parseDateAsWritten } from './normalize.ts';

export type IdentityCheck = 'no_identifiers' | 'consistent' | 'unverifiable' | 'mismatch';

/** What the person entered as their identity (Identity details). */
export type AccountIdentity = { fullName: string | null; dateOfBirth: string | null /* YYYY-MM-DD */ };

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'shri', 'smt', 'kumari', 'master', 'baby', 'sri', 'prof']);

export function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((t) => t.length >= 2 && !HONORIFICS.has(t)),
  );
}

export function checkReportPerson(
  report: { patientName: string | null; patientDateOfBirth: string | null },
  account: AccountIdentity,
): IdentityCheck {
  if (!report.patientName && !report.patientDateOfBirth) return 'no_identifiers';

  let strongMatch = false;

  if (report.patientDateOfBirth && account.dateOfBirth) {
    const parsed = parseDateAsWritten(report.patientDateOfBirth);
    if (parsed?.kind === 'date') {
      if (parsed.iso !== account.dateOfBirth) return 'mismatch';
      strongMatch = true;
    }
  }

  if (report.patientName && account.fullName) {
    const reportTokens = nameTokens(report.patientName);
    const accountTokens = nameTokens(account.fullName);
    if (reportTokens.size > 0 && accountTokens.size > 0) {
      const shared = [...reportTokens].filter((t) => accountTokens.has(t)).length;
      if (shared === 0) return 'mismatch';
      // A full-name match: the shorter name (two or more words) is wholly
      // contained in the other. One shared word alone is not enough.
      const shorter = Math.min(reportTokens.size, accountTokens.size);
      if (shorter >= 2 && shared === shorter) strongMatch = true;
    }
  }

  return strongMatch ? 'consistent' : 'unverifiable';
}

/** Only strong, non-conflicting identity evidence lets facts be trusted. */
export function identityAllowsTrust(check: IdentityCheck): boolean {
  return check === 'consistent';
}
