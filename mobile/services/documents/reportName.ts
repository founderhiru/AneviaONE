import type { RecordedObservation, StoredDocument } from '../../types';
import { shortDate } from '../health/homeDashboard';

/**
 * Plain-language names for reports, e.g. "Blood test · 15 Jan 2026".
 *
 * The name comes only from what was actually read from the report (the kind of
 * results it produced). When that isn't clear we fall back to the file name —
 * never a guess. This is a label to help people find things, not a diagnosis.
 */

const IMAGING_MODALITIES: Array<[RegExp, string]> = [
  [/\b(echocardiogra\w*|2d\s?echo|echo(\s?report)?)\b/i, 'Echocardiogram'],
  [/\b(dexa|dxa|bone\s?(mineral\s?)?density)\b/i, 'Bone density scan'],
  [/\b(x-?\s?ray|radiograph)\b/i, 'X-ray'],
  [/\b(mri|magnetic resonance)\b/i, 'MRI scan'],
  [/\b(ct|cat scan|computed tomography)\b/i, 'CT scan'],
  [/\b(ultrasound|sonograph|usg)\b/i, 'Ultrasound'],
  [/\b(mammogra)/i, 'Mammogram'],
];

export type ReportKind = 'Blood test' | 'Urine test' | 'Lab report' | 'Echocardiogram' | 'ECG' | 'Bone density scan' | 'X-ray' | 'MRI scan' | 'CT scan' | 'Ultrasound' | 'Mammogram' | 'Imaging report' | 'Vital signs' | 'Health report';

/** Findings that only an echocardiogram reports (valves, chambers, ejection fraction). */
const ECHO_FINDINGS = /\b(ejection fraction|lvef|(aortic|mitral|tricuspid|pulmonary)\s+valve|ventric\w*|atri(um|al))\b/i;
/** Measurements that only an ECG tracing reports. */
const ECG_FINDINGS = /^(qrs|qtc?|pr(\s+interval)?|st\s+segment|p\s+wave|ecg|ekg)\b|\b(ecg|ekg)\b/i;

const modalityIn = (text: string): string | null => IMAGING_MODALITIES.find(([re]) => re.test(text))?.[1] ?? null;

function kindOfOne(r: Pick<RecordedObservation, 'category' | 'name'> & { source?: { documentName?: string } }): ReportKind | null {
  switch (r.category) {
    case 'blood': return 'Blood test';
    case 'urine': return 'Urine test';
    case 'laboratory': return 'Lab report';
    case 'vital_sign':
    case 'vitals': return 'Vital signs';
    case 'imaging': {
      // What the results say first, then what the file is called.
      const found = modalityIn(r.name) ?? (ECHO_FINDINGS.test(r.name) ? 'Echocardiogram' : null) ?? modalityIn(r.source?.documentName ?? '');
      return (found as ReportKind | null) ?? 'Imaging report';
    }
    default:
      return ECG_FINDINGS.test(r.name) || /\b(ecg|ekg|electrocardiogra\w*)\b/i.test(r.source?.documentName ?? '') ? 'ECG' : null;
  }
}

const GENERIC_IMAGING: ReportKind = 'Imaging report';
const IMAGING_KINDS: ReportKind[] = ['Echocardiogram', 'ECG', 'Bone density scan', 'X-ray', 'MRI scan', 'CT scan', 'Ultrasound', 'Mammogram', 'Imaging report'];

/** The kind of report, from the results read from it. Mixed lab results → "Lab report". */
export function reportKind(results: Array<Pick<RecordedObservation, 'category' | 'name'> & { source?: { documentName?: string } }>): ReportKind | null {
  const all = results.map(kindOfOne).filter((k): k is ReportKind => k !== null);
  const kinds = [...new Set(all)];
  if (kinds.length === 0) return null;
  if (kinds.length === 1) return kinds[0];
  const lab = (k: ReportKind) => k === 'Blood test' || k === 'Urine test' || k === 'Lab report';
  if (kinds.every(lab)) return 'Lab report';
  // A scan's own findings ("Impression") never outvote the scan's name: the most common specific imaging kind wins.
  if (kinds.every((k) => IMAGING_KINDS.includes(k))) {
    const specific = kinds.filter((k) => k !== GENERIC_IMAGING);
    if (specific.length === 0) return GENERIC_IMAGING;
    return specific.sort((x, y) => all.filter((k) => k === y).length - all.filter((k) => k === x).length)[0];
  }
  return 'Health report';
}

/** Newest dated result's date, as the report date (null if none was clear). */
function reportDate(results: RecordedObservation[]): string | null {
  const dates = results.map((r) => r.date).filter((d): d is string => Boolean(d)).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/** "Blood test · 15 Jan 2026"; undated → "Blood test"; unknown kind → null. */
export function reportName(results: RecordedObservation[]): string | null {
  const kind = reportKind(results);
  if (!kind) return null;
  const date = reportDate(results);
  return date ? `${kind} · ${shortDate(date)}` : kind;
}

/** Results grouped by the report they came from. */
export function resultsByDocument(results: RecordedObservation[]): Map<string, RecordedObservation[]> {
  const map = new Map<string, RecordedObservation[]>();
  for (const r of results) {
    const id = r.source.documentId;
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(r);
  }
  return map;
}

/** Map document id → friendly name, for documents whose results say what they are. */
export function reportNames(results: RecordedObservation[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const [id, list] of resultsByDocument(results)) {
    const name = reportName(list);
    if (name) names.set(id, name);
  }
  return names;
}

/** Name to show for a document: friendly name when known, else the original file name. */
export const displayName = (d: Pick<StoredDocument, 'id' | 'originalFilename'>, names: Map<string, string>): string =>
  names.get(d.id) ?? d.originalFilename;
