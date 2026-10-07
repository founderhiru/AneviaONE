/**
 * DEMO MODE ONLY. Loaded exclusively through services/demo/demoServices.ts,
 * so production builds never bundle the fictional sample dataset.
 */
import {
  healthStoryYears as sampleHealthStoryYears,
  mockChanges,
  mockHealthProfile,
  mockTimeline,
  mockTrends,
  getTrendById as mockGetTrendById,
  getTrendByMetricName as mockGetTrendByMetricName,
  getEventById as mockGetEventById,
} from '../../mock';
import { getObservationsByIds, mockObservations } from '../../mock/observations';
import { getDocumentById } from '../../mock/documents';
import type { Observation, RecordedObservation } from '../../types';
import { mockAllergies, mockConditions, mockMedications, mockProcedures, mockVaccinations } from '../../mock/medications';
import type { HealthService } from './healthService';

function toRecorded(o: Observation): RecordedObservation {
  return {
    id: o.id,
    name: o.name,
    value: o.value,
    unit: o.unit ?? null,
    referenceRange: o.referenceRange ?? null,
    date: o.date,
    needsReview: false,
    source: { documentId: o.sourceDocumentId ?? '', documentName: getDocumentById(o.sourceDocumentId ?? '')?.title ?? 'Sample report', pageNumber: null },
  };
}

const NETWORK_DELAY_MS = 350;
const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), NETWORK_DELAY_MS));

/** DEMO MODE ONLY — the fictional sample Health Memory (no real patient data). */
export const demoHealthService: HealthService = {
  getHealthProfile: () => delay(mockHealthProfile),
  getHealthStoryYears: () => delay(sampleHealthStoryYears),
  getWhatChanged: () => delay(mockChanges),
  getTimeline: () => delay(mockTimeline),
  getEventById: (id) => delay(mockGetEventById(id)),
  getTrends: () => delay(mockTrends),
  getTrendById: (id) => delay(mockGetTrendById(id)),
  getTrendByMetricName: (metricName) => delay(mockGetTrendByMetricName(metricName)),
  getMedications: () => delay(mockMedications),
  getConditions: () => delay(mockConditions),
  getAllergies: () => delay(mockAllergies),
  getVaccinations: () => delay(mockVaccinations),
  getProcedures: () => delay(mockProcedures),
  getEventObservations: (event) => delay(getObservationsByIds(event.observationIds)),
  getRecordedObservations: () => delay([...mockObservations].sort((a, b) => b.date.localeCompare(a.date)).map(toRecorded)),
  getDocumentObservations: (documentId) => delay(mockObservations.filter((o) => o.sourceDocumentId === documentId).map(toRecorded)),
};
