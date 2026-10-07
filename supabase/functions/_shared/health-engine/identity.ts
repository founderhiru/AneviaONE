/**
 * Report-person check: does this report appear to belong to someone else?
 *
 * Only EXPLICIT identifiers count — a patient name and/or date of birth that
 * the extraction quoted from the report and the validator confirmed are on
 * the page. They are compared with what the account holds; no fuzzy identity
 * matching beyond what is justified:
 *   - date of birth: an exact, unambiguous date that differs → mismatch;
 *   - name: compared as word sets (honorifics removed, case/punctuation
 *     ignored); NO word in common → mismatch. A shared word (e.g. initials
 *     vs full name) is treated as consistent rather than guessed further.
 * Identifiers are never stored or logged; only the result is.
 */

import { parseDateAsWritten } from './normalize.ts';

export type IdentityCheck = 'no_identifiers' | 'consistent' | 'unverifiable' | 'mismatch';

export type AccountIdentity = { displayName: string | null; dateOfBirth: string | null /* YYYY-MM-DD */ };

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

  let compared = false;

  if (report.patientDateOfBirth && account.dateOfBirth) {
    const parsed = parseDateAsWritten(report.patientDateOfBirth);
    if (parsed?.kind === 'date') {
      compared = true;
      if (parsed.iso !== account.dateOfBirth) return 'mismatch';
    }
  }

  if (report.patientName && account.displayName) {
    const reportTokens = nameTokens(report.patientName);
    const accountTokens = nameTokens(account.displayName);
    if (reportTokens.size > 0 && accountTokens.size > 0) {
      compared = true;
      const shared = [...reportTokens].some((t) => accountTokens.has(t));
      if (!shared) return 'mismatch';
    }
  }

  return compared ? 'consistent' : 'unverifiable';
}
