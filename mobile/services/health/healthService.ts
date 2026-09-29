import { isDemoMode } from '../../config/appMode';
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
import { documentsService } from '../documents/documentsService';

/**
 * Health data service boundary. Every method is `async` so screens handle
 * loading states, and the real Supabase-backed implementation (Phase 2:
 * observations, insights, health_events — see docs/BACKEND_CONTRACTS.md)
 * can replace `productionHealthService` without touching any screen.
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
};

/**
 * PRODUCTION (Phase 1). No health facts exist yet — reports are stored but
 * not read until Phase 2 — so every health list is honestly empty and the
 * screens show their empty states. Nothing is ever substituted from the
 * sample dataset. The only real number available now is the document count.
 */
export const productionHealthService: HealthService = {
  async getHealthProfile() {
    const documents = await documentsService.listDocuments();
    const latest = documents[0]?.uploadedAt ?? documents[0]?.createdAt;
    return {
      userId: documents[0]?.userId ?? '',
      recordCount: 0,
      documentCount: documents.length,
      activeMedicationCount: 0,
      lastUpdated: latest ?? new Date(0).toISOString(),
    };
  },
  getHealthStoryYears: async () => [],
  getWhatChanged: async () => [],
  getTimeline: async () => [],
  getEventById: async () => undefined,
  getTrends: async () => [],
  getTrendById: async () => undefined,
  getTrendByMetricName: async () => undefined,
  getMedications: async () => [],
  getConditions: async () => [],
  getAllergies: async () => [],
  getVaccinations: async () => [],
  getProcedures: async () => [],
};

export const healthService: HealthService = isDemoMode ? demoHealthService : productionHealthService;
