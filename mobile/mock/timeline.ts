import type { HealthEvent } from '../types';

export const mockTimeline: HealthEvent[] = [
  {
    id: 'evt-2026-annual',
    type: 'annual_check',
    title: 'Annual Health Check',
    date: '2026-08-12',
    provider: 'Sunrise Diagnostics',
    summary: '4 observations',
    observationIds: ['obs-hba1c-2026', 'obs-vitd-2026', 'obs-chol-2026', 'obs-bp-2026'],
    sourceDocumentId: 'doc-2026-annual',
  },
  {
    id: 'evt-2026-consult',
    type: 'consultation',
    title: 'Doctor Consultation',
    date: '2026-06-03',
    provider: 'Dr. Meera Iyer',
    summary: 'Medication reviewed',
    sourceDocumentId: 'doc-2026-consult',
  },
  {
    id: 'evt-2025-blood',
    type: 'blood_test',
    title: 'Blood Test',
    date: '2025-12-18',
    provider: 'Sunrise Diagnostics',
    summary: '3 observations',
    observationIds: ['obs-hba1c-2025', 'obs-vitd-2025', 'obs-chol-2025'],
    sourceDocumentId: 'doc-2025-blood',
  },
  {
    id: 'evt-2025-presc',
    type: 'prescription',
    title: 'Prescription',
    date: '2025-08-05',
    provider: 'Dr. Meera Iyer',
    summary: 'Metformin started',
    medicationIds: ['med-metformin'],
    sourceDocumentId: 'doc-2025-presc',
  },
  {
    id: 'evt-2024-annual',
    type: 'annual_check',
    title: 'Annual Health Check',
    date: '2024-09-20',
    provider: 'Sunrise Diagnostics',
    summary: '3 observations',
    observationIds: ['obs-hba1c-2024', 'obs-vitd-2024', 'obs-chol-2024'],
    sourceDocumentId: 'doc-2024-annual',
  },
  {
    id: 'evt-2023-annual',
    type: 'annual_check',
    title: 'Annual Health Check',
    date: '2023-09-14',
    provider: 'Sunrise Diagnostics',
    summary: '2 observations',
    observationIds: ['obs-hba1c-2023', 'obs-chol-2023'],
    sourceDocumentId: 'doc-2023-annual',
  },
  {
    id: 'evt-2021-annual',
    type: 'annual_check',
    title: 'Annual Health Check',
    date: '2021-10-02',
    provider: 'City Care Clinic',
    summary: '2 observations',
    observationIds: ['obs-hba1c-2021', 'obs-chol-2021'],
    sourceDocumentId: 'doc-2021-annual',
  },
  {
    id: 'evt-2019-annual',
    type: 'annual_check',
    title: 'Annual Health Check',
    date: '2019-11-11',
    provider: 'City Care Clinic',
    summary: '2 observations',
    observationIds: ['obs-hba1c-2019', 'obs-chol-2019'],
    sourceDocumentId: 'doc-2019-annual',
  },
];

/** Groups timeline events by year for section-list style rendering. */
export function groupTimelineByYear(events: HealthEvent[]): Array<{ year: string; events: HealthEvent[] }> {
  const sorted = [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const byYear = new Map<string, HealthEvent[]>();
  for (const e of sorted) {
    const year = e.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(e);
  }
  return Array.from(byYear.entries()).map(([year, events]) => ({ year, events }));
}

export function getEventById(id: string): HealthEvent | undefined {
  return mockTimeline.find((e) => e.id === id);
}
