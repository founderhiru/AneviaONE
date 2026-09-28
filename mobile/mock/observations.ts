import type { Observation } from '../types';

/** Synthetic, fictional lab values only. Never real patient information. */
export const mockObservations: Observation[] = [
  // HbA1c series (2019 -> 2026)
  { id: 'obs-hba1c-2019', name: 'HbA1c', value: '5.4', unit: '%', date: '2019-11-11', category: 'blood', sourceDocumentId: 'doc-2019-annual', confidence: 0.97, referenceRange: '4.0 - 5.6 %' },
  { id: 'obs-hba1c-2021', name: 'HbA1c', value: '5.7', unit: '%', date: '2021-10-02', category: 'blood', sourceDocumentId: 'doc-2021-annual', confidence: 0.96, referenceRange: '4.0 - 5.6 %' },
  { id: 'obs-hba1c-2023', name: 'HbA1c', value: '6.0', unit: '%', date: '2023-09-14', category: 'blood', sourceDocumentId: 'doc-2023-annual', confidence: 0.95, referenceRange: '4.0 - 5.6 %' },
  { id: 'obs-hba1c-2024', name: 'HbA1c', value: '6.1', unit: '%', date: '2024-09-20', category: 'blood', sourceDocumentId: 'doc-2024-annual', confidence: 0.97, referenceRange: '4.0 - 5.6 %' },
  { id: 'obs-hba1c-2025', name: 'HbA1c', value: '6.1', unit: '%', date: '2025-12-18', category: 'blood', sourceDocumentId: 'doc-2025-blood', confidence: 0.98, referenceRange: '4.0 - 5.6 %' },
  { id: 'obs-hba1c-2026', name: 'HbA1c', value: '6.5', unit: '%', date: '2026-08-12', category: 'blood', sourceDocumentId: 'doc-2026-annual', confidence: 0.98, referenceRange: '4.0 - 5.6 %' },

  // Vitamin D series
  { id: 'obs-vitd-2024', name: 'Vitamin D', value: '34', unit: 'ng/mL', date: '2024-09-20', category: 'blood', sourceDocumentId: 'doc-2024-annual', confidence: 0.93, referenceRange: '30 - 100 ng/mL' },
  { id: 'obs-vitd-2025', name: 'Vitamin D', value: '31', unit: 'ng/mL', date: '2025-12-18', category: 'blood', sourceDocumentId: 'doc-2025-blood', confidence: 0.94, referenceRange: '30 - 100 ng/mL' },
  { id: 'obs-vitd-2026', name: 'Vitamin D', value: '22', unit: 'ng/mL', date: '2026-08-12', category: 'blood', sourceDocumentId: 'doc-2026-annual', confidence: 0.95, referenceRange: '30 - 100 ng/mL' },

  // Cholesterol (LDL) series
  { id: 'obs-chol-2019', name: 'LDL Cholesterol', value: '108', unit: 'mg/dL', date: '2019-11-11', category: 'blood', sourceDocumentId: 'doc-2019-annual', confidence: 0.9, referenceRange: '< 100 mg/dL' },
  { id: 'obs-chol-2021', name: 'LDL Cholesterol', value: '116', unit: 'mg/dL', date: '2021-10-02', category: 'blood', sourceDocumentId: 'doc-2021-annual', confidence: 0.9, referenceRange: '< 100 mg/dL' },
  { id: 'obs-chol-2023', name: 'LDL Cholesterol', value: '128', unit: 'mg/dL', date: '2023-09-14', category: 'blood', sourceDocumentId: 'doc-2023-annual', confidence: 0.91, referenceRange: '< 100 mg/dL' },
  { id: 'obs-chol-2024', name: 'LDL Cholesterol', value: '131', unit: 'mg/dL', date: '2024-09-20', category: 'blood', sourceDocumentId: 'doc-2024-annual', confidence: 0.92, referenceRange: '< 100 mg/dL' },
  { id: 'obs-chol-2025', name: 'LDL Cholesterol', value: '138', unit: 'mg/dL', date: '2025-12-18', category: 'blood', sourceDocumentId: 'doc-2025-blood', confidence: 0.93, referenceRange: '< 100 mg/dL' },
  { id: 'obs-chol-2026', name: 'LDL Cholesterol', value: '142', unit: 'mg/dL', date: '2026-08-12', category: 'blood', sourceDocumentId: 'doc-2026-annual', confidence: 0.94, referenceRange: '< 100 mg/dL' },

  // Blood pressure (vitals, most recent)
  { id: 'obs-bp-2026', name: 'Blood Pressure', value: '128/82', unit: 'mmHg', date: '2026-08-12', category: 'vitals', sourceDocumentId: 'doc-2026-annual', confidence: 0.96, referenceRange: '< 120/80 mmHg' },
];

export function getObservationsByIds(ids: string[] | undefined): Observation[] {
  if (!ids?.length) return [];
  const set = new Set(ids);
  return mockObservations.filter((o) => set.has(o.id));
}

export function getObservationsByName(name: string): Observation[] {
  return mockObservations
    .filter((o) => o.name === name)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
