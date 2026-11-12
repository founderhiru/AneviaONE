/**
 * "Coming up": the pure rules for reminders (renewals, refills, follow-ups).
 * No network and no clock of its own: callers pass `today`, so every rule is
 * testable. Dates are calendar days (YYYY-MM-DD) in the person's own time zone.
 *
 * AneviaONE never invents a medical due date. Every date here came from a
 * document or from a person.
 */

export type ObligationKind = 'renewal' | 'refill' | 'followup' | 'due' | 'expiry' | 'other';
export type ObligationState = 'proposed' | 'open' | 'done' | 'dismissed';

export type Obligation = {
  id: string;
  subjectId: string;
  kind: ObligationKind;
  title: string;
  /** Calendar day, YYYY-MM-DD. */
  dueOn: string;
  source: 'user' | 'extracted';
  state: ObligationState;
  /** Hidden from Coming up until this day (YYYY-MM-DD). */
  snoozedUntil: string | null;
  sourcePage: number | null;
};

/** The kinds a person can choose when adding a reminder by hand. */
export const ADD_KINDS: { value: ObligationKind; label: string }[] = [
  { value: 'renewal', label: 'Renewal' },
  { value: 'refill', label: 'Medicine refill' },
  { value: 'followup', label: 'Follow-up visit' },
  { value: 'other', label: 'Other' },
];

export const KIND_LABEL: Record<ObligationKind, string> = {
  renewal: 'Renewal',
  refill: 'Refill',
  followup: 'Follow-up',
  due: 'Due',
  expiry: 'Expiry',
  other: 'Reminder',
};

export const TITLE_MAX = 120;

/** Quick date choices (no calendar picker needed). */
export const DUE_CHOICES: { key: string; label: string; days?: number; months?: number }[] = [
  { key: 'week', label: 'In 1 week', days: 7 },
  { key: 'month', label: 'In 1 month', months: 1 },
  { key: 'quarter', label: 'In 3 months', months: 3 },
  { key: 'half', label: 'In 6 months', months: 6 },
  { key: 'year', label: 'In 1 year', months: 12 },
];

const pad = (n: number) => String(n).padStart(2, '0');

export function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses YYYY-MM-DD as a local calendar day. Returns null for anything else. */
export function parseDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function addDays(from: Date, days: number): string {
  const d = startOfDay(from);
  d.setDate(d.getDate() + days);
  return toIsoDay(d);
}

/** Adds calendar months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(from: Date, months: number): string {
  const d = startOfDay(from);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toIsoDay(d);
}

export function dateFromChoice(key: string, today: Date): string | null {
  const choice = DUE_CHOICES.find((c) => c.key === key);
  if (!choice) return null;
  return choice.months ? addMonths(today, choice.months) : addDays(today, choice.days ?? 0);
}

/** Whole days from today to `dueOn`: negative when overdue. NaN for an invalid day. */
export function daysUntil(dueOn: string, today: Date): number {
  const due = parseDay(dueOn);
  if (!due) return NaN;
  return Math.round((due.getTime() - startOfDay(today).getTime()) / 86_400_000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortDay(dueOn: string): string {
  const d = parseDay(dueOn);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : dueOn;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Plain wording for how far away a date is. */
export function dueLabel(dueOn: string, today: Date): string {
  const days = daysUntil(dueOn, today);
  if (Number.isNaN(days)) return dueOn;
  if (days < 0) return `Overdue by ${plural(-days, 'day')}`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 14) return `In ${days} days`;
  if (days <= 60) return `In ${plural(Math.round(days / 7), 'week')}`;
  return `On ${shortDay(dueOn)}`;
}

/** Open reminders that should be showing today: not done, not dismissed, not snoozed. Soonest first. */
export function visibleOpen(list: Obligation[], today: Date): Obligation[] {
  const todayIso = toIsoDay(today);
  return list
    .filter((o) => o.state === 'open' && (o.snoozedUntil === null || o.snoozedUntil <= todayIso) && parseDay(o.dueOn) !== null)
    .sort((a, b) => (a.dueOn === b.dueOn ? a.title.localeCompare(b.title) : a.dueOn < b.dueOn ? -1 : 1));
}

export type ComingUpSummary = {
  overdue: number;
  /** Due within the next 30 days (including today). */
  soon: number;
  total: number;
};

export function summarise(list: Obligation[], today: Date): ComingUpSummary {
  const open = visibleOpen(list, today);
  let overdue = 0;
  let soon = 0;
  for (const o of open) {
    const d = daysUntil(o.dueOn, today);
    if (d < 0) overdue += 1;
    else if (d <= 30) soon += 1;
  }
  return { overdue, soon, total: open.length };
}

/** A title is valid when it has something after trimming and fits the database limit. */
export function cleanTitle(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  return t.length >= 1 && t.length <= TITLE_MAX ? t : null;
}
