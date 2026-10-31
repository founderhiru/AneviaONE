/**
 * Synthetic report corpus for measuring extraction accuracy.
 *
 * NO real patient data: every name, value and date is generated from a seed.
 * Each case is a small multi-line report in one of several layouts that mimic
 * how Indian diagnostic labs print results, together with an ANSWER KEY of what
 * a correct reading must contain. The corpus is deterministic: the same seed
 * always gives the same cases, so scores are comparable between runs.
 *
 * Not covered yet (tracked in docs/ANEVIAONE_2_BLUEPRINT.md): scanned or
 * photographed pages, handwriting, and non-English scripts.
 */

export type Analyte = {
  /** Canonical name used in the answer key. */
  name: string;
  /** Other ways labs print the same test name. */
  aliases: string[];
  unit: string;
  /** Printed reference range, as written. */
  range: string;
  /** Plausible value bounds (low, high) and decimals printed. */
  min: number;
  max: number;
  decimals: number;
};

export const ANALYTES: Analyte[] = [
  { name: 'HbA1c', aliases: ['Glycosylated Hemoglobin (HbA1c)', 'HbA1c (Glycated Hb)'], unit: '%', range: '4.0 - 5.6', min: 4.8, max: 9.5, decimals: 1 },
  { name: 'Fasting Blood Sugar', aliases: ['Glucose - Fasting', 'FBS'], unit: 'mg/dL', range: '70 - 100', min: 70, max: 190, decimals: 0 },
  { name: 'Total Cholesterol', aliases: ['Cholesterol - Total', 'Serum Cholesterol'], unit: 'mg/dL', range: '< 200', min: 130, max: 290, decimals: 0 },
  { name: 'LDL Cholesterol', aliases: ['LDL Cholesterol - Direct', 'Cholesterol - LDL'], unit: 'mg/dL', range: '< 100', min: 60, max: 190, decimals: 0 },
  { name: 'HDL Cholesterol', aliases: ['Cholesterol - HDL', 'HDL'], unit: 'mg/dL', range: '40 - 60', min: 28, max: 75, decimals: 0 },
  { name: 'Triglycerides', aliases: ['Serum Triglycerides', 'TG'], unit: 'mg/dL', range: '< 150', min: 60, max: 330, decimals: 0 },
  { name: 'Hemoglobin', aliases: ['Haemoglobin', 'Hemoglobin (Hb)'], unit: 'g/dL', range: '12.0 - 15.5', min: 8.5, max: 17.5, decimals: 1 },
  { name: 'Total WBC Count', aliases: ['WBC Count', 'Total Leucocyte Count'], unit: 'cells/cumm', range: '4000 - 11000', min: 3200, max: 14500, decimals: 0 },
  { name: 'Platelet Count', aliases: ['Platelets', 'Platelet Count (PLT)'], unit: 'lakhs/cumm', range: '1.5 - 4.1', min: 0.9, max: 4.8, decimals: 1 },
  { name: 'Serum Creatinine', aliases: ['Creatinine', 'Creatinine - Serum'], unit: 'mg/dL', range: '0.6 - 1.2', min: 0.5, max: 2.1, decimals: 1 },
  { name: 'Blood Urea', aliases: ['Urea', 'Serum Urea'], unit: 'mg/dL', range: '15 - 40', min: 12, max: 70, decimals: 0 },
  { name: 'Uric Acid', aliases: ['Serum Uric Acid'], unit: 'mg/dL', range: '3.5 - 7.2', min: 2.8, max: 9.5, decimals: 1 },
  { name: 'SGPT (ALT)', aliases: ['ALT', 'Alanine Aminotransferase'], unit: 'U/L', range: '< 41', min: 10, max: 120, decimals: 0 },
  { name: 'SGOT (AST)', aliases: ['AST', 'Aspartate Aminotransferase'], unit: 'U/L', range: '< 40', min: 10, max: 110, decimals: 0 },
  { name: 'TSH', aliases: ['Thyroid Stimulating Hormone', 'TSH - Ultrasensitive'], unit: 'µIU/mL', range: '0.4 - 4.2', min: 0.2, max: 9.5, decimals: 2 },
  { name: 'Free T4', aliases: ['FT4', 'Thyroxine - Free'], unit: 'ng/dL', range: '0.8 - 1.8', min: 0.5, max: 2.4, decimals: 2 },
  { name: 'Vitamin D (25-OH)', aliases: ['25-OH Vitamin D', 'Vitamin D Total'], unit: 'ng/mL', range: '30 - 100', min: 8, max: 80, decimals: 1 },
  { name: 'Vitamin B12', aliases: ['Cyanocobalamin (B12)', 'Serum B12'], unit: 'pg/mL', range: '200 - 900', min: 120, max: 1100, decimals: 0 },
  { name: 'Ferritin', aliases: ['Serum Ferritin'], unit: 'ng/mL', range: '15 - 150', min: 6, max: 320, decimals: 0 },
  { name: 'Sodium', aliases: ['Serum Sodium', 'Sodium (Na)'], unit: 'mmol/L', range: '135 - 145', min: 128, max: 149, decimals: 0 },
  { name: 'Potassium', aliases: ['Serum Potassium', 'Potassium (K)'], unit: 'mmol/L', range: '3.5 - 5.1', min: 3.0, max: 5.8, decimals: 1 },
  { name: 'Calcium', aliases: ['Serum Calcium', 'Calcium - Total'], unit: 'mg/dL', range: '8.6 - 10.2', min: 7.8, max: 11.2, decimals: 1 },
  { name: 'ESR', aliases: ['Erythrocyte Sedimentation Rate'], unit: 'mm/hr', range: '0 - 20', min: 2, max: 60, decimals: 0 },
  { name: 'Total Bilirubin', aliases: ['Bilirubin - Total'], unit: 'mg/dL', range: '0.2 - 1.2', min: 0.2, max: 2.4, decimals: 1 },
];

export type KeyObservation = { name: string; value: string; unit: string; range: string; date: string };

export type Layout = 'tabular' | 'pipe' | 'colon' | 'flagged' | 'two-line';
export const LAYOUTS: Layout[] = ['tabular', 'pipe', 'colon', 'flagged', 'two-line'];

export type DateStyle = 'dmy-slash' | 'dmy-dot' | 'dmy-mon';
export const DATE_STYLES: DateStyle[] = ['dmy-slash', 'dmy-dot', 'dmy-mon'];

export type EvalCase = {
  id: string;
  layout: Layout;
  dateStyle: DateStyle;
  lab: string;
  patient: { name: string; dobWritten: string };
  /** Report pages, one array of printed lines each. */
  pages: string[][];
  /** What a correct reading contains. */
  key: KeyObservation[];
};

/** Small deterministic generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LABS = ['Sunrise Diagnostics', 'Lakeview Pathology Laboratory', 'Meridian Health Labs', 'Greenfield Diagnostic Centre', 'Bluebird Clinical Laboratory'];
const FIRST = ['Asha', 'Rohan', 'Meera', 'Vikram', 'Lakshmi', 'Imran', 'Divya', 'Karthik', 'Sunita', 'Arjun'];
const LAST = ['Verma', 'Kapoor', 'Reddy', 'Nair', 'Sharma', 'Khan', 'Iyer', 'Das', 'Patel', 'Rao'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

function writeDate(y: number, m: number, d: number, style: DateStyle): string {
  if (style === 'dmy-slash') return `${pad(d)}/${pad(m)}/${y}`;
  if (style === 'dmy-dot') return `${pad(d)}.${pad(m)}.${y}`;
  return `${pad(d)}-${MONTHS[m - 1]}-${y}`;
}

const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)];

function flag(value: number, range: string): string {
  const between = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(range);
  if (between) return value < Number(between[1]) ? 'L' : value > Number(between[2]) ? 'H' : '';
  const upper = /^<\s*(\d+(?:\.\d+)?)$/.exec(range);
  if (upper) return value >= Number(upper[1]) ? 'H' : '';
  return '';
}

function row(layout: Layout, name: string, value: string, unit: string, range: string, raw: number): string[] {
  switch (layout) {
    case 'tabular':
      return [`${name} ${value} ${unit} ${range}`];
    case 'pipe':
      return [`${name} | ${value} | ${unit} | ${range}`];
    case 'colon':
      return [`${name} : ${value} ${unit} (${range})`];
    case 'flagged': {
      const f = flag(raw, range);
      return [`${name} ${value}${f ? ' ' + f : ''} ${unit} ${range}`];
    }
    case 'two-line':
      return [name, `${value} ${unit} Ref: ${range}`];
  }
}

const HEADER: Record<Layout, string> = {
  tabular: 'Test   Result   Unit   Reference Range',
  pipe: 'Investigation | Observed Value | Unit | Biological Reference Interval',
  colon: 'Investigation : Result (Reference Interval)',
  flagged: 'Test   Result (Flag)   Unit   Reference Range',
  'two-line': 'Investigation / Result / Reference',
};

/** Generates `count` deterministic cases from `seed`. */
export function generateCorpus(opts: { count: number; seed: number }): EvalCase[] {
  const cases: EvalCase[] = [];
  for (let i = 0; i < opts.count; i++) {
    const r = rng(opts.seed * 7919 + i * 104729 + 13);
    const layout = LAYOUTS[i % LAYOUTS.length];
    const dateStyle = DATE_STYLES[Math.floor(i / LAYOUTS.length) % DATE_STYLES.length];
    const lab = pick(r, LABS);
    const patient = {
      name: `${pick(r, FIRST)} ${pick(r, LAST)}`,
      dobWritten: writeDate(1950 + Math.floor(r() * 50), 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28), dateStyle),
    };
    const year = 2019 + Math.floor(r() * 7);
    const month = 1 + Math.floor(r() * 12);
    const day = 1 + Math.floor(r() * 28);
    const printedDate = writeDate(year, month, day, dateStyle);
    const iso = `${year}-${pad(month)}-${pad(day)}`;

    const chosen = [...ANALYTES].sort(() => r() - 0.5).slice(0, 6 + Math.floor(r() * 7));
    const key: KeyObservation[] = [];
    const rows: string[][] = [];
    for (const a of chosen) {
      const raw = a.min + r() * (a.max - a.min);
      const value = raw.toFixed(a.decimals);
      const printedName = r() < 0.4 ? pick(r, a.aliases) : a.name;
      rows.push(row(layout, printedName, value, a.unit, a.range, Number(value)));
      key.push({ name: a.name, value, unit: a.unit, range: a.range, date: iso });
    }

    const head = [
      `${lab} - Laboratory Report`,
      `Patient: ${patient.name}   DOB: ${patient.dobWritten}`,
      `Report Date: ${printedDate}`,
      HEADER[layout],
    ];
    const lines = rows.flat();
    // Long reports continue on a second page, with the header repeated.
    const pages = lines.length > 14 ? [[...head, ...lines.slice(0, 12)], [...head, ...lines.slice(12)]] : [[...head, ...lines]];
    cases.push({ id: `${opts.seed}-${String(i).padStart(3, '0')}`, layout, dateStyle, lab, patient, pages, key });
  }
  return cases;
}
