/**
 * SAMPLE DATA — illustrative only.
 *
 * Every chart, change and answer on the marketing site is drawn from this one
 * file so the numbers stay consistent everywhere. None of it is real user
 * data, and the UI labels it as a sample wherever it appears.
 */

export type SeriesPoint = { year: number; label: string; value: number };

export const LDL_SERIES: SeriesPoint[] = [
  { year: 2022, label: 'Jun 2022', value: 118 },
  { year: 2024, label: 'Mar 2024', value: 131 },
  { year: 2026, label: 'Mar 2026', value: 146 },
];

export type Change = {
  metric: string;
  verb: string;
  amount: string;
  range: string;
  from: string;
  to: string;
  direction: 'up' | 'down';
  /** Semantic tone: good = improvement, watch = attention, alert = concerning increase. */
  tone: 'good' | 'watch' | 'alert';
};

// LDL: 131 (2024) → 146 (2026) = +15, matching LDL_SERIES above.
export const CHANGES: Change[] = [
  { metric: 'LDL Cholesterol', verb: 'Increased by', amount: '15 points', range: '2024 → 2026', from: '131', to: '146 mg/dL', direction: 'up', tone: 'alert' },
  { metric: 'HbA1c', verb: 'Improved by', amount: '0.6%', range: '2025 → 2026', from: '6.7%', to: '6.1%', direction: 'down', tone: 'good' },
  { metric: 'Vitamin D', verb: 'Decreased by', amount: '8 ng/mL', range: '2024 → 2026', from: '34', to: '26 ng/mL', direction: 'down', tone: 'watch' },
];

export const TIMELINE_EVENTS = [
  { year: '2026', title: 'Blood Test', meta: 'Mar 2026 · 4 results added' },
  { year: '2025', title: 'Consultation', meta: 'Visit summary' },
  { year: '2024', title: 'Lab Report', meta: 'Mar 2024 · 5 results' },
  { year: '2023', title: 'Scan Report', meta: 'Imaging report' },
  { year: '2021', title: 'Prescription', meta: 'Medication list' },
  { year: '2019', title: 'Blood Test', meta: 'First record' },
] as const;

export const RECORD_CHIPS = [
  { year: '2019', label: 'Blood Test', icon: 'flask', tone: 'blue' },
  { year: '2021', label: 'Prescription', icon: 'pill', tone: 'lavender' },
  { year: '2023', label: 'Scan Report', icon: 'image', tone: 'cream' },
  { year: '2024', label: 'Lab Report', icon: 'file', tone: 'teal' },
  { year: '2025', label: 'Consultation', icon: 'consult', tone: 'mint' },
  { year: '2026', label: 'Blood Test', icon: 'flask', tone: 'blue' },
] as const;

export const ASK_SOURCES = ['Blood Test · Mar 2026', 'Blood Test · Mar 2024', 'Blood Test · Jun 2022'] as const;
