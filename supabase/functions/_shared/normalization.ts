/**
 * Deterministic normalisation of lab names and units.
 *
 * Rules:
 *  - A test is recognised only by an EXACT alias (after case/space folding).
 *    No fuzzy matching. An unrecognised or ambiguous name (e.g. plain
 *    "Glucose") gets no key and no normalised value.
 *  - A unit is converted only through an explicit, published factor listed
 *    below, each with a rule id that is stored on the observation.
 *  - The language model never converts anything. Raw value and raw unit are
 *    always kept by the caller.
 */
import { roundTo } from './numbers.ts';

export type Conversion = { rule: string; factor: number; offset?: number };

export type Analyte = {
  key: string;
  display: string;
  /** Unit every value of this test is normalised to. */
  canonicalUnit: string;
  category: 'laboratory' | 'vital_sign';
  aliases: string[];
  /** unitKey → conversion into canonicalUnit. */
  units: Record<string, Conversion>;
  decimals: number;
};

/** Unit spelling → stable unit key. Keys are lower-case with no spaces. */
const UNIT_KEYS: Record<string, string> = {
  '%': '%', percent: '%', 'mg/dl': 'mg/dl', 'mg/100ml': 'mg/dl', 'mmol/l': 'mmol/l', 'g/dl': 'g/dl', 'gm/dl': 'g/dl',
  'gm%': 'g/dl', 'g%': 'g/dl', 'g/l': 'g/l', 'u/l': 'u/l', 'iu/l': 'iu/l', 'ng/ml': 'ng/ml', 'pg/ml': 'pg/ml',
  'ng/l': 'ng/l', 'nmol/l': 'nmol/l', 'pmol/l': 'pmol/l', 'umol/l': 'umol/l', 'mmol/mol': 'mmol/mol',
  'uiu/ml': 'uiu/ml', 'miu/l': 'miu/l', 'mmhg': 'mmhg', 'ml/min/1.73m2': 'ml/min/1.73m2',
};

export function unitKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const folded = raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[µμ]/g, 'u')
    .replace(/²/g, '2')
    .replace(/\s+/g, '')
    .replace(/\.$/, '');
  return UNIT_KEYS[folded] ?? null;
}

/** Display spelling for a canonical unit key. */
const UNIT_DISPLAY: Record<string, string> = {
  '%': '%', 'mg/dl': 'mg/dL', 'mmol/l': 'mmol/L', 'g/dl': 'g/dL', 'g/l': 'g/L', 'u/l': 'U/L', 'iu/l': 'IU/L',
  'ng/ml': 'ng/mL', 'pg/ml': 'pg/mL', 'ng/l': 'ng/L', 'nmol/l': 'nmol/L', 'pmol/l': 'pmol/L', 'umol/l': 'µmol/L',
  'mmol/mol': 'mmol/mol', 'uiu/ml': 'µIU/mL', 'miu/l': 'mIU/L', 'mmhg': 'mmHg', 'ml/min/1.73m2': 'mL/min/1.73 m²',
};

const id = (rule: string): Conversion => ({ rule, factor: 1 });

export const ANALYTES: Analyte[] = [
  {
    key: 'hba1c', display: 'HbA1c', canonicalUnit: '%', category: 'laboratory', decimals: 2,
    aliases: ['hba1c', 'hb a1c', 'a1c', 'hemoglobin a1c', 'haemoglobin a1c', 'glycated hemoglobin', 'glycated haemoglobin',
      'glycosylated hemoglobin', 'glycosylated haemoglobin', 'glycohemoglobin', 'glyco hemoglobin', 'hba1c (glycated hemoglobin)'],
    units: {
      '%': id('hba1c_percent_identity'),
      // NGSP = 0.09148 × IFCC + 2.152 (IFCC–NGSP master equation)
      'mmol/mol': { rule: 'hba1c_mmol_mol_to_percent_v1', factor: 0.09148, offset: 2.152 },
    },
  },
  {
    key: 'glucose_fasting', display: 'Fasting glucose', canonicalUnit: 'mg/dL', category: 'laboratory', decimals: 1,
    aliases: ['fasting glucose', 'fasting blood glucose', 'fasting blood sugar', 'fbs', 'fbg', 'glucose fasting', 'glucose, fasting',
      'glucose - fasting', 'fasting plasma glucose', 'fpg', 'blood sugar fasting', 'blood sugar (fasting)', 'glucose (fasting)'],
    units: { 'mg/dl': id('glucose_mg_dl_identity'), 'mmol/l': { rule: 'glucose_mmol_l_to_mg_dl_v1', factor: 18.016 } },
  },
  {
    key: 'glucose_postprandial', display: 'Post-meal glucose', canonicalUnit: 'mg/dL', category: 'laboratory', decimals: 1,
    aliases: ['post prandial glucose', 'postprandial glucose', 'post-prandial glucose', 'ppbs', 'pp blood sugar', 'postprandial blood sugar',
      'post prandial blood sugar', 'glucose post prandial', 'glucose, postprandial', 'glucose (post prandial)'],
    units: { 'mg/dl': id('glucose_mg_dl_identity'), 'mmol/l': { rule: 'glucose_mmol_l_to_mg_dl_v1', factor: 18.016 } },
  },
  {
    key: 'glucose_random', display: 'Random glucose', canonicalUnit: 'mg/dL', category: 'laboratory', decimals: 1,
    aliases: ['random glucose', 'random blood sugar', 'rbs', 'glucose random', 'glucose, random', 'glucose (random)'],
    units: { 'mg/dl': id('glucose_mg_dl_identity'), 'mmol/l': { rule: 'glucose_mmol_l_to_mg_dl_v1', factor: 18.016 } },
  },
  {
    key: 'cholesterol_total', display: 'Total cholesterol', canonicalUnit: 'mg/dL', category: 'laboratory', decimals: 1,
    aliases: ['total cholesterol', 'cholesterol total', 'cholesterol, total', 'cholesterol - total', 'serum cholesterol', 'cholesterol (total)', 't. cholesterol'],
    units: { 'mg/dl': id('cholesterol_mg_dl_identity'), 'mmol/l': { rule: 'cholesterol_mmol_l_to_mg_dl_v1', factor: 38.67 } },
  },
  {
    key: 'ldl_cholesterol', display: 'LDL cholesterol', canonicalUnit: 'mg/dL', category: 'laboratory', decimals: 1,
    aliases: ['ldl', 'ldl cholesterol', 'ldl-c', 'ldl c', 'ldl cholesterol (calculated)', 'ldl cholesterol, calculated', 'ldl cholesterol - direct',
      'ldl cholesterol direct', 'ldl direct', 'low density lipoprotein', 'low density lipoprotein cholesterol', 'cholesterol ldl', 'cholesterol - ldl'],
    units: { 'mg/dl': id('cholesterol_mg_dl_identity'), 'mmol/l': { rule: 'cholesterol_mmol_l_to_mg_dl_v1', factor: 38.67 } },
  },
  {
    key: 'hdl_cholesterol', display: 'HDL cholesterol', canonicalUnit: 'mg/dL', category: 'laboratory', decimals: 1,
    aliases: ['hdl', 'hdl cholesterol', 'hdl-c', 'hdl c', 'high density lipoprotein', 'high density lipoprotein cholesterol', 'cholesterol hdl', 'cholesterol - hdl'],
    units: { 'mg/dl': id('cholesterol_mg_dl_identity'), 'mmol/l': { rule: 'cholesterol_mmol_l_to_mg_dl_v1', factor: 38.67 } },
  },
  {
    key: 'triglycerides', display: 'Triglycerides', canonicalUnit: 'mg/dL', category: 'laboratory', decimals: 1,
    aliases: ['triglycerides', 'triglyceride', 'tg', 'serum triglycerides', 'triglycerides (tg)'],
    units: { 'mg/dl': id('triglycerides_mg_dl_identity'), 'mmol/l': { rule: 'triglycerides_mmol_l_to_mg_dl_v1', factor: 88.57 } },
  },
  {
    key: 'creatinine', display: 'Creatinine', canonicalUnit: 'mg/dL', category: 'laboratory', decimals: 2,
    aliases: ['creatinine', 'serum creatinine', 'creatinine, serum', 'creatinine - serum'],
    units: { 'mg/dl': id('creatinine_mg_dl_identity'), 'umol/l': { rule: 'creatinine_umol_l_to_mg_dl_v1', factor: 1 / 88.4 } },
  },
  {
    key: 'egfr', display: 'eGFR', canonicalUnit: 'mL/min/1.73 m²', category: 'laboratory', decimals: 1,
    aliases: ['egfr', 'e-gfr', 'estimated gfr', 'gfr estimated', 'gfr (estimated)', 'estimated glomerular filtration rate', 'egfr (ckd-epi)', 'egfr (mdrd)'],
    units: { 'ml/min/1.73m2': id('egfr_identity') },
  },
  {
    key: 'alt', display: 'ALT', canonicalUnit: 'U/L', category: 'laboratory', decimals: 1,
    aliases: ['alt', 'sgpt', 'alt (sgpt)', 'sgpt (alt)', 'alanine aminotransferase', 'alanine transaminase', 'alt/sgpt'],
    units: { 'u/l': id('enzyme_u_l_identity'), 'iu/l': { rule: 'enzyme_iu_l_as_u_l_v1', factor: 1 } },
  },
  {
    key: 'ast', display: 'AST', canonicalUnit: 'U/L', category: 'laboratory', decimals: 1,
    aliases: ['ast', 'sgot', 'ast (sgot)', 'sgot (ast)', 'aspartate aminotransferase', 'aspartate transaminase', 'ast/sgot'],
    units: { 'u/l': id('enzyme_u_l_identity'), 'iu/l': { rule: 'enzyme_iu_l_as_u_l_v1', factor: 1 } },
  },
  {
    key: 'tsh', display: 'TSH', canonicalUnit: 'µIU/mL', category: 'laboratory', decimals: 3,
    aliases: ['tsh', 'thyroid stimulating hormone', 'thyroid-stimulating hormone', 'tsh (thyroid stimulating hormone)', 'tsh, ultrasensitive', 'tsh ultrasensitive', 'ultrasensitive tsh'],
    units: { 'uiu/ml': id('tsh_uiu_ml_identity'), 'miu/l': { rule: 'tsh_miu_l_to_uiu_ml_v1', factor: 1 } },
  },
  {
    key: 'vitamin_d', display: 'Vitamin D (25-OH)', canonicalUnit: 'ng/mL', category: 'laboratory', decimals: 1,
    aliases: ['vitamin d', 'vitamin d (25-oh)', '25-oh vitamin d', '25 oh vitamin d', '25 hydroxy vitamin d', '25-hydroxy vitamin d', 'vitamin d, 25-hydroxy',
      'vitamin d total', 'vitamin d 25 hydroxy', '25-hydroxyvitamin d', 'vitamin d3 (25-oh)', '25(oh) vitamin d'],
    units: { 'ng/ml': id('vitamin_d_ng_ml_identity'), 'nmol/l': { rule: 'vitamin_d_nmol_l_to_ng_ml_v1', factor: 1 / 2.496 } },
  },
  {
    key: 'vitamin_b12', display: 'Vitamin B12', canonicalUnit: 'pg/mL', category: 'laboratory', decimals: 0,
    aliases: ['vitamin b12', 'vitamin b-12', 'b12', 'b-12', 'cyanocobalamin', 'vitamin b12 (cobalamin)', 'cobalamin', 'serum vitamin b12'],
    units: {
      'pg/ml': id('b12_pg_ml_identity'),
      'ng/l': { rule: 'b12_ng_l_as_pg_ml_v1', factor: 1 },
      'pmol/l': { rule: 'b12_pmol_l_to_pg_ml_v1', factor: 1.355 },
    },
  },
  {
    key: 'hemoglobin', display: 'Hemoglobin', canonicalUnit: 'g/dL', category: 'laboratory', decimals: 1,
    aliases: ['hemoglobin', 'haemoglobin', 'hb', 'hgb', 'hemoglobin (hb)', 'haemoglobin (hb)', 'hb (hemoglobin)', 'hemoglobin, total'],
    units: { 'g/dl': id('hemoglobin_g_dl_identity'), 'g/l': { rule: 'hemoglobin_g_l_to_g_dl_v1', factor: 0.1 } },
  },
  {
    key: 'bp_systolic', display: 'Blood pressure (systolic)', canonicalUnit: 'mmHg', category: 'vital_sign', decimals: 0,
    aliases: ['systolic blood pressure', 'systolic bp', 'systolic'],
    units: { mmhg: id('bp_mmhg_identity') },
  },
  {
    key: 'bp_diastolic', display: 'Blood pressure (diastolic)', canonicalUnit: 'mmHg', category: 'vital_sign', decimals: 0,
    aliases: ['diastolic blood pressure', 'diastolic bp', 'diastolic'],
    units: { mmhg: id('bp_mmhg_identity') },
  },
];

const ALIAS_INDEX: Map<string, Analyte> = new Map();
for (const analyte of ANALYTES) {
  for (const alias of analyte.aliases) ALIAS_INDEX.set(foldName(alias), analyte);
}

function foldName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Exact-alias lookup. Returns null for anything not explicitly listed. */
export function findAnalyte(nameAsWritten: string): Analyte | null {
  return ALIAS_INDEX.get(foldName(nameAsWritten)) ?? null;
}

export type NormalizedValue =
  | {
      status: 'normalized';
      analyte: Analyte;
      valueNormalized: number;
      unitNormalized: string;
      rule: string;
      /** Applies the same conversion to another number (reference ranges). */
      convert: (x: number) => number;
    }
  | { status: 'unknown_analyte' }
  | { status: 'missing_unit'; analyte: Analyte }
  | { status: 'unknown_unit'; analyte: Analyte }
  | { status: 'unit_unexpected'; analyte: Analyte };

export function normalizeObservation(
  nameAsWritten: string,
  value: number,
  unitAsWritten: string | null | undefined,
  analyteOverride?: Analyte | null,
): NormalizedValue {
  const analyte = analyteOverride ?? findAnalyte(nameAsWritten);
  if (!analyte) return { status: 'unknown_analyte' };
  if (!unitAsWritten || !unitAsWritten.trim()) return { status: 'missing_unit', analyte };

  const key = unitKey(unitAsWritten);
  if (!key) return { status: 'unknown_unit', analyte };
  const conversion = analyte.units[key];
  if (!conversion) return { status: 'unit_unexpected', analyte };

  const convert = (x: number) =>
    conversion.factor === 1 && !conversion.offset ? x : roundTo(x * conversion.factor + (conversion.offset ?? 0), analyte.decimals);
  return {
    status: 'normalized',
    analyte,
    valueNormalized: convert(value),
    unitNormalized: analyte.canonicalUnit,
    rule: conversion.rule,
    convert,
  };
}

export function displayUnit(raw: string | null | undefined): string | null {
  const key = unitKey(raw);
  return key ? UNIT_DISPLAY[key] ?? null : null;
}
