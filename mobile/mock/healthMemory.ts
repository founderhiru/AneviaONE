import type { HealthProfile, Trend, TrendDirection } from '../types';
import { mockDocuments } from './documents';
import { getObservationsByName } from './observations';
import { mockMedications } from './medications';

function directionFor(points: { value: number }[]): TrendDirection {
  if (points.length < 2) return 'flat';
  const diff = points[points.length - 1].value - points[0].value;
  if (Math.abs(diff) < 0.01) return 'flat';
  return diff > 0 ? 'up' : 'down';
}

function buildTrend(id: string, metricName: string, neutralSummary: string): Trend {
  const obs = getObservationsByName(metricName);
  const points = obs.map((o) => ({ date: o.date, value: parseFloat(o.value), sourceDocumentId: o.sourceDocumentId }));
  const latest = obs[obs.length - 1];
  return {
    id,
    metricName,
    unit: latest?.unit,
    currentValue: parseFloat(latest?.value ?? '0'),
    direction: directionFor(points),
    points,
    neutralSummary,
    referenceRange: latest?.referenceRange,
  };
}

export const mockTrends: Trend[] = [
  buildTrend(
    'trend-hba1c',
    'HbA1c',
    'Your records show an increase compared with earlier measurements.'
  ),
  buildTrend(
    'trend-vitd',
    'Vitamin D',
    'Your most recent reading is lower than your last two measurements.'
  ),
  buildTrend(
    'trend-chol',
    'LDL Cholesterol',
    'Your records show a gradual increase over the past several years.'
  ),
];

export function getTrendById(id: string): Trend | undefined {
  return mockTrends.find((t) => t.id === id);
}

export function getTrendByMetricName(metricName: string): Trend | undefined {
  return mockTrends.find((t) => t.metricName === metricName);
}

export const mockHealthProfile: HealthProfile = {
  userId: 'user-mock-1',
  recordCount: 124,
  documentCount: mockDocuments.length,
  activeMedicationCount: mockMedications.filter((m) => m.status === 'active').length,
  lastUpdated: '2026-08-12',
};

/** Year markers for the "Your Health Story" compact timeline strip on Home. */
export const healthStoryYears = ['2019', '2021', '2023', '2025', '2026'];
