import {
  mockChanges,
  mockHealthProfile,
  mockTimeline,
  mockTrends,
  getTrendById as mockGetTrendById,
  getTrendByMetricName as mockGetTrendByMetricName,
  getEventById as mockGetEventById,
} from '../../mock';
import { mockAllergies, mockConditions, mockMedications, mockProcedures, mockVaccinations } from '../../mock/medications';
import type {
  Allergy,
  Condition,
  HealthChange,
  HealthEvent,
  HealthProfile,
  Medication,
  Procedure,
  Trend,
  Vaccination,
} from '../../types';

/**
 * Health data service boundary. Every method is `async` even though the
 * mock implementation resolves immediately, so screens already handle
 * loading states correctly and a real Supabase-backed implementation can
 * be dropped in later without touching any screen.
 */
export interface HealthService {
  getHealthProfile(): Promise<HealthProfile>;
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
}

const NETWORK_DELAY_MS = 350;
const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), NETWORK_DELAY_MS));

export const healthService: HealthService = {
  getHealthProfile: () => delay(mockHealthProfile),
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
};
