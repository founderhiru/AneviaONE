import type { Document } from '../types';

/**
 * Synthetic, fictional documents only. No real patient data.
 * These ids are referenced by observations/medications/changes/timeline
 * below so every fact in the mock Health Memory can point back to evidence.
 */
export const mockDocuments: Document[] = [
  {
    id: 'doc-2026-annual',
    title: 'Annual Health Check — Comprehensive Panel',
    date: '2026-08-12',
    provider: 'Sunrise Diagnostics',
    source: 'upload',
    status: 'complete',
    mimeType: 'application/pdf',
    pageCount: 4,
    observationIds: ['obs-hba1c-2026', 'obs-vitd-2026', 'obs-chol-2026', 'obs-bp-2026'],
    createdAt: '2026-08-12T09:04:00.000Z',
  },
  {
    id: 'doc-2026-consult',
    title: 'Doctor Consultation Note',
    date: '2026-06-03',
    provider: 'Dr. Meera Iyer, Internal Medicine',
    source: 'whatsapp',
    status: 'complete',
    mimeType: 'image/jpeg',
    pageCount: 1,
    observationIds: [],
    createdAt: '2026-06-03T14:22:00.000Z',
  },
  {
    id: 'doc-2025-blood',
    title: 'Blood Test — Lipid & Glucose Panel',
    date: '2025-12-18',
    provider: 'Sunrise Diagnostics',
    source: 'upload',
    status: 'complete',
    mimeType: 'application/pdf',
    pageCount: 3,
    observationIds: ['obs-hba1c-2025', 'obs-vitd-2025', 'obs-chol-2025'],
    createdAt: '2025-12-18T11:10:00.000Z',
  },
  {
    id: 'doc-2025-presc',
    title: 'Prescription — Dr. Meera Iyer',
    date: '2025-08-05',
    provider: 'Dr. Meera Iyer, Internal Medicine',
    source: 'camera',
    status: 'complete',
    mimeType: 'image/jpeg',
    pageCount: 1,
    observationIds: [],
    createdAt: '2025-08-05T16:40:00.000Z',
  },
  {
    id: 'doc-2024-annual',
    title: 'Annual Health Check — Comprehensive Panel',
    date: '2024-09-20',
    provider: 'Sunrise Diagnostics',
    source: 'upload',
    status: 'complete',
    mimeType: 'application/pdf',
    pageCount: 4,
    observationIds: ['obs-hba1c-2024', 'obs-vitd-2024', 'obs-chol-2024'],
    createdAt: '2024-09-20T10:00:00.000Z',
  },
  {
    id: 'doc-2023-annual',
    title: 'Annual Health Check',
    date: '2023-09-14',
    provider: 'Sunrise Diagnostics',
    source: 'upload',
    status: 'complete',
    mimeType: 'application/pdf',
    pageCount: 3,
    observationIds: ['obs-hba1c-2023', 'obs-chol-2023'],
    createdAt: '2023-09-14T10:00:00.000Z',
  },
  {
    id: 'doc-2021-annual',
    title: 'Annual Health Check',
    date: '2021-10-02',
    provider: 'City Care Clinic',
    source: 'upload',
    status: 'complete',
    mimeType: 'application/pdf',
    pageCount: 3,
    observationIds: ['obs-hba1c-2021', 'obs-chol-2021'],
    createdAt: '2021-10-02T10:00:00.000Z',
  },
  {
    id: 'doc-2019-annual',
    title: 'Annual Health Check',
    date: '2019-11-11',
    provider: 'City Care Clinic',
    source: 'upload',
    status: 'complete',
    mimeType: 'application/pdf',
    pageCount: 2,
    observationIds: ['obs-hba1c-2019', 'obs-chol-2019'],
    createdAt: '2019-11-11T10:00:00.000Z',
  },
];

export function getDocumentById(id: string): Document | undefined {
  return mockDocuments.find((d) => d.id === id);
}
