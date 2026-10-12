/**
 * Checks a person's correction of one result before it is sent, mirroring the
 * server's rules (public.correct_fact) so problems are explained on the
 * screen. The server checks everything again and is the authority.
 *
 * Only the fields that changed are sent. Unit, range and date may be cleared
 * ("not on the report"); the test name and value may not.
 */

export type CorrectableResult = {
  name: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  /** YYYY-MM-DD, or null when the report gives none. */
  date: string | null;
};

export type CorrectionDraft = {
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
  day: string;
  month: string;
  year: string;
  reason: string;
};

export type CorrectionField = 'name' | 'value' | 'unit' | 'referenceRange' | 'date' | 'reason';

/** The payload of public.correct_fact (server field names). */
export type CorrectionFields = Partial<{
  name: string;
  value: string;
  unit: string | null;
  reference_range: string | null;
  effective_date: string | null;
}>;

export type CorrectionCheck =
  | { ok: true; fields: CorrectionFields; reason: string | null }
  | { ok: false; errors: Partial<Record<CorrectionField, string>>; summary?: string };

const LIMITS = { name: 300, value: 300, unit: 50, referenceRange: 200, reason: 500 } as const;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** The draft a correction form starts from: the result as currently recorded. */
export function draftFrom(result: CorrectableResult): CorrectionDraft {
  const [year = '', month = '', day = ''] = result.date ? result.date.split('-') : [];
  return {
    name: result.name,
    value: result.value,
    unit: result.unit ?? '',
    referenceRange: result.referenceRange ?? '',
    day,
    month,
    year,
    reason: '',
  };
}

function checkDate(draft: CorrectionDraft, today: Date): { iso: string | null } | { error: string } {
  const parts = [draft.day.trim(), draft.month.trim(), draft.year.trim()];
  if (parts.every((p) => p === '')) return { iso: null };
  if (parts.some((p) => p === '' || !/^\d+$/.test(p))) return { error: 'Enter the full date (day, month and year), or leave all three empty.' };
  const [d, m, y] = parts.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (parts[2].length !== 4 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { error: 'That date doesn’t exist.' };
  }
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (date.getTime() > todayUtc) return { error: 'The date can’t be in the future.' };
  if (y < 1900) return { error: 'Enter a date from 1900 onwards.' };
  return { iso: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

export function checkCorrection(original: CorrectableResult, draft: CorrectionDraft, today: Date = new Date()): CorrectionCheck {
  const errors: Partial<Record<CorrectionField, string>> = {};
  const name = draft.name.trim();
  const value = draft.value.trim();
  const unit = draft.unit.trim();
  const range = draft.referenceRange.trim();
  const reason = draft.reason.trim();

  if (!name) errors.name = 'Enter the test name as printed on the report.';
  else if (name.length > LIMITS.name) errors.name = 'The test name is too long.';
  if (!value) errors.value = 'Enter the value as printed on the report.';
  else if (value.length > LIMITS.value) errors.value = 'The value is too long.';
  if (unit.length > LIMITS.unit) errors.unit = 'The unit is too long.';
  if (range.length > LIMITS.referenceRange) errors.referenceRange = 'The range is too long.';
  if (reason.length > LIMITS.reason) errors.reason = 'Keep the reason under 500 characters.';
  for (const [field, text] of [['name', name], ['value', value], ['unit', unit], ['referenceRange', range], ['reason', reason]] as const) {
    if (!errors[field] && CONTROL.test(text)) errors[field] = 'Remove the special characters.';
  }
  const date = checkDate(draft, today);
  if ('error' in date) errors.date = date.error;
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const iso = (date as { iso: string | null }).iso;
  const fields: CorrectionFields = {};
  if (name !== original.name) fields.name = name;
  if (value !== original.value) fields.value = value;
  if ((unit || null) !== original.unit) fields.unit = unit || null;
  if ((range || null) !== original.referenceRange) fields.reference_range = range || null;
  if (iso !== original.date) fields.effective_date = iso;
  if (Object.keys(fields).length === 0) {
    return { ok: false, errors: {}, summary: 'Nothing has changed. Edit a field to correct it, or go back.' };
  }
  return { ok: true, fields, reason: reason || null };
}

/**
 * Whether a saved version holds exactly what was submitted — the evidence
 * needed before telling the person their correction was saved when the
 * response itself was lost.
 */
export function correctionMatches(saved: CorrectableResult, fields: CorrectionFields): boolean {
  const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? null) === (b ?? null);
  return (
    (!('name' in fields) || same(saved.name, fields.name)) &&
    (!('value' in fields) || same(saved.value, fields.value)) &&
    (!('unit' in fields) || same(saved.unit, fields.unit)) &&
    (!('reference_range' in fields) || same(saved.referenceRange, fields.reference_range)) &&
    (!('effective_date' in fields) || same(saved.date, fields.effective_date))
  );
}
