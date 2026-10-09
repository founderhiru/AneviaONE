/**
 * Trusted health records (Gate 2 input) and how they are loaded.
 *
 * Only the `current_*` views are read: live facts whose confidence gate
 * passed or that a person confirmed. Low-confidence / ambiguous facts never
 * reach Health Memory, Timeline, Trends, What Changed or Ask My Health.
 *
 * Loading always uses the CALLER's Supabase session (anon key + their JWT),
 * so Row Level Security decides what is visible — this code never uses the
 * service role and can't read another person's records.
 */

import { normalizeText } from '../health-engine/normalize.ts';

export type RecordKind = 'observation' | 'condition' | 'medication' | 'allergy' | 'procedure' | 'immunization' | 'encounter';
export const ALL_KINDS: RecordKind[] = ['observation', 'condition', 'medication', 'allergy', 'procedure', 'immunization', 'encounter'];

export type Evidence = {
  documentId: string | null;
  documentName: string | null;
  /** The report's own printed date, when it could be read unambiguously. */
  reportDate: string | null;
  pageNumber: number | null;
  /** Verbatim quote from the page (extracted facts). */
  sourceText: string | null;
  confidence: number | null;
  extractionRunId: string | null;
};

type Base = {
  id: string;
  kind: RecordKind;
  /** Display name as written on the report. */
  name: string;
  /** Grouping key: case/punctuation-insensitive name. No synonym mapping. */
  key: string;
  /** The record's own date, else its report's date, else null — never invented. */
  date: string | null;
  dateSource: 'record' | 'report' | null;
  evidence: Evidence;
};

export type ObservationRecord = Base & {
  kind: 'observation';
  value: string;
  unit: string | null;
  valueNumeric: number | null;
  /** Canonical spelling of the unit (no conversion), null if unknown. */
  unitNormalized: string | null;
  referenceRange: string | null;
  /** Kind of result as classified when the report was read (laboratory, urine, …), null if unknown. */
  category: string | null;
};
export type ConditionRecord = Base & { kind: 'condition'; assertion: 'mentioned' | 'reported' | 'diagnosed' };
export type MedicationRecord = Base & {
  kind: 'medication';
  dose: string | null;
  frequency: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
};
export type AllergyRecord = Base & { kind: 'allergy'; reaction: string | null; assertion: 'mentioned' | 'reported' | 'diagnosed' };
export type ProcedureRecord = Base & { kind: 'procedure' | 'immunization' };
export type EncounterRecord = Base & { kind: 'encounter'; encounterType: string; provider: string | null; facility: string | null };

export type TrustedRecord = ObservationRecord | ConditionRecord | MedicationRecord | AllergyRecord | ProcedureRecord | EncounterRecord;

export function nameKey(name: string): string {
  return normalizeText(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

// ------------------------------------------------------------------ loading --

type Row = Record<string, unknown>;

/** The data access the loader needs; implemented over Supabase (RLS) or in memory for tests. */
export interface TrustedRecordSource {
  /** Rows from a `current_*` view, optionally filtered by a name substring. */
  facts(view: string, columns: string, options: { nameColumn: string; nameContains?: string; procedureKind?: string }): Promise<Row[]>;
  documents(ids: string[]): Promise<{ id: string; original_filename: string; report_date: string | null }[]>;
  pages(ids: string[]): Promise<{ id: string; page_number: number }[]>;
}

const EVIDENCE_COLUMNS = 'id, document_id, document_page_id, extraction_run_id, source_text, confidence';

const VIEWS: Record<RecordKind, { view: string; nameColumn: string; columns: string; procedureKind?: string }> = {
  observation: {
    view: 'current_observations',
    nameColumn: 'name_as_written',
    columns: 'name_as_written, value_as_written, unit_as_written, reference_range_as_written, effective_date, value_numeric, unit_normalized, category',
  },
  condition: { view: 'current_conditions', nameColumn: 'name_as_written', columns: 'name_as_written, assertion, recorded_date, onset_date' },
  medication: {
    view: 'current_medications',
    nameColumn: 'name_as_written',
    columns: 'name_as_written, dose_as_written, frequency_as_written, status, start_date, end_date, prescribed_date',
  },
  allergy: { view: 'current_allergies', nameColumn: 'substance_as_written', columns: 'substance_as_written, reaction_as_written, assertion, recorded_date' },
  procedure: { view: 'current_procedures', nameColumn: 'name_as_written', columns: 'name_as_written, performed_date, procedure_kind', procedureKind: 'procedure' },
  immunization: { view: 'current_procedures', nameColumn: 'name_as_written', columns: 'name_as_written, performed_date, procedure_kind', procedureKind: 'immunization' },
  encounter: {
    view: 'current_encounters',
    nameColumn: 'reason_as_written',
    columns: 'encounter_date, encounter_type, provider_name, facility_name, reason_as_written',
  },
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

const ENCOUNTER_LABELS: Record<string, string> = {
  lab_test: 'Lab test',
  consultation: 'Consultation',
  hospital_admission: 'Hospital admission',
  procedure: 'Procedure',
  immunization: 'Immunization',
  imaging: 'Imaging',
  other: 'Visit',
};

/**
 * Loads only the record kinds asked for (minimum necessary), joined to their
 * document name, report date and page number.
 */
export async function loadTrustedRecords(
  source: TrustedRecordSource,
  kinds: RecordKind[] = ALL_KINDS,
  options: { nameContains?: string } = {},
): Promise<TrustedRecord[]> {
  const unique = [...new Set(kinds)];
  const rowsByKind = await Promise.all(
    unique.map(async (kind) => {
      const v = VIEWS[kind];
      const nameContains = kind === 'encounter' ? undefined : options.nameContains;
      const rows = await source.facts(v.view, `${EVIDENCE_COLUMNS}, ${v.columns}`, {
        nameColumn: v.nameColumn,
        nameContains,
        procedureKind: v.procedureKind,
      });
      return rows.map((row) => ({ kind, row }));
    }),
  );
  const all = rowsByKind.flat();
  const docIds = [...new Set(all.map(({ row }) => str(row.document_id)).filter((x): x is string => Boolean(x)))];
  const pageIds = [...new Set(all.map(({ row }) => str(row.document_page_id)).filter((x): x is string => Boolean(x)))];
  const [docs, pages] = await Promise.all([docIds.length ? source.documents(docIds) : [], pageIds.length ? source.pages(pageIds) : []]);
  const docById = new Map(docs.map((d) => [d.id, d]));
  const pageById = new Map(pages.map((p) => [p.id, p.page_number]));

  const records = all.map(({ kind, row }) => toRecord(kind, row, docById, pageById));
  return records.sort(compareRecords);
}

function toRecord(
  kind: RecordKind,
  row: Row,
  docById: Map<string, { original_filename: string; report_date: string | null }>,
  pageById: Map<string, number>,
): TrustedRecord {
  const docId = str(row.document_id);
  const doc = docId ? docById.get(docId) : undefined;
  const reportDate = doc?.report_date ?? null;
  const evidence: Evidence = {
    documentId: docId,
    documentName: doc?.original_filename ?? null,
    reportDate,
    pageNumber: str(row.document_page_id) ? (pageById.get(row.document_page_id as string) ?? null) : null,
    sourceText: str(row.source_text),
    confidence: num(row.confidence),
    extractionRunId: str(row.extraction_run_id),
  };
  const dated = (own: string | null) =>
    own ? { date: own, dateSource: 'record' as const } : reportDate ? { date: reportDate, dateSource: 'report' as const } : { date: null, dateSource: null };
  const base = (name: string, own: string | null) => ({ id: String(row.id), name, key: nameKey(name), evidence, ...dated(own) });

  switch (kind) {
    case 'observation':
      return {
        ...base(String(row.name_as_written), str(row.effective_date)),
        kind,
        value: String(row.value_as_written),
        unit: str(row.unit_as_written),
        valueNumeric: num(row.value_numeric),
        unitNormalized: str(row.unit_normalized),
        referenceRange: str(row.reference_range_as_written),
        category: str(row.category),
      };
    case 'condition':
      return { ...base(String(row.name_as_written), str(row.onset_date) ?? str(row.recorded_date)), kind, assertion: (str(row.assertion) ?? 'mentioned') as ConditionRecord['assertion'] };
    case 'medication':
      return {
        ...base(String(row.name_as_written), str(row.prescribed_date) ?? str(row.start_date)),
        kind,
        dose: str(row.dose_as_written),
        frequency: str(row.frequency_as_written),
        status: str(row.status) ?? 'unknown',
        startDate: str(row.start_date),
        endDate: str(row.end_date),
      };
    case 'allergy':
      return {
        ...base(String(row.substance_as_written), str(row.recorded_date)),
        kind,
        reaction: str(row.reaction_as_written),
        assertion: (str(row.assertion) ?? 'reported') as AllergyRecord['assertion'],
      };
    case 'procedure':
    case 'immunization':
      return { ...base(String(row.name_as_written), str(row.performed_date)), kind };
    case 'encounter': {
      const type = str(row.encounter_type) ?? 'other';
      const name = str(row.reason_as_written) ?? str(row.facility_name) ?? ENCOUNTER_LABELS[type] ?? 'Visit';
      return {
        ...base(name, str(row.encounter_date)),
        kind,
        encounterType: type,
        provider: str(row.provider_name),
        facility: str(row.facility_name),
      };
    }
  }
}

/** Deterministic order: date (newest first, undated last), then kind, name, id. */
export function compareRecords(a: TrustedRecord, b: TrustedRecord): number {
  if (a.date !== b.date) {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? 1 : -1;
  }
  return a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key) || a.id.localeCompare(b.id);
}

/** Supabase implementation — `client` MUST be created with the caller's JWT (RLS applies). */
// deno-lint-ignore no-explicit-any
export function supabaseRecordSource(client: any): TrustedRecordSource {
  const fail = (op: string) => {
    throw new Error(`records_query_failed:${op}`);
  };
  return {
    async facts(view, columns, options) {
      let q = client.from(view).select(columns);
      if (options.procedureKind) q = q.eq('procedure_kind', options.procedureKind);
      if (options.nameContains) q = q.ilike(options.nameColumn, `%${options.nameContains.replace(/[%_\\]/g, (c: string) => `\\${c}`)}%`);
      const { data, error } = await q.limit(2000);
      if (error) fail(view);
      return data ?? [];
    },
    async documents(ids) {
      const { data, error } = await client.from('documents').select('id, original_filename, report_date').in('id', ids);
      if (error) fail('documents');
      return data ?? [];
    },
    async pages(ids) {
      const { data, error } = await client.from('document_pages').select('id, page_number').in('id', ids);
      if (error) fail('document_pages');
      return data ?? [];
    },
  };
}
