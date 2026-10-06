/**
 * Report-person check. Compares ONLY what the report explicitly states about
 * its patient against what the account holder entered in their own profile.
 *
 * No fuzzy matching. Rules:
 *  - Date of birth: compared as a date. An ambiguous written date (05/06/1980)
 *    matches if EITHER reading equals the profile date; it conflicts only when
 *    no reading can match.
 *  - Name: lower-cased, honorifics and punctuation removed, split into words.
 *    Names match when one word-set is contained in the other (so a missing
 *    middle name is fine) and a single-letter word matches any word starting
 *    with it (initials). Anything else is a conflict.
 *  - A conflict in the date of birth means mismatch. A name conflict alone
 *    means mismatch unless the date of birth also matches exactly.
 *  - If either side has nothing to compare, the result is "unverifiable"
 *    — the report is not blocked, and the result is recorded as such.
 *
 * Identity values are never logged by callers.
 */
import { dateCouldMatch } from './dates.ts';
import type { IdentityCheck } from './types.ts';

export type ProfileReference = { fullName: string | null; dateOfBirth: string | null };
export type ReportIdentity = { name: string | null; dateOfBirth: string | null };

const HONORIFICS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'shri', 'sri', 'smt', 'kumari', 'master', 'baby', 'sh', 'late', 'mohd', 'md',
]);

export function nameWords(raw: string): string[] {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !HONORIFICS.has(w));
}

function wordMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1) return b.startsWith(a);
  if (b.length === 1) return a.startsWith(b);
  return false;
}

function covered(small: string[], big: string[]): boolean {
  return small.every((w) => big.some((x) => wordMatches(w, x)));
}

export function namesConflict(reportName: string, profileName: string): boolean {
  const a = nameWords(reportName);
  const b = nameWords(profileName);
  if (a.length === 0 || b.length === 0) return false; // nothing comparable
  return !(covered(a, b) || covered(b, a));
}

export function checkReportPerson(report: ReportIdentity, profile: ProfileReference): IdentityCheck {
  let dobState: 'none' | 'match' | 'conflict' = 'none';
  if (report.dateOfBirth && profile.dateOfBirth) {
    dobState = dateCouldMatch(report.dateOfBirth, profile.dateOfBirth) ? 'match' : 'conflict';
  }
  let nameState: 'none' | 'match' | 'conflict' = 'none';
  if (report.name && profile.fullName && nameWords(report.name).length && nameWords(profile.fullName).length) {
    nameState = namesConflict(report.name, profile.fullName) ? 'conflict' : 'match';
  }

  if (dobState === 'conflict') return 'mismatch';
  if (nameState === 'conflict') return dobState === 'match' ? 'match' : 'mismatch';
  if (dobState === 'none' && nameState === 'none') return 'unverifiable';
  return 'match';
}
