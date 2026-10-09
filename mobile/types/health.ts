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

/** 'recorded': listed on a report without a stated status. */
export type MedicationStatus = 'active' | 'past' | 'as_needed' | 'recorded';

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
  status: 'active' | 'resolved' | 'monitoring' | 'unknown';
  /** How the report states it (a family history is never 'diagnosed'). */
  assertion?: 'mentioned' | 'reported' | 'diagnosed';
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
  | 'report'
  | 'encounter'
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
  /** ISO date; null when no date is recorded (never invented). */
  date: string | null;
  provider?: string;
  summary?: string; // e.g. "23 observations" or "Medication changed"
  observationIds?: string[];
  medicationIds?: string[];
  sourceDocumentId?: string;
};

/** 'mixed': values went up and down; 'insufficient': fewer than two measurements. */
export type TrendDirection = 'up' | 'down' | 'flat' | 'mixed' | 'insufficient';

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
  /** The same test recorded in other units — shown separately, never converted. */
  otherUnits?: string[];
};

export type ChangeType =
  | 'value_change'
  | 'new_medication'
  | 'stopped_medication'
  | 'medication_not_in_latest'
  | 'new_condition'
  | 'new_allergy'
  | 'new_procedure'
  | 'new_immunization'
  | 'new_encounter';

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
  /** Neutral sentence describing the change (from records, never a judgement). */
  summary?: string;
};

export type HealthProfile = {
  userId: string;
  recordCount: number;
  documentCount: number;
  activeMedicationCount: number;
  lastUpdated: string; // ISO date
};

/**
 * A test result read from one of the person's own reports (Gate 1). Raw
 * values are shown exactly as printed; `source` always points back to the
 * stored original and the page the value was read from.
 */
export type RecordedObservation = {
  id: string;
  name: string;
  /** As printed on the report, e.g. "5.8" or "<0.5". */
  value: string;
  unit: string | null;
  referenceRange: string | null;
  /** ISO date; null when the report's date couldn't be read unambiguously. */
  date: string | null;
  /** Read with lower confidence or ambiguity — not yet used for trends. */
  needsReview: boolean;
  /** The value as a plain number, when it is one ("<0.5" and "Nil" are not). */
  valueNumeric?: number | null;
  /** Bounds of the range printed on the report, parsed by the server. */
  referenceLow?: number | null;
  referenceHigh?: number | null;
  /** The kind of result as classified when the report was read. */
  category?: string | null;
  /** A flag printed next to the result on the report (e.g. "H"), as written. */
  abnormalFlag?: string | null;
  source: { documentId: string; documentName: string; pageNumber: number | null };
};
