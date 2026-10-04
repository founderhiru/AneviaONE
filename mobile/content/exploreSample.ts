/**
 * EXPLORE SAMPLE — the fictional health history behind "Explore AneviaONE".
 *
 * Static, read-only, bundled with the app. It belongs to no one: every record,
 * value and provider below is invented to illustrate the product. It is never
 * written to Supabase, never mixed with a signed-in person's Health Memory, and
 * never sent to an AI provider — nothing here imports a service.
 *
 * Kept separate from `mock/` (which backs the opt-in demo *build*, see
 * `config/appMode.ts`): Explore is available in production to anyone who
 * hasn't signed in yet.
 *
 * Values are illustrative only — not medical advice, diagnosis or real results.
 * Derived figures (summary, connections, timeline) are computed from this
 * data, so replacing it later (e.g. with a richer sample, or real
 * intelligence) needs no screen changes.
 */

export type SampleAreaId = 'metabolic' | 'heart' | 'vitamins' | 'medications';

export type SampleArea = { id: SampleAreaId; label: string };

export type SampleRecordKind = 'blood_test' | 'health_check' | 'prescription' | 'consultation';

export type SampleRecord = {
  id: string;
  kind: SampleRecordKind;
  title: string;
  /** ISO date. */
  date: string;
  /** Fictional provider. */
  provider: string;
  areas: SampleAreaId[];
  /** Ids of the markers this record contains. */
  markerIds: SampleMarkerId[];
  summary: string;
  /** A record this one follows on from that isn't linked by a shared marker. */
  followsRecordId?: string;
};

export type SampleMarkerId = 'vitamin_d' | 'hba1c' | 'ldl';

/** Sample labels only — illustrative, not a clinical assessment. */
export type SampleChangeLabel = 'Improved' | 'Stable' | 'Changed';

export type SampleMarker = {
  id: SampleMarkerId;
  name: string;
  unit: string;
  area: SampleAreaId;
  change: SampleChangeLabel;
  readings: { recordId: string; value: number }[];
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const SAMPLE_AREAS: readonly SampleArea[] = deepFreeze([
  { id: 'metabolic', label: 'Metabolic' },
  { id: 'heart', label: 'Heart' },
  { id: 'vitamins', label: 'Vitamins' },
  { id: 'medications', label: 'Medications' },
]);

/** Newest first. */
export const SAMPLE_RECORDS: readonly SampleRecord[] = deepFreeze<SampleRecord[]>([
  {
    id: 'sample-r12',
    kind: 'blood_test',
    title: 'Blood Test',
    date: '2026-03-12',
    provider: 'Sample Diagnostics Lab',
    areas: ['metabolic', 'heart', 'vitamins'],
    markerIds: ['hba1c', 'ldl', 'vitamin_d'],
    summary: 'HbA1c, lipid profile and Vitamin D',
  },
  {
    id: 'sample-r11',
    kind: 'health_check',
    title: 'Annual Health Check',
    date: '2025-11-18',
    provider: 'Sample City Clinic',
    areas: ['metabolic', 'heart'],
    markerIds: ['hba1c', 'ldl'],
    summary: 'Full check-up with blood panel',
  },
  {
    id: 'sample-r10',
    kind: 'blood_test',
    title: 'Vitamin D Test',
    date: '2025-08-04',
    provider: 'Sample Diagnostics Lab',
    areas: ['vitamins'],
    markerIds: ['vitamin_d'],
    summary: 'Vitamin D (25-OH)',
  },
  {
    id: 'sample-r09',
    kind: 'prescription',
    title: 'Prescription',
    date: '2025-06-21',
    provider: 'Sample City Clinic',
    areas: ['medications', 'vitamins'],
    markerIds: [],
    summary: 'Vitamin D3 supplement',
    followsRecordId: 'sample-r08',
  },
  {
    id: 'sample-r08',
    kind: 'consultation',
    title: 'GP Consultation',
    date: '2025-02-10',
    provider: 'Sample City Clinic',
    areas: ['vitamins'],
    markerIds: [],
    summary: 'Review of recent blood results',
    followsRecordId: 'sample-r06',
  },
  {
    id: 'sample-r07',
    kind: 'blood_test',
    title: 'Lipid Profile',
    date: '2024-11-05',
    provider: 'Sample Diagnostics Lab',
    areas: ['heart'],
    markerIds: ['ldl'],
    summary: 'Cholesterol panel',
  },
  {
    id: 'sample-r06',
    kind: 'blood_test',
    title: 'Blood Test',
    date: '2024-08-19',
    provider: 'Sample Diagnostics Lab',
    areas: ['metabolic', 'vitamins'],
    markerIds: ['hba1c', 'vitamin_d'],
    summary: 'HbA1c and Vitamin D',
  },
  {
    id: 'sample-r05',
    kind: 'prescription',
    title: 'Prescription',
    date: '2024-05-20',
    provider: 'Sample City Clinic',
    areas: ['medications'],
    markerIds: [],
    summary: 'Seasonal allergy relief',
  },
  {
    id: 'sample-r04',
    kind: 'health_check',
    title: 'Annual Health Check',
    date: '2024-01-16',
    provider: 'Sample City Clinic',
    areas: ['metabolic', 'heart'],
    markerIds: ['hba1c', 'ldl'],
    summary: 'Full check-up with blood panel',
  },
  {
    id: 'sample-r03',
    kind: 'blood_test',
    title: 'Vitamin D Test',
    date: '2023-10-02',
    provider: 'Sample Diagnostics Lab',
    areas: ['vitamins'],
    markerIds: ['vitamin_d'],
    summary: 'Vitamin D (25-OH)',
  },
  {
    id: 'sample-r02',
    kind: 'consultation',
    title: 'GP Consultation',
    date: '2023-07-11',
    provider: 'Sample City Clinic',
    areas: ['heart'],
    markerIds: [],
    summary: 'Routine blood pressure check',
  },
  {
    id: 'sample-r01',
    kind: 'health_check',
    title: 'Annual Health Check',
    date: '2023-04-08',
    provider: 'Sample City Clinic',
    areas: ['metabolic', 'heart', 'vitamins'],
    markerIds: ['hba1c', 'ldl', 'vitamin_d'],
    summary: 'First record in this history',
  },
]);

/** Oldest reading first. */
export const SAMPLE_MARKERS: readonly SampleMarker[] = deepFreeze<SampleMarker[]>([
  {
    id: 'vitamin_d',
    name: 'Vitamin D',
    unit: 'ng/mL',
    area: 'vitamins',
    change: 'Improved',
    readings: [
      { recordId: 'sample-r01', value: 19 },
      { recordId: 'sample-r03', value: 21 },
      { recordId: 'sample-r06', value: 18 },
      { recordId: 'sample-r10', value: 24 },
      { recordId: 'sample-r12', value: 34 },
    ],
  },
  {
    id: 'hba1c',
    name: 'HbA1c',
    unit: '%',
    area: 'metabolic',
    change: 'Stable',
    readings: [
      { recordId: 'sample-r01', value: 5.6 },
      { recordId: 'sample-r04', value: 5.7 },
      { recordId: 'sample-r06', value: 5.6 },
      { recordId: 'sample-r11', value: 5.7 },
      { recordId: 'sample-r12', value: 5.6 },
    ],
  },
  {
    id: 'ldl',
    name: 'LDL',
    unit: 'mg/dL',
    area: 'heart',
    change: 'Changed',
    readings: [
      { recordId: 'sample-r01', value: 102 },
      { recordId: 'sample-r04', value: 108 },
      { recordId: 'sample-r07', value: 115 },
      { recordId: 'sample-r11', value: 121 },
      { recordId: 'sample-r12', value: 128 },
    ],
  },
]);

/** Example questions for the Ask My Health preview. No answers are generated. */
export const SAMPLE_QUESTIONS: readonly string[] = deepFreeze([
  'What changed in my recent blood tests?',
  'Show me my health history over time.',
  'When was my last health check?',
]);

// ── Derived views ──────────────────────────────────────────────────────────

const recordsById = new Map(SAMPLE_RECORDS.map((r) => [r.id, r]));
const markersById = new Map(SAMPLE_MARKERS.map((m) => [m.id, m]));

export function sampleRecord(id: string): SampleRecord | undefined {
  return recordsById.get(id);
}

export function sampleMarker(id: SampleMarkerId): SampleMarker | undefined {
  return markersById.get(id);
}

export function sampleArea(id: SampleAreaId): SampleArea {
  return SAMPLE_AREAS.find((a) => a.id === id) as SampleArea;
}

/** "12 Records · 4 Health Areas · 3 Years", computed from the sample. */
export function sampleSummary(): { records: number; areas: number; years: number } {
  const times = SAMPLE_RECORDS.map((r) => Date.parse(r.date));
  const spanYears = (Math.max(...times) - Math.min(...times)) / (365.25 * 24 * 3600 * 1000);
  return {
    records: SAMPLE_RECORDS.length,
    areas: new Set(SAMPLE_RECORDS.flatMap((r) => r.areas)).size,
    years: Math.max(1, Math.round(spanYears)),
  };
}

export function recordsInArea(id: SampleAreaId): number {
  return SAMPLE_RECORDS.filter((r) => r.areas.includes(id)).length;
}

export type SampleConnection = { record: SampleRecord; via: string };

/**
 * What a record connects back to: for each marker it contains, the previous
 * record with that marker ("HbA1c, LDL"); plus the record it follows on from.
 */
export function sampleConnections(recordId: string): SampleConnection[] {
  const record = recordsById.get(recordId);
  if (!record) return [];
  const byRecord = new Map<string, string[]>();
  for (const markerId of record.markerIds) {
    const readings = markersById.get(markerId)?.readings ?? [];
    const index = readings.findIndex((r) => r.recordId === recordId);
    const previous = index > 0 ? readings[index - 1] : undefined;
    if (!previous) continue;
    const names = byRecord.get(previous.recordId) ?? [];
    names.push(markersById.get(markerId)!.name);
    byRecord.set(previous.recordId, names);
  }
  const connections: SampleConnection[] = [...byRecord].map(([id, names]) => ({
    record: recordsById.get(id)!,
    via: names.join(', '),
  }));
  if (record.followsRecordId && !byRecord.has(record.followsRecordId)) {
    const followed = recordsById.get(record.followsRecordId);
    if (followed) connections.push({ record: followed, via: 'Follow-up' });
  }
  return connections;
}

/** Records grouped by calendar year, newest year first. */
export function sampleTimeline(): { year: number; records: SampleRecord[] }[] {
  const years = new Map<number, SampleRecord[]>();
  for (const record of SAMPLE_RECORDS) {
    const year = Number(record.date.slice(0, 4));
    years.set(year, [...(years.get(year) ?? []), record]);
  }
  return [...years].sort(([a], [b]) => b - a).map(([year, records]) => ({ year, records }));
}

/** Latest reading and the one before it, for a What Changed card. */
export function latestChange(marker: SampleMarker): {
  previous: { value: number; date: string };
  latest: { value: number; date: string };
} {
  const [prev, last] = marker.readings.slice(-2);
  return {
    previous: { value: prev.value, date: recordsById.get(prev.recordId)!.date },
    latest: { value: last.value, date: recordsById.get(last.recordId)!.date },
  };
}

/** "12 Mar 2026". Fixed format so it reads the same on every device. */
export function formatSampleDate(iso: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = iso.split('-');
  return `${d} ${months[Number(m) - 1]} ${y}`;
}
