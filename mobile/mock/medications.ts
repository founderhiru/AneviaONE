import type { Allergy, Condition, Medication, Procedure, Vaccination } from '../types';

export const mockMedications: Medication[] = [
  {
    id: 'med-atorvastatin',
    name: 'Atorvastatin',
    dosage: '10 mg',
    frequency: 'Once daily, at night',
    status: 'active',
    startDate: '2026-08-14',
    prescribedBy: 'Dr. Meera Iyer',
    sourceDocumentId: 'doc-2026-annual',
  },
  {
    id: 'med-metformin',
    name: 'Metformin',
    dosage: '500 mg',
    frequency: 'Twice daily, with meals',
    status: 'active',
    startDate: '2025-08-05',
    prescribedBy: 'Dr. Meera Iyer',
    sourceDocumentId: 'doc-2025-presc',
  },
  {
    id: 'med-vitd3',
    name: 'Vitamin D3',
    dosage: '60,000 IU',
    frequency: 'Once weekly',
    status: 'active',
    startDate: '2026-08-14',
    prescribedBy: 'Dr. Meera Iyer',
    sourceDocumentId: 'doc-2026-annual',
  },
  {
    id: 'med-azithromycin',
    name: 'Azithromycin',
    dosage: '500 mg',
    frequency: 'Once daily for 3 days',
    status: 'past',
    startDate: '2024-03-02',
    endDate: '2024-03-05',
    prescribedBy: 'Dr. Rohan Nair',
    sourceDocumentId: 'doc-2024-annual',
  },
];

export const mockConditions: Condition[] = [
  { id: 'cond-prediabetes', name: 'Pre-diabetes (monitoring)', status: 'monitoring', notedDate: '2024-09-20', sourceDocumentId: 'doc-2024-annual' },
];

export const mockAllergies: Allergy[] = [
  { id: 'allergy-penicillin', substance: 'Penicillin', reaction: 'Skin rash', severity: 'moderate', sourceDocumentId: 'doc-2021-annual' },
];

export const mockVaccinations: Vaccination[] = [
  { id: 'vax-covid-booster', name: 'COVID-19 Booster', date: '2023-01-15', sourceDocumentId: 'doc-2023-annual' },
  { id: 'vax-influenza', name: 'Influenza (Annual)', date: '2025-11-02' },
];

export const mockProcedures: Procedure[] = [
  { id: 'proc-endoscopy', name: 'Upper GI Endoscopy', date: '2022-05-19', provider: 'City Care Clinic' },
];
