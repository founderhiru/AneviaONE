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
 *                   date of birth, or a name that does not carry the person's
 *                   FIRST name (a shared surname alone is not enough).
 *   consistent    — strong evidence: the exact date of birth matches, or the
 *                   first AND last name both match, and nothing conflicts.
 *   unverifiable  — identifiers were found but can't establish ownership
 *                   (the first name alone, an initial, or the account has
 *                   nothing to compare with).
 *   no_identifiers — the report names no one.
 *
 * Only `mismatch` stops a report: it is rejected as "not yours". Every other
 * outcome lets the facts in, because the person uploaded the report to their
 * own record (or to a relative's record they manage) and nothing on the page
 * contradicts that. Facts are held for review only when the page itself is
 * unclear (see validate.ts), never because a report lacks a name. When the
 * page shows no name, or one that can't be matched, the document is recorded
 * as `owner_attested` (the person filed it under their own record).
 * Identifiers are never stored or logged; only the result is.
 */

import { parseDateAsWritten } from './normalize.ts';

export type IdentityCheck = 'no_identifiers' | 'consistent' | 'unverifiable' | 'mismatch';

/** What is stored on the document: no_identifiers / unverifiable become owner_attested. */
export type StoredIdentityCheck = 'consistent' | 'owner_attested' | 'mismatch';

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

/** Single-letter name parts ("A. Verma" → a). */
function initials(name: string): Set<string> {
  return new Set(
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((t) => t.length === 1),
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
    const accountTokens = [...nameTokens(account.fullName)];
    if (reportTokens.size > 0 && accountTokens.length > 0) {
      // The person's FIRST name must appear on the report, in either order
      // ("Asha Verma" / "Verma Asha"). A shared surname alone is not enough:
      // relatives share one. An initial ("A. Verma") stands in for the first
      // name only when the surname is also on the report.
      const first = accountTokens[0];
      const rest = accountTokens.slice(1);
      const surnameShared = rest.some((t) => reportTokens.has(t));
      const initialOnly = [...initials(report.patientName)].includes(first[0]) && surnameShared;
      if (!reportTokens.has(first) && !initialOnly) return 'mismatch';
      // First and last name both present is strong; the first name alone is accepted but weaker.
      if (reportTokens.has(first) && surnameShared) strongMatch = true;
    }
  }

  return strongMatch ? 'consistent' : 'unverifiable';
}

/** Everything except a contradiction lets the report's facts in. */
export function identityAllowsTrust(check: IdentityCheck): boolean {
  return check !== 'mismatch';
}

/** The value recorded on the document (identifiers themselves are never stored). */
export function identityToStore(check: IdentityCheck): StoredIdentityCheck {
  return check === 'no_identifiers' || check === 'unverifiable' ? 'owner_attested' : check;
}
