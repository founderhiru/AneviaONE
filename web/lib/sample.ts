/**
 * SAMPLE DATA — illustrative only.
 *
 * Every chart, change and answer on the marketing site is drawn from this one
 * file so the numbers stay consistent everywhere. None of it is real user
 * data, and the UI labels it as a sample wherever it appears.
 */

/*
 * One sample history, six reports — the record chips around the hero phone:
 *   2019 Lipid Panel (lab)   · LDL 112
 *   2021 Thyroid Test (lab)  · TSH 2.4
 *   2023 Ultrasound (imaging)
 *   2024 Heart Panel (lab)   · LDL 131, HbA1c 6.2
 *   2025 Chest X-Ray (imaging)
 *   2026 Full Checkup (lab)  · LDL 146, HbA1c 5.9, TSH 3.1, Haemoglobin 13.8
 * Lab reports use the flask icon (teal), imaging reports the scan icon (blue),
 * the two result groups the app uses.
 */

export type SeriesPoint = { year: number; label: string; value: number; source: string };

export const LDL_SERIES: SeriesPoint[] = [
  { year: 2019, label: 'Jan 2019', value: 112, source: 'Lipid Panel' },
  { year: 2024, label: 'Mar 2024', value: 131, source: 'Heart Panel' },
  { year: 2026, label: 'Mar 2026', value: 146, source: 'Full Checkup' },
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
  /** As the app's What changed? cards show them. */
  percent: string;
  points: number[];
  results: number;
  since: string;
  latest: string;
};

// Latest report compared with the one before it, as the app does.
export const CHANGES: Change[] = [
  { metric: 'LDL Cholesterol', verb: 'Increased by', amount: '15 mg/dL', range: '2024 → 2026', from: '131', to: '146 mg/dL', direction: 'up', tone: 'alert', percent: '+11%', points: [112, 131, 146], results: 3, since: 'Mar 2024', latest: 'Mar 2026' },
  { metric: 'HbA1c', verb: 'Improved by', amount: '0.3%', range: '2024 → 2026', from: '6.2%', to: '5.9%', direction: 'down', tone: 'good', percent: '−5%', points: [6.2, 5.9], results: 2, since: 'Mar 2024', latest: 'Mar 2026' },
  { metric: 'TSH', verb: 'Increased by', amount: '0.7 mIU/L', range: '2021 → 2026', from: '2.4', to: '3.1 mIU/L', direction: 'up', tone: 'watch', percent: '+29%', points: [2.4, 3.1], results: 2, since: 'Aug 2021', latest: 'Mar 2026' },
];

export const TIMELINE_EVENTS = [
  { year: '2026', title: 'Full Checkup', meta: 'Mar 2026 · 18 results added' },
  { year: '2025', title: 'Chest X-Ray', meta: 'Jun 2025 · Imaging report' },
  { year: '2024', title: 'Heart Panel', meta: 'Mar 2024 · 6 results' },
  { year: '2023', title: 'Ultrasound', meta: 'Aug 2023 · Imaging report' },
  { year: '2021', title: 'Thyroid Test', meta: 'Aug 2021 · 3 results' },
  { year: '2019', title: 'Lipid Panel', meta: 'Jan 2019 · 4 results' },
] as const;

export const RECORD_CHIPS = [
  { year: '2019', label: 'Lipid Panel', icon: 'flask', tone: 'teal' },
  { year: '2021', label: 'Thyroid Test', icon: 'flask', tone: 'teal' },
  { year: '2023', label: 'Ultrasound', icon: 'scan', tone: 'blue' },
  { year: '2024', label: 'Heart Panel', icon: 'flask', tone: 'teal' },
  { year: '2025', label: 'Chest X-Ray', icon: 'scan', tone: 'blue' },
  { year: '2026', label: 'Full Checkup', icon: 'flask', tone: 'teal' },
] as const;

/** My documents: the six reports as the app lists them (newest first). */
export const DOCUMENTS = [
  { name: 'Full_Checkup_Mar_2026.pdf', meta: 'Uploaded 14 Mar 2026 · 1.8 MB', icon: 'file' },
  { name: 'Chest_XRay_Jun_2025.pdf', meta: 'Uploaded 12 Jun 2025 · 2.6 MB', icon: 'scan' },
  { name: 'Heart_Panel_Mar_2024.pdf', meta: 'Uploaded 9 Mar 2024 · 1.1 MB', icon: 'file' },
  { name: 'Ultrasound_Aug_2023.pdf', meta: 'Uploaded 18 Aug 2023 · 3.1 MB', icon: 'scan' },
  { name: 'Thyroid_Test_Aug_2021.pdf', meta: 'Uploaded 6 Aug 2021 · 640 KB', icon: 'file' },
  { name: 'Lipid_Panel_Jan_2019.pdf', meta: 'Uploaded 22 Jan 2019 · 720 KB', icon: 'file' },
] as const;

/** The app's Home dashboard (hero phone). Every number comes from the six reports above. */
export const DASHBOARD = {
  tiles: [
    { key: 'reports', value: '6', label: 'Reports', icon: 'file', tone: 'accent' },
    { key: 'results', value: '33', label: 'Results', icon: 'trend', tone: 'info' },
    { key: 'review', value: '0', label: 'Needs review', icon: 'clock', tone: 'warning' },
  ],
  change: { name: 'LDL Cholesterol', from: '131', to: '146 mg/dL', badge: '+11%', points: [112, 131, 146], start: 'Jan 2019', end: 'Mar 2026' },
  chips: [
    { label: 'All', count: 22, on: true },
    { label: 'Lab', count: 20 },
    { label: 'Imaging', count: 2 },
  ],
  results: [
    { name: 'LDL Cholesterol', meta: '14 Mar 2026 · Lab test', value: '146 mg/dL', range: 'Range < 130', marker: 'Above range', group: 'lab' },
    { name: 'Haemoglobin', meta: '14 Mar 2026 · Lab test', value: '13.8 g/dL', range: 'Range 12.0–15.5', group: 'lab' },
    { name: 'Chest X-ray', meta: '12 Jun 2025 · Imaging', finding: 'No active lung disease seen', group: 'imaging' },
  ],
  documents: [
    { name: 'Full_Checkup_Mar_2026.pdf', meta: '14 Mar 2026 · 1.8 MB' },
    { name: 'Chest_XRay_Jun_2025.pdf', meta: '12 Jun 2025 · 2.6 MB' },
  ],
} as const;

export const ASK_SOURCES = ['Full Checkup · Mar 2026', 'Heart Panel · Mar 2024', 'Lipid Panel · Jan 2019'] as const;
