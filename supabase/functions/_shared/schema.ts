/**
 * Strict, hand-written validation of the model's JSON. Valid JSON is not
 * trusted: every entity is checked field by field, and a bad entity is
 * rejected on its own without discarding the rest.
 *
 * Length limits mirror the database CHECK constraints so a commit can never
 * fail because of an over-long string.
 */
import { LIMITS } from './config.ts';
import { normalizeText } from './text.ts';
import type { DocumentTypeGuess, RejectionReason } from './types.ts';

export type Result<T> = { ok: true; value: T } | { ok: false; reason: RejectionReason };

export type RawBase = { page_number: number; source_text: string; confidence: number };

export type RawDocumentMeta = {
  title: string | null;
  document_type: DocumentTypeGuess | null;
  report_date_as_written: string | null;
  collection_date_as_written: string | null;
  provider_name: string | null;
  patient_name_as_written: string | null;
  patient_dob_as_written: string | null;
};

export type RawEncounter = RawBase & {
  key: string;
  encounter_type: string | null;
  date_as_written: string | null;
  provider_name: string | null;
  facility_name: string | null;
  reason_as_written: string | null;
};

export type RawObservation = RawBase & {
  name_as_written: string;
  value_as_written: string;
  unit_as_written: string | null;
  reference_range_as_written: string | null;
  abnormal_flag_as_written: string | null;
  date_as_written: string | null;
  specimen: string | null;
  category: string | null;
  encounter_key: string | null;
};

export type RawMedication = RawBase & {
  name_as_written: string;
  strength_as_written: string | null;
  dose_as_written: string | null;
  frequency_as_written: string | null;
  route_as_written: string | null;
  duration_as_written: string | null;
  instructions_as_written: string | null;
  status_as_written: string | null;
  start_date_as_written: string | null;
  end_date_as_written: string | null;
  prescribed_date_as_written: string | null;
  prescriber_name: string | null;
  encounter_key: string | null;
};

export type RawCondition = RawBase & {
  name_as_written: string;
  status_as_written: string | null;
  assertion: string | null;
  recorded_date_as_written: string | null;
  encounter_key: string | null;
};

export type RawAllergy = RawBase & {
  substance_as_written: string;
  reaction_as_written: string | null;
  severity_as_written: string | null;
  assertion: string | null;
  recorded_date_as_written: string | null;
  encounter_key: string | null;
};

export type RawProcedure = RawBase & {
  name_as_written: string;
  procedure_kind: string | null;
  performed_date_as_written: string | null;
  performer_name: string | null;
  facility_name: string | null;
  dose_number_as_written: string | null;
  encounter_key: string | null;
};

export type RawExtraction = {
  document: RawDocumentMeta;
  encounters: unknown[];
  observations: unknown[];
  medications: unknown[];
  conditions: unknown[];
  allergies: unknown[];
  procedures: unknown[];
};

const DOC_TYPES: DocumentTypeGuess[] = [
  'blood_test', 'prescription', 'discharge_summary', 'consultation_note', 'imaging_report', 'vaccination_record', 'other',
];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Reads fields from one entity, tracking whether anything had to be dropped. */
class Reader {
  dropped = 0;
  failed: RejectionReason | null = null;
  constructor(private readonly o: Record<string, unknown>) {}

  required(key: string, max: number): string {
    const v = this.o[key];
    if (typeof v !== 'string' || !normalizeText(v)) {
      this.failed ??= 'schema_invalid';
      return '';
    }
    const s = normalizeText(v);
    if (s.length > max) {
      this.failed ??= 'field_too_long';
      return '';
    }
    return s;
  }

  optional(key: string, max: number): string | null {
    const v = this.o[key];
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') {
      this.dropped++;
      return null;
    }
    const s = normalizeText(v);
    if (!s) return null;
    if (s.length > max) {
      this.dropped++;
      return null;
    }
    return s;
  }

  base(): RawBase {
    const page = this.o.page_number;
    const conf = this.o.confidence;
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > 2000) this.failed ??= 'schema_invalid';
    if (typeof conf !== 'number' || !Number.isFinite(conf) || conf < 0 || conf > 1) this.failed ??= 'confidence_invalid';
    const quote = typeof this.o.source_text === 'string' ? normalizeText(this.o.source_text) : '';
    if (!quote) this.failed ??= 'schema_invalid';
    return { page_number: page as number, source_text: quote, confidence: conf as number };
  }
}

function done<T>(r: Reader, value: T): Result<T> & { dropped?: number } {
  return r.failed ? { ok: false, reason: r.failed } : { ok: true, value, dropped: r.dropped } as Result<T> & { dropped: number };
}

export type Parsed<T> = Result<T> & { dropped?: number };

export function parseExtraction(output: unknown): { ok: true; value: RawExtraction } | { ok: false } {
  if (!isObject(output)) return { ok: false };
  const arr = (k: string): unknown[] | null => {
    const v = output[k];
    if (v === undefined || v === null) return [];
    return Array.isArray(v) ? v : null;
  };
  const encounters = arr('encounters');
  const observations = arr('observations');
  const medications = arr('medications');
  const conditions = arr('conditions');
  const allergies = arr('allergies');
  const procedures = arr('procedures');
  if (!encounters || !observations || !medications || !conditions || !allergies || !procedures) return { ok: false };

  const d = isObject(output.document) ? output.document : {};
  const r = new Reader(d);
  const docType = typeof d.document_type === 'string' && (DOC_TYPES as string[]).includes(d.document_type)
    ? (d.document_type as DocumentTypeGuess)
    : null;
  return {
    ok: true,
    value: {
      document: {
        title: r.optional('title', 200),
        document_type: docType,
        report_date_as_written: r.optional('report_date_as_written', 60),
        collection_date_as_written: r.optional('collection_date_as_written', 60),
        provider_name: r.optional('provider_name', 200),
        patient_name_as_written: r.optional('patient_name_as_written', 200),
        patient_dob_as_written: r.optional('patient_dob_as_written', 60),
      },
      encounters, observations, medications, conditions, allergies, procedures,
    },
  };
}

export function parseEncounter(v: unknown): Parsed<RawEncounter> {
  if (!isObject(v)) return { ok: false, reason: 'schema_invalid' };
  const r = new Reader(v);
  const base = r.base();
  const value: RawEncounter = {
    ...base,
    key: r.required('key', 40),
    encounter_type: r.optional('encounter_type', 40),
    date_as_written: r.optional('date_as_written', 60),
    provider_name: r.optional('provider_name', 200),
    facility_name: r.optional('facility_name', 200),
    reason_as_written: r.optional('reason_as_written', 1000),
  };
  return done(r, value);
}

export function parseObservation(v: unknown): Parsed<RawObservation> {
  if (!isObject(v)) return { ok: false, reason: 'schema_invalid' };
  const r = new Reader(v);
  const base = r.base();
  const value: RawObservation = {
    ...base,
    name_as_written: r.required('name_as_written', 300),
    value_as_written: r.required('value_as_written', 300),
    unit_as_written: r.optional('unit_as_written', 50),
    reference_range_as_written: r.optional('reference_range_as_written', 200),
    abnormal_flag_as_written: r.optional('abnormal_flag_as_written', 20),
    date_as_written: r.optional('date_as_written', 60),
    specimen: r.optional('specimen', 100),
    category: r.optional('category', 40),
    encounter_key: r.optional('encounter_key', 40),
  };
  return done(r, value);
}

export function parseMedication(v: unknown): Parsed<RawMedication> {
  if (!isObject(v)) return { ok: false, reason: 'schema_invalid' };
  const r = new Reader(v);
  const base = r.base();
  const value: RawMedication = {
    ...base,
    name_as_written: r.required('name_as_written', 300),
    strength_as_written: r.optional('strength_as_written', 100),
    dose_as_written: r.optional('dose_as_written', 100),
    frequency_as_written: r.optional('frequency_as_written', 100),
    route_as_written: r.optional('route_as_written', 50),
    duration_as_written: r.optional('duration_as_written', 100),
    instructions_as_written: r.optional('instructions_as_written', 1000),
    status_as_written: r.optional('status_as_written', 100),
    start_date_as_written: r.optional('start_date_as_written', 60),
    end_date_as_written: r.optional('end_date_as_written', 60),
    prescribed_date_as_written: r.optional('prescribed_date_as_written', 60),
    prescriber_name: r.optional('prescriber_name', 200),
    encounter_key: r.optional('encounter_key', 40),
  };
  return done(r, value);
}

export function parseCondition(v: unknown): Parsed<RawCondition> {
  if (!isObject(v)) return { ok: false, reason: 'schema_invalid' };
  const r = new Reader(v);
  const base = r.base();
  const value: RawCondition = {
    ...base,
    name_as_written: r.required('name_as_written', 300),
    status_as_written: r.optional('status_as_written', 100),
    assertion: r.optional('assertion', 20),
    recorded_date_as_written: r.optional('recorded_date_as_written', 60),
    encounter_key: r.optional('encounter_key', 40),
  };
  return done(r, value);
}

export function parseAllergy(v: unknown): Parsed<RawAllergy> {
  if (!isObject(v)) return { ok: false, reason: 'schema_invalid' };
  const r = new Reader(v);
  const base = r.base();
  const value: RawAllergy = {
    ...base,
    substance_as_written: r.required('substance_as_written', 300),
    reaction_as_written: r.optional('reaction_as_written', 500),
    severity_as_written: r.optional('severity_as_written', 50),
    assertion: r.optional('assertion', 20),
    recorded_date_as_written: r.optional('recorded_date_as_written', 60),
    encounter_key: r.optional('encounter_key', 40),
  };
  return done(r, value);
}

export function parseProcedure(v: unknown): Parsed<RawProcedure> {
  if (!isObject(v)) return { ok: false, reason: 'schema_invalid' };
  const r = new Reader(v);
  const base = r.base();
  const value: RawProcedure = {
    ...base,
    name_as_written: r.required('name_as_written', 300),
    procedure_kind: r.optional('procedure_kind', 20),
    performed_date_as_written: r.optional('performed_date_as_written', 60),
    performer_name: r.optional('performer_name', 200),
    facility_name: r.optional('facility_name', 200),
    dose_number_as_written: r.optional('dose_number_as_written', 20),
    encounter_key: r.optional('encounter_key', 40),
  };
  return done(r, value);
}

/** Quote length rules shared by every entity. */
export function quoteLengthProblem(quote: string): RejectionReason | null {
  if (quote.length < LIMITS.minQuoteChars) return 'quote_too_short';
  if (quote.length > LIMITS.maxQuoteChars) return 'quote_too_long';
  return null;
}
