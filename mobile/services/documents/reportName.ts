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
  [/\b(x-?\s?ray|radiograph)\b/i, 'X-ray'],
  [/\b(mri|magnetic resonance)\b/i, 'MRI scan'],
  [/\b(ct|cat scan|computed tomography)\b/i, 'CT scan'],
  [/\b(ultrasound|sonograph|usg)\b/i, 'Ultrasound'],
  [/\b(mammogra)/i, 'Mammogram'],
];

export type ReportKind = 'Blood test' | 'Urine test' | 'Lab report' | 'X-ray' | 'MRI scan' | 'CT scan' | 'Ultrasound' | 'Mammogram' | 'Imaging report' | 'Vital signs' | 'Health report';

function kindOfOne(r: Pick<RecordedObservation, 'category' | 'name'>): ReportKind | null {
  switch (r.category) {
    case 'blood': return 'Blood test';
    case 'urine': return 'Urine test';
    case 'laboratory': return 'Lab report';
    case 'vital_sign':
    case 'vitals': return 'Vital signs';
    case 'imaging': {
      const hit = IMAGING_MODALITIES.find(([re]) => re.test(r.name));
      return (hit?.[1] as ReportKind | undefined) ?? 'Imaging report';
    }
    default: return null;
  }
}

/** The kind of report, from the results read from it. Mixed lab results → "Lab report". */
export function reportKind(results: Array<Pick<RecordedObservation, 'category' | 'name'>>): ReportKind | null {
  const kinds = [...new Set(results.map(kindOfOne).filter((k): k is ReportKind => k !== null))];
  if (kinds.length === 0) return null;
  if (kinds.length === 1) return kinds[0];
  return kinds.every((k) => k === 'Blood test' || k === 'Urine test' || k === 'Lab report') ? 'Lab report' : 'Health report';
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
