/**
 * Synthetic trusted records (fictional person, fictional values) shaped like
 * rows of the current_* views, plus an in-memory source that applies the
 * same per-user isolation RLS does.
 */
import type { TrustedRecordSource } from '../records.ts';

export const USER = '11111111-1111-4111-8111-111111111111';
export const OTHER = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown> & { user_id: string; id: string };
type Doc = { id: string; user_id: string; original_filename: string; report_date: string | null };

export class MemorySource implements TrustedRecordSource {
  views = new Map<string, Row[]>();
  docs: Doc[] = [];
  pageRows: { id: string; page_number: number; user_id: string }[] = [];
  queries: { view: string; nameContains?: string }[] = [];
  constructor(private readonly asUser: string) {}

  static seeded(asUser: string) {
    const s = new MemorySource(asUser);
    seed(s);
    return s;
  }

  facts(view: string, _columns: string, options: { nameColumn: string; nameContains?: string; procedureKind?: string }) {
    this.queries.push({ view, nameContains: options.nameContains });
    return Promise.resolve(
      (this.views.get(view) ?? []).filter(
        (r) =>
          r.user_id === this.asUser &&
          (!options.procedureKind || r.procedure_kind === options.procedureKind) &&
          (!options.nameContains || String(r[options.nameColumn] ?? '').toLowerCase().includes(options.nameContains.toLowerCase())),
      ),
    );
  }
  documents(ids: string[]) {
    return Promise.resolve(this.docs.filter((d) => d.user_id === this.asUser && ids.includes(d.id)));
  }
  pages(ids: string[]) {
    return Promise.resolve(this.pageRows.filter((p) => p.user_id === this.asUser && ids.includes(p.id)));
  }
}

let n = 0;
function add(s: MemorySource, view: string, user: string, doc: string | null, page: number | null, row: Record<string, unknown>) {
  const id = `r${String(++n).padStart(3, '0')}`;
  const pageId = doc && page ? `${doc}-p${page}` : null;
  if (pageId && !s.pageRows.some((p) => p.id === pageId)) s.pageRows.push({ id: pageId, page_number: page!, user_id: user });
  s.views.set(view, [
    ...(s.views.get(view) ?? []),
    { id, user_id: user, document_id: doc, document_page_id: pageId, extraction_run_id: doc ? `run-${doc}` : null, source_text: row.quote ?? null, confidence: doc ? 0.95 : null, ...row },
  ]);
  return id;
}

const obs = (name: string, value: string, unit: string | null, range: string | null, date: string | null = null) => ({
  name_as_written: name,
  value_as_written: value,
  unit_as_written: unit,
  reference_range_as_written: range,
  effective_date: date,
  value_numeric: Number.isFinite(Number(value)) ? Number(value) : null,
  unit_normalized: unit,
  quote: `${name} ${value} ${unit ?? ''}`.trim(),
});
const med = (name: string, dose: string | null = null) => ({ name_as_written: name, dose_as_written: dose, frequency_as_written: null, status: 'unknown', quote: name });

export const DOCS = { A: 'doc-a', B: 'doc-b', C: 'doc-c', U: 'doc-undated', X: 'doc-other-user' };

function seed(s: MemorySource) {
  s.docs.push(
    { id: DOCS.A, user_id: USER, original_filename: 'Report A.pdf', report_date: '2026-03-12' },
    { id: DOCS.B, user_id: USER, original_filename: 'Report B.pdf', report_date: '2026-06-10' },
    { id: DOCS.C, user_id: USER, original_filename: 'Report C.pdf', report_date: '2026-09-15' },
    { id: DOCS.U, user_id: USER, original_filename: 'Undated note.pdf', report_date: null },
    { id: DOCS.X, user_id: OTHER, original_filename: 'Someone else.pdf', report_date: '2026-10-01' },
  );
  // Report A
  add(s, 'current_observations', USER, DOCS.A, 1, obs('HbA1c', '5.8', '%', '4.0 - 5.6'));
  add(s, 'current_observations', USER, DOCS.A, 1, obs('LDL Cholesterol', '120', 'mg/dL', '< 100'));
  add(s, 'current_observations', USER, DOCS.A, 1, obs('Glucose', '98', 'mg/dL', null));
  add(s, 'current_conditions', USER, DOCS.A, 2, { name_as_written: 'Diabetes', assertion: 'mentioned', recorded_date: null, quote: 'Family history of diabetes' });
  // Report B
  add(s, 'current_observations', USER, DOCS.B, 1, obs('HbA1c', '6.1', '%', '4.0 - 5.6'));
  add(s, 'current_observations', USER, DOCS.B, 1, obs('LDL Cholesterol', '135', 'mg/dL', '< 100'));
  add(s, 'current_medications', USER, DOCS.B, 2, med('Metformin', '500 mg'));
  add(s, 'current_medications', USER, DOCS.B, 2, med('Atorvastatin', '10 mg'));
  add(s, 'current_conditions', USER, DOCS.B, 2, { name_as_written: 'Hypertension', assertion: 'diagnosed', recorded_date: null, quote: 'Known hypertension' });
  // Report C
  add(s, 'current_observations', USER, DOCS.C, 1, obs('HbA1c', '5.9', '%', '4.0 - 5.6'));
  add(s, 'current_observations', USER, DOCS.C, 1, obs('LDL Cholesterol', '128', 'mg/dL', '< 100'));
  add(s, 'current_observations', USER, DOCS.C, 1, obs('Glucose', '5.4', 'mmol/L', null)); // different unit: not combined
  add(s, 'current_medications', USER, DOCS.C, 2, med('Metformin', '500 mg'));
  add(s, 'current_medications', USER, DOCS.C, 2, med('Telmisartan', '40 mg'));
  add(s, 'current_allergies', USER, DOCS.C, 2, { substance_as_written: 'Penicillin', reaction_as_written: 'rash', assertion: 'reported', recorded_date: null, quote: 'Penicillin (rash)' });
  add(s, 'current_procedures', USER, DOCS.C, 3, { name_as_written: 'Influenza vaccine', performed_date: '2025-11-02', procedure_kind: 'immunization', quote: 'Influenza vaccine 02/11/2025' });
  add(s, 'current_procedures', USER, DOCS.C, 3, { name_as_written: 'Cataract surgery', performed_date: null, procedure_kind: 'procedure', quote: 'Cataract surgery' });
  // Undated report: no report date, no record date — never given one.
  add(s, 'current_observations', USER, DOCS.U, 1, obs('Vitamin D', '22', 'ng/mL', null));
  // Another person's records — must never appear.
  add(s, 'current_observations', OTHER, DOCS.X, 1, obs('HbA1c', '9.9', '%', null));
  add(s, 'current_medications', OTHER, DOCS.X, 1, med('Insulin'));
}
