import type { HealthChange } from '../types';

/**
 * "What Changed" is computed from comparing the two most recent records for
 * each metric/item in a real system. Here it is precomputed and synthetic.
 * Language stays neutral — no diagnosis, no treatment recommendation.
 */
export const mockChanges: HealthChange[] = [
  {
    id: 'change-hba1c',
    type: 'value_change',
    metricOrItemName: 'HbA1c',
    previousValue: '6.1',
    currentValue: '6.5',
    unit: '%',
    date: '2026-08-12',
    comparedWithDate: '2025-12-18',
    sourceDocumentId: 'doc-2026-annual',
    comparedSourceDocumentId: 'doc-2025-blood',
  },
  {
    id: 'change-vitd',
    type: 'value_change',
    metricOrItemName: 'Vitamin D',
    previousValue: '31',
    currentValue: '22',
    unit: 'ng/mL',
    date: '2026-08-12',
    comparedWithDate: '2025-12-18',
    sourceDocumentId: 'doc-2026-annual',
    comparedSourceDocumentId: 'doc-2025-blood',
  },
  {
    id: 'change-atorvastatin',
    type: 'new_medication',
    metricOrItemName: 'Atorvastatin 10 mg',
    date: '2026-08-14',
    sourceDocumentId: 'doc-2026-annual',
  },
];
