import { isDemoMode } from '../../config/appMode';
import type {
  Allergy,
  Condition,
  HealthChange,
  HealthEvent,
  HealthProfile,
  Medication,
  Observation,
  Procedure,
  RecordedObservation,
  Trend,
  Vaccination,
} from '../../types';
import { loadDemoServices } from '../demo/demoServices';
import {
  getSnapshot,
  metricKey,
  toAllergy,
  toChange,
  toCondition,
  toEvent,
  toMedication,
  toProcedure,
  toTrend,
  toVaccination,
} from './healthMemoryApi';
import { documentsService } from '../documents/documentsService';
import { ServiceError, toServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';

/**
 * Health data service boundary. Every method is `async` so screens handle
 * loading states. Production reads trusted records only: test results
 * directly from RLS-protected views, and Health Memory / Timeline / Trends /
 * What Changed from the deterministic `health-memory` Edge Function (Gate 2).
 */
export interface HealthService {
  getHealthProfile(): Promise<HealthProfile>;
  /** Years that have at least one record, oldest first (Home's health story). */
  getHealthStoryYears(): Promise<string[]>;
  getWhatChanged(): Promise<HealthChange[]>;
  getTimeline(): Promise<HealthEvent[]>;
  getEventById(id: string): Promise<HealthEvent | undefined>;
  getTrends(): Promise<Trend[]>;
  getTrendById(id: string): Promise<Trend | undefined>;
  getTrendByMetricName(metricName: string): Promise<Trend | undefined>;
  getMedications(): Promise<Medication[]>;
  getConditions(): Promise<Condition[]>;
  getAllergies(): Promise<Allergy[]>;
  getVaccinations(): Promise<Vaccination[]>;
  getProcedures(): Promise<Procedure[]>;
  /** Test results behind a timeline event (trusted records only). */
  getEventObservations(event: HealthEvent): Promise<Observation[]>;
  /** Test results read from the person's own reports, newest first. */
  getRecordedObservations(): Promise<RecordedObservation[]>;
  /** Test results read from one stored document, in page order. */
  getDocumentObservations(documentId: string): Promise<RecordedObservation[]>;
}

type ObservationRow = {
  id: string;
  name_as_written: string;
  value_as_written: string;
  unit_as_written: string | null;
  reference_range_as_written: string | null;
  effective_date: string | null;
  confidence_gate: 'passed' | 'needs_review';
  review_status: string;
  document_id: string | null;
  document_page_id: string | null;
  created_at: string;
};

const OBSERVATION_COLUMNS =
  'id, name_as_written, value_as_written, unit_as_written, reference_range_as_written, effective_date, confidence_gate, review_status, document_id, document_page_id, created_at';

const LOAD_ERROR = { code: 'unknown' as const, userMessage: 'We couldn’t load your test results. Please try again.', retryable: true };

/**
 * Reads observations through RLS-protected views/tables only:
 *   - `current_observations` for Health Memory (live, gate passed or confirmed);
 *   - `observations` (own rows, superseded excluded) for one document's page,
 *     which also lists results still held for review — marked as such.
 * Each row is joined to its stored document name and page number so every
 * value can be traced back to its source.
 */
async function loadObservations(filter: { documentId?: string }): Promise<RecordedObservation[]> {
  const client = getSupabaseClient();
  if (!client) throw new ServiceError('not_configured', 'Your Health Memory isn’t available right now.');
  let query = filter.documentId
    ? client.from('observations').select(OBSERVATION_COLUMNS).eq('document_id', filter.documentId).is('superseded_at', null).neq('review_status', 'rejected')
    : client.from('current_observations').select(OBSERVATION_COLUMNS);
  query = query.order('effective_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(500);
  const { data, error } = await query;
  if (error) throw toServiceError(error, LOAD_ERROR);
  const rows = (data ?? []) as ObservationRow[];
  if (rows.length === 0) return [];

  const documentIds = [...new Set(rows.map((r) => r.document_id).filter((id): id is string => Boolean(id)))];
  const pageIds = [...new Set(rows.map((r) => r.document_page_id).filter((id): id is string => Boolean(id)))];
  const [docs, pages] = await Promise.all([
    documentIds.length ? client.from('documents').select('id, original_filename').in('id', documentIds) : { data: [], error: null },
    pageIds.length ? client.from('document_pages').select('id, page_number').in('id', pageIds) : { data: [], error: null },
  ]);
  if (docs.error) throw toServiceError(docs.error, LOAD_ERROR);
  if (pages.error) throw toServiceError(pages.error, LOAD_ERROR);
  const names = new Map((docs.data as { id: string; original_filename: string }[]).map((d) => [d.id, d.original_filename]));
  const pageNumbers = new Map((pages.data as { id: string; page_number: number }[]).map((p) => [p.id, p.page_number]));

  const results = rows
    .filter((r) => r.document_id)
    .map((r) => ({
      id: r.id,
      name: r.name_as_written,
      value: r.value_as_written,
      unit: r.unit_as_written,
      referenceRange: r.reference_range_as_written,
      date: r.effective_date,
      needsReview: r.confidence_gate === 'needs_review' && r.review_status !== 'confirmed',
      source: {
        documentId: r.document_id as string,
        documentName: names.get(r.document_id as string) ?? 'Your report',
        pageNumber: r.document_page_id ? (pageNumbers.get(r.document_page_id) ?? null) : null,
      },
    }));
  if (filter.documentId) results.sort((a, b) => (a.source.pageNumber ?? 0) - (b.source.pageNumber ?? 0));
  return results;
}

/**
 * PRODUCTION. Everything comes from the person's own trusted records; an
 * account with no records gets empty lists and the screens' empty states.
 * Nothing is ever substituted from the sample dataset.
 */
export const productionHealthService: HealthService = {
  async getHealthProfile() {
    const [documents, snapshot] = await Promise.all([documentsService.listDocuments(), getSnapshot()]);
    const latest = documents[0]?.uploadedAt ?? documents[0]?.createdAt;
    return {
      userId: documents[0]?.userId ?? '',
      recordCount: snapshot.memory.counts.records,
      documentCount: documents.length,
      // Reports rarely state whether a medicine is still taken, so none is called "active".
      activeMedicationCount: 0,
      lastUpdated: latest ?? new Date(0).toISOString(),
    };
  },
  async getHealthStoryYears() {
    const { timeline } = await getSnapshot();
    return [...new Set(timeline.map((e) => e.date?.slice(0, 4)).filter((y): y is string => Boolean(y)))].sort();
  },
  getWhatChanged: async () => (await getSnapshot()).changes.changes.map(toChange),
  getTimeline: async () => (await getSnapshot()).timeline.map(toEvent),
  getEventById: async (id) => (await getSnapshot()).timeline.map(toEvent).find((e) => e.id === id),
  getTrends: async () => (await getSnapshot()).trends.map(toTrend),
  getTrendById: async (id) => (await getSnapshot()).trends.map(toTrend).find((t) => t.id === id),
  async getTrendByMetricName(metricName) {
    const key = metricKey(metricName);
    // Newest series first; other units of the same test are listed on it, not merged.
    const match = (await getSnapshot()).trends.find((t) => t.nameKey === key);
    return match ? toTrend(match) : undefined;
  },
  getMedications: async () => (await getSnapshot()).memory.medications.map(toMedication),
  getConditions: async () => (await getSnapshot()).memory.conditions.map(toCondition),
  getAllergies: async () => (await getSnapshot()).memory.allergies.map(toAllergy),
  getVaccinations: async () => (await getSnapshot()).memory.vaccinations.map(toVaccination),
  getProcedures: async () => (await getSnapshot()).memory.procedures.map(toProcedure),
  async getEventObservations(event) {
    if (!event.sourceDocumentId) return [];
    const ids = new Set(event.observationIds ?? []);
    const results = await loadObservations({ documentId: event.sourceDocumentId });
    return results
      .filter((r) => !r.needsReview && (ids.size === 0 || ids.has(r.id)))
      .map((r) => ({
        id: r.id,
        name: r.name,
        value: r.value,
        unit: r.unit ?? undefined,
        date: r.date ?? '',
        category: 'other' as const,
        sourceDocumentId: r.source.documentId,
        referenceRange: r.referenceRange ?? undefined,
      }));
  },
  getRecordedObservations: () => loadObservations({}),
  getDocumentObservations: (documentId) => loadObservations({ documentId }),
};

export const healthService: HealthService = isDemoMode ? loadDemoServices().health : productionHealthService;
