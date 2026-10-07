/**
 * Deterministic validation of model output — plain TypeScript, no AI.
 *
 * The model's JSON is NOT trusted because it parsed. Each fact must prove
 * itself against the extracted page text; a fact that can't is rejected:
 *   - the page exists,
 *   - the quote (source_text) is really on that page,
 *   - the value / name is really in the quote,
 *   - dates, numbers, units, ranges, confidence and enums are valid.
 * Then the confidence gate decides: discard, hold for review, or pass.
 */

import {
  ASSERTIONS,
  ENCOUNTER_TYPES,
  MEDICATION_STATUSES,
  OBSERVATION_CATEGORIES,
  PROCEDURE_KINDS,
  STATUS_NOT_STATED,
  type QuotedValue,
  type StructuredExtraction,
} from './extraction-schema.ts';
import { EngineError, USER_MESSAGES } from './errors.ts';
import { ILLEGIBLE } from './ocr.ts';
import {
  NORMALIZATION_VERSION,
  canonicalUnit,
  detectDateOrder,
  evidenceKey,
  normalizeText,
  parseDateAsWritten,
  parseNumericValue,
  parseReferenceRange,
  type DateOrder,
} from './normalize.ts';

/** Confidence gate. Below DISCARD a fact is not stored; below PASS (or with
 * any ambiguity flag) it is stored but held for review and kept out of the
 * current_* views until the person confirms it. */
export const CONFIDENCE = { DISCARD_BELOW: 0.5, PASS_AT: 0.85 } as const;

export type Page = { page_number: number; text: string };
export type FactKind = 'observations' | 'medications' | 'conditions' | 'allergies' | 'procedures' | 'encounters';

export type RejectReason =
  | 'malformed'
  | 'missing_provenance'
  | 'page_not_found'
  | 'quote_not_on_page'
  | 'value_not_in_quote'
  | 'invalid_confidence'
  | 'invalid_enum'
  | 'invalid_date'
  | 'too_long'
  | 'negated'
  | 'illegible'
  | 'empty';

/** A validated fact, shaped for engine_complete_document (minus the fingerprint). */
export type ValidatedFact = {
  kind: FactKind;
  row: Record<string, string | number | null>;
  page_number: number;
  source_text: string;
  confidence: number;
  confidence_gate: 'passed' | 'needs_review';
  /** Deterministic identity of the fact, hashed into fact_fingerprint. */
  fingerprintParts: string[];
};

export type ValidationResult = {
  facts: ValidatedFact[];
  rejected: { kind: FactKind; reason: RejectReason }[];
  discarded: number;
  reportDate: string | null;
  patientName: string | null;
  patientDateOfBirth: string | null;
};

// ------------------------------------------------------- structural check ---

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The top-level shape must be exactly right, or the whole extraction fails validation. */
export function assertExtractionShape(value: unknown): StructuredExtraction {
  const keys = ['observations', 'medications', 'conditions', 'allergies', 'procedures', 'encounters'] as const;
  if (!isObject(value) || keys.some((k) => !Array.isArray(value[k]))) {
    throw new EngineError('validation', 'invalid_extraction_schema', USER_MESSAGES.generic);
  }
  for (const k of ['patient_name', 'patient_date_of_birth', 'report_date'] as const) {
    if (value[k] !== null && value[k] !== undefined && !isObject(value[k])) {
      throw new EngineError('validation', 'invalid_extraction_schema', USER_MESSAGES.generic);
    }
  }
  return value as unknown as StructuredExtraction;
}

// --------------------------------------------------------------- helpers ---

const str = (v: unknown, max: number): string | null | 'too_long' => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? 'too_long' : t;
};

// Evidence matching compares layout-insensitive keys (see evidenceKey): the
// text must still be on the page, in order — only PDF spacing artifacts are
// forgiven, never a missing or different character.
const containsExact = (haystack: string, needle: string) => evidenceKey(haystack).includes(evidenceKey(needle));
const containsCI = (haystack: string, needle: string) => evidenceKey(haystack).toLowerCase().includes(evidenceKey(needle).toLowerCase());

const NEGATION = /\b(no|not|denies|denied|negative for|without|ruled out|rule out|r\/o|absence of|nkda|nkfa)\b/i;
const FAMILY = /\b(family history|family h\/o|fh|father|mother|brother|sister|sibling|siblings|parent|parents|grandmother|grandfather|grandparent|aunt|uncle)\b/i;
const NO_ALLERGY = /^(none|nil|no|nkda|nkfa|no known (drug |food )?allergies)$/i;

type EvidenceCheck = { ok: true; page: number; quote: string; confidence: number } | { ok: false; reason: RejectReason };

function checkEvidence(item: Record<string, unknown>, pages: Map<number, string>): EvidenceCheck {
  const page = item.page;
  const quote = item.source_text;
  const confidence = item.confidence;
  if (typeof quote !== 'string' || !quote.trim() || typeof page !== 'number') return { ok: false, reason: 'missing_provenance' };
  if (quote.length > 2000) return { ok: false, reason: 'too_long' };
  // Text a scan transcription marked unreadable can never be evidence.
  if (quote.includes(ILLEGIBLE)) return { ok: false, reason: 'illegible' };
  if (!Number.isInteger(page) || !pages.has(page)) return { ok: false, reason: 'page_not_found' };
  if (!containsExact(pages.get(page)!, quote)) return { ok: false, reason: 'quote_not_on_page' };
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, reason: 'invalid_confidence' };
  }
  return { ok: true, page, quote: normalizeText(quote), confidence };
}

/** Validates an evidence-backed identity / report-date quote; null if it doesn't hold up. */
function checkQuoted(q: QuotedValue | null | undefined, pages: Map<number, string>): string | null {
  if (!q || typeof q.value !== 'string' || !q.value.trim()) return null;
  const evidence = checkEvidence({ ...q, confidence: 1 }, pages);
  if (!evidence.ok || !containsCI(evidence.quote, q.value)) return null;
  return q.value.trim();
}

/** A date the model returned must be written on the cited page (as written),
 * then is parsed deterministically. */
function dateOrFlag(raw: string | null, flags: string[], today: Date, pageText: string, order: DateOrder | null): { iso: string | null; invalid: boolean } {
  if (!raw) return { iso: null, invalid: false };
  if (!containsCI(pageText, raw)) return { iso: null, invalid: true };
  const parsed = parseDateAsWritten(raw, today, order);
  if (!parsed) return { iso: null, invalid: false };
  if (parsed.kind === 'date') return { iso: parsed.iso, invalid: false };
  if (parsed.kind === 'ambiguous') {
    flags.push('ambiguous_date');
    return { iso: null, invalid: false };
  }
  return { iso: null, invalid: true };
}

// ---------------------------------------------------------------- validate ---

export function validateExtraction(
  extraction: StructuredExtraction,
  inputPages: Page[],
  options: { today?: Date; reviewPages?: Set<number> } = {},
): ValidationResult {
  const today = options.today ?? new Date();
  const pages = new Map(inputPages.map((p) => [p.page_number, p.text]));
  const facts: ValidatedFact[] = [];
  const rejected: ValidationResult['rejected'] = [];
  let discarded = 0;

  // Day/month order is resolved only when the document itself proves it.
  const dateOrder = detectDateOrder(inputPages.map((p) => p.text));
  const reportDateRaw = checkQuoted(extraction.report_date, pages);
  const reportDateParsed = reportDateRaw ? parseDateAsWritten(reportDateRaw, today, dateOrder) : null;
  const reportDate = reportDateParsed?.kind === 'date' ? reportDateParsed.iso : null;

  const accept = (
    kind: FactKind,
    evidence: Extract<EvidenceCheck, { ok: true }>,
    row: Record<string, string | number | null>,
    flags: string[],
    fingerprintParts: string[],
  ) => {
    if (evidence.confidence < CONFIDENCE.DISCARD_BELOW) {
      discarded += 1;
      return;
    }
    // A fact read from a hard-to-read scanned page is held for review.
    if (options.reviewPages?.has(evidence.page)) flags.push('low_legibility');
    const gate = evidence.confidence >= CONFIDENCE.PASS_AT && flags.length === 0 ? 'passed' : 'needs_review';
    facts.push({
      kind,
      row,
      page_number: evidence.page,
      source_text: evidence.quote,
      confidence: Math.round(evidence.confidence * 1000) / 1000,
      confidence_gate: gate,
      fingerprintParts: [kind, String(evidence.page), ...fingerprintParts.map((p) => normalizeText(p).toLowerCase())],
    });
  };

  const each = (kind: FactKind, list: unknown, fn: (item: Record<string, unknown>, ev: Extract<EvidenceCheck, { ok: true }>) => RejectReason | void) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!isObject(item)) {
        rejected.push({ kind, reason: 'malformed' });
        continue;
      }
      const ev = checkEvidence(item, pages);
      if (!ev.ok) {
        rejected.push({ kind, reason: ev.reason });
        continue;
      }
      const reason = fn(item, ev);
      if (reason) rejected.push({ kind, reason });
    }
  };

  // ------------------------------------------------------- observations ---
  each('observations', extraction.observations, (o, ev) => {
    const name = str(o.test_name, 300);
    const value = str(o.raw_value, 300);
    const unit = str(o.raw_unit, 50);
    const range = str(o.reference_range, 200);
    if (name === 'too_long' || value === 'too_long' || unit === 'too_long' || range === 'too_long') return 'too_long';
    if (!name || !value) return 'empty';
    if (!OBSERVATION_CATEGORIES.includes(o.category as never)) return 'invalid_enum';
    if (!containsCI(ev.quote, name) || !containsExact(ev.quote, value)) return 'value_not_in_quote';
    if (unit && !containsCI(ev.quote, unit)) return 'value_not_in_quote';
    if (range && !containsCI(pages.get(ev.page)!, range)) return 'value_not_in_quote';

    const flags: string[] = [];
    const date = dateOrFlag(str(o.observation_date, 60) as string | null, flags, today, pages.get(ev.page)!, dateOrder);
    if (date.invalid) return 'invalid_date';

    const parsed = parseNumericValue(value);
    if (parsed.kind === 'ambiguous') flags.push('ambiguous_value');
    const numeric = parsed.kind === 'number' ? parsed.value : null;
    const unitCanonical = canonicalUnit(unit);
    const parsedRange = parseReferenceRange(range);

    accept(
      'observations',
      ev,
      {
        name_as_written: name,
        value_as_written: value,
        unit_as_written: unit,
        reference_range_as_written: range,
        effective_date: date.iso ?? reportDate,
        category: o.category as string,
        value_numeric: numeric,
        value_text: parsed.kind === 'number' ? null : value,
        value_normalized: numeric !== null && unitCanonical ? numeric : null,
        unit_normalized: numeric !== null && unitCanonical ? unitCanonical : null,
        reference_low: parsedRange?.low ?? null,
        reference_high: parsedRange?.high ?? null,
        interpretation_version: NORMALIZATION_VERSION,
      },
      flags,
      [name, numeric !== null ? String(numeric) : value, unitCanonical ?? unit ?? '', date.iso ?? reportDate ?? ''],
    );
  });

  // -------------------------------------------------------- medications ---
  each('medications', extraction.medications, (m, ev) => {
    const name = str(m.name, 300);
    const dose = str(m.dose, 100);
    const frequency = str(m.frequency, 100);
    if (name === 'too_long' || dose === 'too_long' || frequency === 'too_long') return 'too_long';
    if (!name) return 'empty';
    const status = m.status === STATUS_NOT_STATED ? null : ((m.status as string | null | undefined) ?? null);
    if (status !== null && !MEDICATION_STATUSES.includes(status as never)) return 'invalid_enum';
    if (!containsCI(ev.quote, name)) return 'value_not_in_quote';
    if ((dose && !containsCI(ev.quote, dose)) || (frequency && !containsCI(ev.quote, frequency))) return 'value_not_in_quote';
    const flags: string[] = [];
    const start = dateOrFlag(str(m.start_date, 60) as string | null, flags, today, pages.get(ev.page)!, dateOrder);
    const end = dateOrFlag(str(m.end_date, 60) as string | null, flags, today, pages.get(ev.page)!, dateOrder);
    if (start.invalid || end.invalid) return 'invalid_date';
    if (start.iso && end.iso && end.iso < start.iso) return 'invalid_date';
    accept(
      'medications',
      ev,
      {
        name_as_written: name,
        dose_as_written: dose,
        frequency_as_written: frequency,
        start_date: start.iso,
        end_date: end.iso,
        status,
      },
      flags,
      [name, dose ?? '', frequency ?? '', start.iso ?? ''],
    );
  });

  // --------------------------------------------------------- conditions ---
  each('conditions', extraction.conditions, (c, ev) => {
    const name = str(c.name, 300);
    if (name === 'too_long') return 'too_long';
    if (!name) return 'empty';
    if (!ASSERTIONS.includes(c.assertion as never)) return 'invalid_enum';
    if (!containsCI(ev.quote, name)) return 'value_not_in_quote';
    if (NEGATION.test(ev.quote) && !FAMILY.test(ev.quote)) return 'negated';
    const flags: string[] = [];
    let assertion = c.assertion as string;
    // A family history (or relative's condition) is never this person's diagnosis.
    if (FAMILY.test(ev.quote) && assertion !== 'mentioned') {
      assertion = 'mentioned';
      flags.push('assertion_downgraded');
    }
    accept('conditions', ev, { name_as_written: name, assertion, recorded_date: reportDate }, flags, [name, assertion]);
  });

  // ---------------------------------------------------------- allergies ---
  each('allergies', extraction.allergies, (a, ev) => {
    const allergen = str(a.allergen, 300);
    const reaction = str(a.reaction, 500);
    if (allergen === 'too_long' || reaction === 'too_long') return 'too_long';
    if (!allergen) return 'empty';
    if (!ASSERTIONS.includes(a.assertion as never)) return 'invalid_enum';
    if (NO_ALLERGY.test(allergen) || NEGATION.test(ev.quote)) return 'negated';
    if (!containsCI(ev.quote, allergen) || (reaction && !containsCI(ev.quote, reaction))) return 'value_not_in_quote';
    accept(
      'allergies',
      ev,
      { substance_as_written: allergen, reaction_as_written: reaction, assertion: a.assertion as string },
      [],
      [allergen, reaction ?? ''],
    );
  });

  // --------------------------------------------------------- procedures ---
  each('procedures', extraction.procedures, (p, ev) => {
    const name = str(p.name, 300);
    if (name === 'too_long') return 'too_long';
    if (!name) return 'empty';
    if (!PROCEDURE_KINDS.includes(p.procedure_kind as never)) return 'invalid_enum';
    if (!containsCI(ev.quote, name)) return 'value_not_in_quote';
    const flags: string[] = [];
    const date = dateOrFlag(str(p.date, 60) as string | null, flags, today, pages.get(ev.page)!, dateOrder);
    if (date.invalid) return 'invalid_date';
    accept(
      'procedures',
      ev,
      { name_as_written: name, performed_date: date.iso, procedure_kind: p.procedure_kind as string },
      flags,
      [name, date.iso ?? '', p.procedure_kind as string],
    );
  });

  // --------------------------------------------------------- encounters ---
  each('encounters', extraction.encounters, (e, ev) => {
    const provider = str(e.provider_name, 200);
    const facility = str(e.facility_name, 200);
    if (provider === 'too_long' || facility === 'too_long') return 'too_long';
    if (!ENCOUNTER_TYPES.includes(e.encounter_type as never)) return 'invalid_enum';
    const dateRaw = str(e.encounter_date, 60) as string | null;
    if (!dateRaw && !provider && !facility) return 'empty';
    if ((provider && !containsCI(ev.quote, provider)) || (facility && !containsCI(ev.quote, facility))) return 'value_not_in_quote';
    if (dateRaw && !containsCI(ev.quote, dateRaw)) return 'value_not_in_quote';
    const flags: string[] = [];
    const date = dateOrFlag(dateRaw, flags, today, pages.get(ev.page)!, dateOrder);
    if (date.invalid) return 'invalid_date';
    accept(
      'encounters',
      ev,
      { encounter_date: date.iso, provider_name: provider, facility_name: facility, encounter_type: e.encounter_type as string },
      flags,
      [e.encounter_type as string, date.iso ?? '', provider ?? '', facility ?? ''],
    );
  });

  return {
    facts,
    rejected,
    discarded,
    reportDate,
    patientName: checkQuoted(extraction.patient_name, pages),
    patientDateOfBirth: checkQuoted(extraction.patient_date_of_birth, pages),
  };
}
