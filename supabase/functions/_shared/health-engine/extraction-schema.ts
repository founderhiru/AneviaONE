/**
 * The structured-extraction contract between StructuredExtractor and the
 * deterministic validator.
 *
 * The JSON schema is sent to the AI provider as a structured-output format.
 * It contains NO patient data — only field names and generic enums — because
 * providers cache compiled schemas separately from message content.
 *
 * Every fact quotes its evidence (`source_text`) from a numbered page; every
 * date and value is returned AS WRITTEN. Interpretation (date parsing,
 * numbers, units) happens afterwards in deterministic code, never in the model.
 */

export const OBSERVATION_CATEGORIES = ['laboratory', 'vital_sign', 'imaging', 'urine', 'other'] as const;
export const MEDICATION_STATUSES = ['active', 'stopped', 'as_needed'] as const;
export const ASSERTIONS = ['mentioned', 'reported', 'diagnosed'] as const;
export const PROCEDURE_KINDS = ['procedure', 'immunization'] as const;
export const ENCOUNTER_TYPES = ['lab_test', 'consultation', 'hospital_admission', 'procedure', 'immunization', 'imaging', 'other'] as const;

export type Evidence = { page: number; source_text: string; confidence: number };

// Text fields typed `string | null` arrive from the model as "" when not stated
// (null is still accepted); validate.ts treats both as "not stated".

export type ExtractedObservation = Evidence & {
  test_name: string;
  raw_value: string;
  raw_unit: string | null;
  reference_range: string | null;
  observation_date: string | null;
  category: (typeof OBSERVATION_CATEGORIES)[number];
};

export type ExtractedMedication = Evidence & {
  name: string;
  dose: string | null;
  frequency: string | null;
  /** The model returns "not_stated" (legacy: null); validate.ts maps both to null. */
  status: (typeof MEDICATION_STATUSES)[number] | 'not_stated' | null;
  start_date: string | null;
  end_date: string | null;
};

export type ExtractedCondition = Evidence & { name: string; assertion: (typeof ASSERTIONS)[number] };

export type ExtractedAllergy = Evidence & {
  allergen: string;
  reaction: string | null;
  assertion: (typeof ASSERTIONS)[number];
};

export type ExtractedProcedure = Evidence & {
  name: string;
  date: string | null;
  procedure_kind: (typeof PROCEDURE_KINDS)[number];
};

export type ExtractedEncounter = Evidence & {
  encounter_date: string | null;
  encounter_type: (typeof ENCOUNTER_TYPES)[number];
  provider_name: string | null;
  facility_name: string | null;
};

/** A value quoted from a page, without a confidence (identity / report date). */
export type QuotedValue = { value: string; page: number; source_text: string };

export type StructuredExtraction = {
  patient_name: QuotedValue | null;
  patient_date_of_birth: QuotedValue | null;
  report_date: QuotedValue | null;
  observations: ExtractedObservation[];
  medications: ExtractedMedication[];
  conditions: ExtractedCondition[];
  allergies: ExtractedAllergy[];
  procedures: ExtractedProcedure[];
  encounters: ExtractedEncounter[];
};

// ------------------------------------------------------------ JSON schema ---

/**
 * "Not stated" is an EMPTY STRING, not null. Nullable unions (`anyOf` with
 * null) multiply the provider's compiled grammar: with 16 of them the schema
 * was rejected ("The compiled grammar is too large"). validate.ts maps "" back
 * to null, so the stored meaning is unchanged: value as written, or not stated.
 */
const notStated = { type: 'string' };
/** Medication status the report doesn't state. Mapped back to null in validate.ts. */
export const STATUS_NOT_STATED = 'not_stated';
const evidence = {
  page: { type: 'integer', description: 'Page number from the <page number="N"> tag the quote comes from.' },
  source_text: { type: 'string', description: 'Verbatim quote from that page containing the fact. Copy exactly; do not paraphrase.' },
  confidence: { type: 'number', description: 'Your confidence (0 to 1) that this fact is read correctly.' },
};
const evidenceKeys = ['page', 'source_text', 'confidence'];

function object(properties: Record<string, unknown>, required: string[]) {
  return { type: 'object', properties, required, additionalProperties: false };
}

/** Always present; an empty `value` means the report doesn't print it (validate.ts treats it as absent). */
const quoted = object(
  {
    value: { type: 'string', description: 'Exactly as written in the report, or an empty string if the report does not print it.' },
    page: evidence.page,
    source_text: evidence.source_text,
  },
  ['value', 'page', 'source_text'],
);

export const EXTRACTION_JSON_SCHEMA = object(
  {
    patient_name: quoted,
    patient_date_of_birth: quoted,
    report_date: quoted,
    observations: {
      type: 'array',
      items: object(
        {
          test_name: { type: 'string', description: 'Test name as written.' },
          raw_value: { type: 'string', description: 'Result exactly as written, e.g. "5.8", "<0.5", "Negative".' },
          raw_unit: { ...notStated, description: 'Unit exactly as written, or an empty string if none is shown.' },
          reference_range: { ...notStated, description: 'Reference range exactly as written, or an empty string if none is shown.' },
          observation_date: { ...notStated, description: 'Collection/result date exactly as written, or an empty string.' },
          category: { type: 'string', enum: [...OBSERVATION_CATEGORIES] },
          ...evidence,
        },
        ['test_name', 'raw_value', 'raw_unit', 'reference_range', 'observation_date', 'category', ...evidenceKeys],
      ),
    },
    medications: {
      type: 'array',
      items: object(
        {
          name: { type: 'string' },
          dose: notStated,
          frequency: notStated,
          status: { type: 'string', enum: [...MEDICATION_STATUSES, STATUS_NOT_STATED], description: `Only if explicitly stated; otherwise "${STATUS_NOT_STATED}".` },
          start_date: notStated,
          end_date: notStated,
          ...evidence,
        },
        ['name', 'dose', 'frequency', 'status', 'start_date', 'end_date', ...evidenceKeys],
      ),
    },
    conditions: {
      type: 'array',
      items: object(
        {
          name: { type: 'string' },
          assertion: {
            type: 'string',
            enum: [...ASSERTIONS],
            description: 'diagnosed only if a clinician states the diagnosis for this patient; reported if the patient reports it; otherwise mentioned (including family history).',
          },
          ...evidence,
        },
        ['name', 'assertion', ...evidenceKeys],
      ),
    },
    allergies: {
      type: 'array',
      items: object(
        { allergen: { type: 'string' }, reaction: notStated, assertion: { type: 'string', enum: [...ASSERTIONS] }, ...evidence },
        ['allergen', 'reaction', 'assertion', ...evidenceKeys],
      ),
    },
    procedures: {
      type: 'array',
      items: object(
        { name: { type: 'string' }, date: notStated, procedure_kind: { type: 'string', enum: [...PROCEDURE_KINDS] }, ...evidence },
        ['name', 'date', 'procedure_kind', ...evidenceKeys],
      ),
    },
    encounters: {
      type: 'array',
      items: object(
        {
          encounter_date: notStated,
          encounter_type: { type: 'string', enum: [...ENCOUNTER_TYPES] },
          provider_name: notStated,
          facility_name: notStated,
          ...evidence,
        },
        ['encounter_date', 'encounter_type', 'provider_name', 'facility_name', ...evidenceKeys],
      ),
    },
  },
  ['patient_name', 'patient_date_of_birth', 'report_date', 'observations', 'medications', 'conditions', 'allergies', 'procedures', 'encounters'],
);
