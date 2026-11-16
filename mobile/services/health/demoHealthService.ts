import { getActiveSubjectId, isOtherDemoPerson } from '../people/activeSubject';
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
import { demoMedicationStore } from './demoMedicationStore';
import { mockAllergies, mockConditions, mockMedications, mockProcedures, mockVaccinations } from '../../mock/medications';
import type { HealthService } from './healthService';

/** DEMO ONLY: the real backend parses a report's printed range into bounds; the sample data
 * has only the printed text, so read the two simple shapes it uses ("4.0 - 5.6 %", "< 100 mg/dL"). */
function demoBounds(value: string, range?: string | null): Pick<RecordedObservation, 'valueNumeric' | 'referenceLow' | 'referenceHigh'> {
  const n = Number(value);
  const valueNumeric = value.trim() !== '' && Number.isFinite(n) ? n : null;
  const between = range?.match(/^\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (between) return { valueNumeric, referenceLow: Number(between[1]), referenceHigh: Number(between[2]) };
  const under = range?.match(/^\s*<\s*(\d+(?:\.\d+)?)/);
  if (under) return { valueNumeric, referenceLow: null, referenceHigh: Number(under[1]) };
  const over = range?.match(/^\s*>\s*(\d+(?:\.\d+)?)/);
  if (over) return { valueNumeric, referenceLow: Number(over[1]), referenceHigh: null };
  return { valueNumeric, referenceLow: null, referenceHigh: null };
}

function toRecorded(o: Observation): RecordedObservation {
  return {
    id: o.id,
    name: o.name,
    value: o.value,
    unit: o.unit ?? null,
    referenceRange: o.referenceRange ?? null,
    date: o.date,
    needsReview: false,
    ...demoBounds(o.value, o.referenceRange),
    category: o.category,
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
  // The sample list, plus any medicine typed in during this session.
  getMedications: () => delay([...mockMedications, ...demoMedicationStore.list()]),
  getConditions: () => delay(mockConditions),
  getAllergies: () => delay(mockAllergies),
  getVaccinations: () => delay(mockVaccinations),
  getProcedures: () => delay(mockProcedures),
  getEventObservations: (event) => delay(getObservationsByIds(event.observationIds)),
  // The sample health records belong to "Me"; the demo family (EXPO_PUBLIC_DEMO_FAMILY) has none yet.
  getRecordedObservations: (subjectId) => delay(isOtherDemoPerson(subjectId ?? getActiveSubjectId()) ? [] : [...mockObservations].sort((a, b) => b.date.localeCompare(a.date)).map(toRecorded)),
  getDocumentObservations: (documentId) => delay(mockObservations.filter((o) => o.sourceDocumentId === documentId).map(toRecorded)),
};
