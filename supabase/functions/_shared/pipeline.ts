/**
 * Turns the model's raw JSON into a validated commit payload. Plain
 * TypeScript, no model, no I/O. Every rule that protects the record lives
 * here or in the modules it calls.
 */
import { assessAllergy, assessCondition, looksLikeImmunization } from './assertion.ts';
import { chunkPages } from './chunking.ts';
import { CONFIDENCE_CAPS, decideGate } from './confidence.ts';
import { DEFAULT_CONFIDENCE_THRESHOLD, LIMITS, PIPELINE_VERSION } from './config.ts';
import { parseDateAsWritten, type DateParse } from './dates.ts';
import { checkQuote, indexPages, optionalInQuote, textOnAnyPage, valueInQuote, type PageIndex } from './evidence.ts';
import { factFingerprint } from './fingerprint.ts';
import { checkReportPerson, type ProfileReference } from './identity.ts';
import { findAnalyte, normalizeObservation, type Analyte } from './normalization.ts';
import { parseReferenceRange, parseValueAsWritten } from './numbers.ts';
import {
  parseAllergy, parseCondition, parseEncounter, parseMedication, parseObservation, parseProcedure,
  type Parsed, type RawExtraction,
} from './schema.ts';
import { containsTextCI, stripControlChars } from './text.ts';
import type { IdentityCheck, PageText, RejectionReason, ReviewReason, RunStats } from './types.ts';

type Row = Record<string, unknown>;

export type CommitPayload = {
  page_count: number;
  content_sha256: string;
  document: {
    title: string | null;
    report_date: string | null;
    provider_name: string | null;
    document_type: string | null;
    identity_check: IdentityCheck;
  };
  pages: { page_number: number; text_content: string; text_source: string; width_pt: number | null; height_pt: number | null }[];
  encounters: Row[];
  observations: Row[];
  conditions: Row[];
  medications: Row[];
  procedures: Row[];
  allergies: Row[];
  stats: RunStats;
};

export type BuildInput = {
  pages: PageText[];
  pageCount: number;
  textSource: 'pdf_text_layer' | 'ocr';
  contentSha256: string;
  extraction: RawExtraction;
  profile: ProfileReference;
  confidenceThreshold?: number;
  baseStats?: RunStats;
};

export type BuildResult =
  | { kind: 'patient_mismatch'; identity: 'mismatch'; stats: RunStats }
  | { kind: 'built'; identity: IdentityCheck; payload: CommitPayload; proposed: number; accepted: number; stats: RunStats };

const OBS_CATEGORIES = new Set(['laboratory', 'vital_sign', 'imaging', 'urine', 'other']);
const ENCOUNTER_TYPES = new Set(['lab_test', 'consultation', 'hospital_admission', 'procedure', 'immunization', 'imaging', 'other']);
const BP_NAME = /^(blood pressure|bp|b\.p\.|blood pressure \(bp\)|bp \(blood pressure\))$/i;
const BP_VALUE = /^(\d{2,3})\s*\/\s*(\d{2,3})$/;

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function pickMax(a: Row, b: Row): Row {
  return (b.confidence as number) > (a.confidence as number) ? b : a;
}

export async function buildCommitPayload(input: BuildInput): Promise<BuildResult> {
  const threshold = input.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const pages = indexPages(input.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })));
  const stats: RunStats = {
    ...input.baseStats,
    accepted: {}, needs_review: {}, rejected: {}, dropped_optional_fields: 0, confidence_threshold: threshold,
  };
  const accepted = stats.accepted as Record<string, number>;
  const needsReview = stats.needs_review as Record<string, number>;
  const rejected = stats.rejected as Partial<Record<RejectionReason, number>>;
  const reject = (reason: RejectionReason) => {
    rejected[reason] = (rejected[reason] ?? 0) + 1;
  };
  const dropped = (n: number) => {
    stats.dropped_optional_fields = (stats.dropped_optional_fields ?? 0) + n;
  };

  const ex = input.extraction;
  const meta = ex.document;

  // ---------------------------------------------------------------- identity
  const reportName = meta.patient_name_as_written && textOnAnyPage(pages, meta.patient_name_as_written) ? meta.patient_name_as_written : null;
  const reportDob = meta.patient_dob_as_written && textOnAnyPage(pages, meta.patient_dob_as_written) ? meta.patient_dob_as_written : null;
  const identity = checkReportPerson({ name: reportName, dateOfBirth: reportDob }, input.profile);
  if (identity === 'mismatch') return { kind: 'patient_mismatch', identity, stats };

  // ---------------------------------------------------------- document dates
  const verifiedDate = (written: string | null): DateParse =>
    written && textOnAnyPage(pages, written) ? parseDateAsWritten(written) : { kind: 'none' };
  const reportDate = verifiedDate(meta.report_date_as_written);
  const collectionDate = verifiedDate(meta.collection_date_as_written);
  const reportIso = reportDate.kind === 'ok' ? reportDate.iso : null;
  const collectionIso = collectionDate.kind === 'ok' ? collectionDate.iso : null;

  /** A date that must be present on some page; ambiguity is reported, never guessed. */
  const readDate = (written: string | null): DateParse => verifiedDate(written);

  // -------------------------------------------------------------- encounters
  const encounterKeys = new Set<string>();
  const encounters: Row[] = [];
  const encByFp = new Map<string, Row>();
  let proposed = 0;

  for (const raw of ex.encounters) {
    proposed++;
    const p = parseEncounter(raw);
    if (!p.ok) { reject(p.reason); continue; }
    const e = p.value;
    dropped(p.dropped ?? 0);
    const q = checkQuote(pages, e.page_number, e.source_text);
    if (!q.ok) { reject(q.reason); continue; }
    const date = readDate(e.date_as_written);
    const iso = date.kind === 'ok' ? date.iso : null;
    const type = e.encounter_type && ENCOUNTER_TYPES.has(e.encounter_type) ? e.encounter_type : 'other';
    const provider = e.provider_name && textOnAnyPage(pages, e.provider_name) ? e.provider_name : null;
    const facility = e.facility_name && textOnAnyPage(pages, e.facility_name) ? e.facility_name : null;
    const reason = optionalInQuote(q.quote, e.reason_as_written);
    const gate = decideGate(e.confidence, threshold, []);
    const fp = await factFingerprint(['encounter', e.page_number, type, iso, facility, provider]);
    const row: Row = {
      key: e.key, fingerprint: fp, page_number: e.page_number, source_text: q.quote, confidence: e.confidence,
      review_status: gate.gate, review_reason: gate.reason,
      encounter_date: iso, end_date: null, provider_name: provider, facility_name: facility,
      reason_as_written: reason, encounter_type: type, specialty: null, interpretation_version: PIPELINE_VERSION,
    };
    const prev = encByFp.get(fp);
    if (prev) { reject('duplicate'); if ((row.confidence as number) > (prev.confidence as number)) encByFp.set(fp, row); continue; }
    encByFp.set(fp, row);
  }
  for (const row of encByFp.values()) {
    encounters.push(row);
    encounterKeys.add(row.key as string);
    bump(accepted, 'encounters');
    if (row.review_status === 'needs_review') bump(needsReview, row.review_reason as string);
  }
  const linkKey = (k: string | null): string | null => (k && encounterKeys.has(k) ? k : null);

  /** Shared bookkeeping for every non-encounter fact. */
  const finish = (table: string, row: Row) => {
    bump(accepted, table);
    if (row.review_status === 'needs_review') bump(needsReview, row.review_reason as string);
  };
  const dedupe = (table: string, rows: Row[]): Row[] => {
    const byFp = new Map<string, Row>();
    for (const r of rows) {
      const prev = byFp.get(r.fingerprint as string);
      if (!prev) { byFp.set(r.fingerprint as string, r); continue; }
      reject('duplicate');
      byFp.set(r.fingerprint as string, pickMax(prev, r));
    }
    const out = [...byFp.values()];
    for (const r of out) finish(table, r);
    return out;
  };

  // ------------------------------------------------------------ observations
  const observationRows: Row[] = [];
  for (const raw of ex.observations) {
    proposed++;
    const p = parseObservation(raw);
    if (!p.ok) { reject(p.reason); continue; }
    const o = p.value;
    dropped(p.dropped ?? 0);
    const q = checkQuote(pages, o.page_number, o.source_text);
    if (!q.ok) { reject(q.reason); continue; }
    if (!valueInQuote(q.quote, o.value_as_written)) { reject('value_not_in_quote'); continue; }
    if (!containsTextCI(q.quote, o.name_as_written)) { reject('name_not_in_quote'); continue; }

    const forced: ReviewReason[] = [];
    let confidence = o.confidence;

    let unit = o.unit_as_written;
    if (unit && !containsTextCI(q.quote, unit)) {
      unit = null;
      forced.push('unit_not_in_quote');
      confidence = Math.min(confidence, CONFIDENCE_CAPS.unitNotInQuote);
    }
    const range = optionalInQuote(q.quote, o.reference_range_as_written);
    if (o.reference_range_as_written && !range) dropped(1);
    const flag = optionalInQuote(q.quote, o.abnormal_flag_as_written);
    const specimen = o.specimen && textOnAnyPage(pages, o.specimen) ? o.specimen : null;

    // Blood pressure "120/80" becomes two observations, each with its own number.
    const bp = BP_NAME.test(o.name_as_written.trim()) ? o.value_as_written.trim().match(BP_VALUE) : null;
    const variants: { analyte: Analyte | null; value: string; display: string | null }[] = bp
      ? [
          { analyte: findAnalyte('systolic blood pressure'), value: bp[1], display: 'Blood pressure (systolic)' },
          { analyte: findAnalyte('diastolic blood pressure'), value: bp[2], display: 'Blood pressure (diastolic)' },
        ]
      : [{ analyte: findAnalyte(o.name_as_written), value: o.value_as_written, display: null }];

    for (const v of variants) {
      const reasons = [...forced];
      let conf = confidence;
      const parsedValue = parseValueAsWritten(v.value);
      let valueNumeric: number | null = null;
      let valueText: string | null = null;
      if (parsedValue.kind === 'number') valueNumeric = parsedValue.value;
      else if (parsedValue.kind === 'bounded' || parsedValue.kind === 'text') valueText = v.value;
      else { reasons.push('ambiguous_value'); conf = Math.min(conf, CONFIDENCE_CAPS.ambiguous); valueText = v.value; }

      let code: string | null = null;
      let display: string | null = v.display;
      let valueNormalized: number | null = null;
      let unitNormalized: string | null = null;
      let rule: string | null = null;
      let refLow: number | null = null;
      let refHigh: number | null = null;
      let category = o.category && OBS_CATEGORIES.has(o.category) ? o.category : 'other';

      if (v.analyte) {
        code = v.analyte.key;
        display = v.display ?? v.analyte.display;
        category = v.analyte.category;
      }
      const parsedRange = range ? parseReferenceRange(range) : null;
      let convert: (x: number) => number = (x) => x;
      if (valueNumeric !== null && v.analyte) {
        const n = normalizeObservation(o.name_as_written, valueNumeric, unit, v.analyte);
        if (n.status === 'normalized') {
          valueNormalized = n.valueNormalized; unitNormalized = n.unitNormalized; rule = n.rule; convert = n.convert;
        } else if (n.status === 'unit_unexpected') {
          reasons.push('unit_unexpected_for_analyte'); conf = Math.min(conf, CONFIDENCE_CAPS.ambiguous);
        }
        // missing_unit / unknown_unit: kept as written, simply not normalised.
      }
      if (parsedRange) {
        refLow = parsedRange.low === null ? null : convert(parsedRange.low);
        refHigh = parsedRange.high === null ? null : convert(parsedRange.high);
        if (refLow !== null && refHigh !== null && refLow > refHigh) { refLow = null; refHigh = null; }
      }

      // Effective date: the observation's own date, else the report's collection
      // date, else the report date. The basis is recorded; nothing is invented.
      const own = readDate(o.date_as_written);
      let effective: string | null = null;
      let basis: 'observation' | 'collection' | 'report' | 'none' = 'none';
      if (own.kind === 'ok') { effective = own.iso; basis = 'observation'; }
      else if (own.kind === 'ambiguous') { reasons.push('ambiguous_date'); conf = Math.min(conf, CONFIDENCE_CAPS.ambiguous); }
      else if (collectionIso) { effective = collectionIso; basis = 'collection'; }
      else if (reportIso) { effective = reportIso; basis = 'report'; }
      if (!effective && !reasons.includes('ambiguous_date')) {
        // A header date that is present but ambiguous is reported as such, not as "missing".
        const headerAmbiguous = collectionDate.kind === 'ambiguous' || (!collectionIso && reportDate.kind === 'ambiguous');
        if (headerAmbiguous) { reasons.push('ambiguous_date'); conf = Math.min(conf, CONFIDENCE_CAPS.ambiguous); }
        else reasons.push('missing_date');
      }

      const gate = decideGate(conf, threshold, reasons);
      const fp = await factFingerprint(['observation', o.page_number, code ?? o.name_as_written, v.value, unit, effective]);
      observationRows.push({
        fingerprint: fp, page_number: o.page_number, source_text: q.quote, confidence: conf,
        review_status: gate.gate, review_reason: gate.reason,
        encounter_key: linkKey(o.encounter_key),
        name_as_written: o.name_as_written, value_as_written: v.value, unit_as_written: unit,
        reference_range_as_written: range, abnormal_flag_as_written: flag,
        effective_date: effective, effective_date_basis: basis, specimen,
        category, code_system: code ? 'LOCAL' : null, code, display_name: display,
        value_numeric: valueNumeric, value_text: valueText, value_normalized: valueNormalized, unit_normalized: unitNormalized,
        reference_low: refLow, reference_high: refHigh, normalization_rule: rule, interpretation_version: PIPELINE_VERSION,
      });
    }
  }
  const observations = dedupe('observations', observationRows);

  // ------------------------------------------------------------- medications
  const medicationRows: Row[] = [];
  for (const raw of ex.medications) {
    proposed++;
    const p = parseMedication(raw);
    if (!p.ok) { reject(p.reason); continue; }
    const m = p.value;
    dropped(p.dropped ?? 0);
    const q = checkQuote(pages, m.page_number, m.source_text);
    if (!q.ok) { reject(q.reason); continue; }
    if (!containsTextCI(q.quote, m.name_as_written)) { reject('name_not_in_quote'); continue; }
    const keep = (v: string | null) => {
      const k = optionalInQuote(q.quote, v);
      if (v && !k) dropped(1);
      return k;
    };
    const strength = keep(m.strength_as_written);
    const dose = keep(m.dose_as_written);
    const frequency = keep(m.frequency_as_written);
    const route = keep(m.route_as_written);
    const duration = keep(m.duration_as_written);
    const instructions = keep(m.instructions_as_written);
    const statusText = keep(m.status_as_written);
    const dateOf = (w: string | null) => {
      const d = readDate(w);
      if (w && d.kind !== 'ok') dropped(1);
      return d.kind === 'ok' ? d.iso : null;
    };
    const start = dateOf(m.start_date_as_written);
    let end = dateOf(m.end_date_as_written);
    if (start && end && end < start) { end = null; dropped(1); }
    const gate = decideGate(m.confidence, threshold, []);
    const fp = await factFingerprint(['medication', m.page_number, m.name_as_written, strength, dose, frequency]);
    medicationRows.push({
      fingerprint: fp, page_number: m.page_number, source_text: q.quote, confidence: m.confidence,
      review_status: gate.gate, review_reason: gate.reason, encounter_key: linkKey(m.encounter_key),
      name_as_written: m.name_as_written, strength_as_written: strength, dose_as_written: dose,
      frequency_as_written: frequency, route_as_written: route, duration_as_written: duration,
      instructions_as_written: instructions, prescribed_date: dateOf(m.prescribed_date_as_written),
      start_date: start, end_date: end,
      prescriber_name: m.prescriber_name && textOnAnyPage(pages, m.prescriber_name) ? m.prescriber_name : null,
      generic_name: null, code_system: null, code: null, status: medicationStatus(statusText),
      interpretation_version: PIPELINE_VERSION,
    });
  }
  const medications = dedupe('medications', medicationRows);

  // -------------------------------------------------------------- conditions
  const conditionRows: Row[] = [];
  for (const raw of ex.conditions) {
    proposed++;
    const p = parseCondition(raw);
    if (!p.ok) { reject(p.reason); continue; }
    const c = p.value;
    dropped(p.dropped ?? 0);
    const q = checkQuote(pages, c.page_number, c.source_text);
    if (!q.ok) { reject(q.reason); continue; }
    if (!containsTextCI(q.quote, c.name_as_written)) { reject('name_not_in_quote'); continue; }
    const a = assessCondition(c.assertion, q.quote);
    if (!a.ok) { reject(a.reason); continue; }
    const status = optionalInQuote(q.quote, c.status_as_written);
    const rec = readDate(c.recorded_date_as_written);
    const gate = decideGate(c.confidence, threshold, []);
    const fp = await factFingerprint(['condition', c.page_number, c.name_as_written]);
    conditionRows.push({
      fingerprint: fp, page_number: c.page_number, source_text: q.quote, confidence: c.confidence,
      review_status: gate.gate, review_reason: gate.reason, encounter_key: linkKey(c.encounter_key),
      name_as_written: c.name_as_written, status_as_written: status,
      recorded_date: rec.kind === 'ok' ? rec.iso : null, onset_date: null, abatement_date: null,
      code_system: null, code: null, display_name: null, clinical_status: conditionStatus(status),
      assertion: a.assertion, interpretation_version: PIPELINE_VERSION,
    });
  }
  const conditions = dedupe('conditions', conditionRows);

  // --------------------------------------------------------------- allergies
  const allergyRows: Row[] = [];
  for (const raw of ex.allergies) {
    proposed++;
    const p = parseAllergy(raw);
    if (!p.ok) { reject(p.reason); continue; }
    const al = p.value;
    dropped(p.dropped ?? 0);
    const q = checkQuote(pages, al.page_number, al.source_text);
    if (!q.ok) { reject(q.reason); continue; }
    if (!containsTextCI(q.quote, al.substance_as_written)) { reject('name_not_in_quote'); continue; }
    const a = assessAllergy(al.assertion, q.quote, al.substance_as_written);
    if (!a.ok) { reject(a.reason); continue; }
    const reaction = optionalInQuote(q.quote, al.reaction_as_written);
    const severityText = optionalInQuote(q.quote, al.severity_as_written);
    const rec = readDate(al.recorded_date_as_written);
    const gate = decideGate(al.confidence, threshold, []);
    const fp = await factFingerprint(['allergy', al.page_number, al.substance_as_written, reaction]);
    allergyRows.push({
      fingerprint: fp, page_number: al.page_number, source_text: q.quote, confidence: al.confidence,
      review_status: gate.gate, review_reason: gate.reason, encounter_key: linkKey(al.encounter_key),
      substance_as_written: al.substance_as_written, reaction_as_written: reaction, severity_as_written: severityText,
      recorded_date: rec.kind === 'ok' ? rec.iso : null, category: 'unknown', severity: allergySeverity(severityText),
      code_system: null, code: null, display_name: null, assertion: a.assertion, interpretation_version: PIPELINE_VERSION,
    });
  }
  const allergies = dedupe('allergies', allergyRows);

  // -------------------------------------------------------------- procedures
  const procedureRows: Row[] = [];
  for (const raw of ex.procedures) {
    proposed++;
    const p = parseProcedure(raw);
    if (!p.ok) { reject(p.reason); continue; }
    const pr = p.value;
    dropped(p.dropped ?? 0);
    const q = checkQuote(pages, pr.page_number, pr.source_text);
    if (!q.ok) { reject(q.reason); continue; }
    if (!containsTextCI(q.quote, pr.name_as_written)) { reject('name_not_in_quote'); continue; }
    const claimedKind = pr.procedure_kind === 'immunization' ? 'immunization' : 'procedure';
    const forced: ReviewReason[] = [];
    let conf = pr.confidence;
    if ((claimedKind === 'immunization') !== looksLikeImmunization(q.quote)) {
      forced.push('kind_uncertain');
      conf = Math.min(conf, CONFIDENCE_CAPS.kindUncertain);
    }
    const when = readDate(pr.performed_date_as_written);
    const performedIso = when.kind === 'ok' ? when.iso : null;
    const gate = decideGate(conf, threshold, forced);
    const fp = await factFingerprint(['procedure', pr.page_number, pr.name_as_written, claimedKind, performedIso]);
    procedureRows.push({
      fingerprint: fp, page_number: pr.page_number, source_text: q.quote, confidence: conf,
      review_status: gate.gate, review_reason: gate.reason, encounter_key: linkKey(pr.encounter_key),
      name_as_written: pr.name_as_written, performed_date: performedIso,
      performer_name: pr.performer_name && textOnAnyPage(pages, pr.performer_name) ? pr.performer_name : null,
      facility_name: pr.facility_name && textOnAnyPage(pages, pr.facility_name) ? pr.facility_name : null,
      dose_number_as_written: optionalInQuote(q.quote, pr.dose_number_as_written),
      procedure_kind: claimedKind, code_system: null, code: null, display_name: null, interpretation_version: PIPELINE_VERSION,
    });
  }
  const procedures = dedupe('procedures', procedureRows);

  const acceptedTotal = Object.values(accepted).reduce((a, b) => a + b, 0);

  const provider = meta.provider_name && textOnAnyPage(pages, meta.provider_name) ? meta.provider_name : null;
  const title = meta.title && textOnAnyPage(pages, meta.title) ? meta.title : null;
  const payload: CommitPayload = {
    page_count: input.pageCount,
    content_sha256: input.contentSha256,
    document: {
      title, report_date: reportIso ?? collectionIso, provider_name: provider,
      document_type: meta.document_type, identity_check: identity,
    },
    pages: input.pages.map((pg) => ({
      page_number: pg.pageNumber, text_content: stripControlChars(pg.text), text_source: input.textSource,
      width_pt: pg.widthPt ?? null, height_pt: pg.heightPt ?? null,
    })),
    encounters, observations, conditions, medications, procedures, allergies, stats,
  };
  return { kind: 'built', identity, payload, proposed, accepted: acceptedTotal, stats };
}

function medicationStatus(text: string | null): 'active' | 'stopped' | 'as_needed' | 'unknown' {
  if (!text) return 'unknown';
  if (/\b(discontinu\w*|stopp\w*|stop|ceased|completed)\b/i.test(text)) return 'stopped';
  if (/\b(prn|as needed|sos)\b/i.test(text)) return 'as_needed';
  if (/\b(active|ongoing|continue\w*|current\w*)\b/i.test(text)) return 'active';
  return 'unknown';
}

function conditionStatus(text: string | null): 'active' | 'resolved' | 'monitoring' | 'unknown' {
  if (!text) return 'unknown';
  if (/\b(resolved|inactive|remission|cured)\b/i.test(text)) return 'resolved';
  if (/\b(monitor\w*|watch\w*|follow[- ]?up)\b/i.test(text)) return 'monitoring';
  if (/\b(active|ongoing|current\w*|persistent)\b/i.test(text)) return 'active';
  return 'unknown';
}

function allergySeverity(text: string | null): 'mild' | 'moderate' | 'severe' | 'unknown' {
  if (!text) return 'unknown';
  const t = text.toLowerCase();
  if (/\bmild\b/.test(t)) return 'mild';
  if (/\bmoderate\b/.test(t)) return 'moderate';
  if (/\bsevere\b/.test(t)) return 'severe';
  return 'unknown';
}

/**
 * Merges the results of several provider requests (one per chunk). Encounter
 * keys are namespaced per chunk so two chunks can never collide.
 */
export function mergeExtractions(parts: RawExtraction[]): RawExtraction {
  const first = <K extends keyof RawExtraction['document']>(k: K) => {
    for (const p of parts) if (p.document[k] !== null && p.document[k] !== undefined) return p.document[k];
    return null;
  };
  const rekey = (items: unknown[], idx: number) =>
    items.map((it) => {
      if (typeof it !== 'object' || it === null) return it;
      const o = { ...(it as Record<string, unknown>) };
      if (typeof o.key === 'string') o.key = `c${idx}_${o.key}`;
      if (typeof o.encounter_key === 'string') o.encounter_key = `c${idx}_${o.encounter_key}`;
      return o;
    });
  return {
    document: {
      title: first('title'), document_type: first('document_type'), report_date_as_written: first('report_date_as_written'),
      collection_date_as_written: first('collection_date_as_written'), provider_name: first('provider_name'),
      patient_name_as_written: first('patient_name_as_written'), patient_dob_as_written: first('patient_dob_as_written'),
    },
    encounters: parts.flatMap((p, i) => rekey(p.encounters, i)),
    observations: parts.flatMap((p, i) => rekey(p.observations, i)),
    medications: parts.flatMap((p, i) => rekey(p.medications, i)),
    conditions: parts.flatMap((p, i) => rekey(p.conditions, i)),
    allergies: parts.flatMap((p, i) => rekey(p.allergies, i)),
    procedures: parts.flatMap((p, i) => rekey(p.procedures, i)),
  };
}

export { chunkPages, LIMITS };
export type { Parsed };
