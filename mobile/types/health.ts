/** Core domain models for the Health Memory. Kept Supabase-integration-ready:
 * every record that came from a document carries a `sourceDocumentId` so the
 * UI can always link back to evidence. */

export type Observation = {
  id: string;
  name: string; // e.g. "HbA1c"
  value: string; // keep as string to allow "6.5" or "Positive"
  unit?: string; // e.g. "%", "ng/mL"
  date: string; // ISO date
  category: 'blood' | 'vitals' | 'imaging' | 'urine' | 'other';
  sourceDocumentId?: string;
  confidence?: number; // 0-1, extraction confidence
  referenceRange?: string; // e.g. "4.0 - 5.6 %"
};

export type MedicationStatus = 'active' | 'past' | 'as_needed';

export type Medication = {
  id: string;
  name: string;
  dosage?: string; // e.g. "10 mg"
  frequency?: string; // e.g. "Once daily"
  status: MedicationStatus;
  startDate?: string;
  endDate?: string;
  prescribedBy?: string;
  sourceDocumentId?: string;
};

export type Condition = {
  id: string;
  name: string;
  status: 'active' | 'resolved' | 'monitoring';
  notedDate?: string;
  sourceDocumentId?: string;
};

export type Allergy = {
  id: string;
  substance: string;
  reaction?: string;
  severity?: 'mild' | 'moderate' | 'severe';
  sourceDocumentId?: string;
};

export type Vaccination = {
  id: string;
  name: string;
  date?: string;
  sourceDocumentId?: string;
};

export type Procedure = {
  id: string;
  name: string;
  date?: string;
  provider?: string;
  sourceDocumentId?: string;
};

export type HealthEventType =
  | 'annual_check'
  | 'consultation'
  | 'blood_test'
  | 'prescription'
  | 'imaging'
  | 'vaccination'
  | 'procedure'
  | 'other';

export type HealthEvent = {
  id: string;
  type: HealthEventType;
  title: string; // e.g. "Annual Health Check"
  date: string; // ISO date
  provider?: string;
  summary?: string; // e.g. "23 observations" or "Medication changed"
  observationIds?: string[];
  medicationIds?: string[];
  sourceDocumentId?: string;
};

export type TrendDirection = 'up' | 'down' | 'flat';

export type TrendPoint = {
  date: string;
  value: number;
  sourceDocumentId?: string;
};

export type Trend = {
  id: string;
  metricName: string; // e.g. "HbA1c"
  unit?: string;
  currentValue: number;
  direction: TrendDirection;
  points: TrendPoint[];
  /** Neutral, non-diagnostic observation, not a medical conclusion. */
  neutralSummary: string;
  referenceRange?: string;
};

export type ChangeType = 'value_change' | 'new_medication' | 'stopped_medication' | 'new_condition';

export type HealthChange = {
  id: string;
  type: ChangeType;
  metricOrItemName: string; // e.g. "HbA1c" or "Atorvastatin 10 mg"
  previousValue?: string;
  currentValue?: string;
  unit?: string;
  date: string; // date of the newer record
  comparedWithDate?: string; // date of the older record being compared against
  sourceDocumentId?: string;
  comparedSourceDocumentId?: string;
};

export type HealthProfile = {
  userId: string;
  recordCount: number;
  documentCount: number;
  activeMedicationCount: number;
  lastUpdated: string; // ISO date
};
