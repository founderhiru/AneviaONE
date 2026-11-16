import type { RecordedObservation } from '../../types';

/**
 * Where a result sits against the range PRINTED ON ITS OWN REPORT. This is arithmetic on what
 * the lab wrote, not a judgement by AneviaONE: no range or no plain number means no label.
 * Results still waiting for the person's check never get one.
 */
export type RangeStatus = 'below' | 'in_range' | 'above';

export function rangeStatusFor(result: Pick<RecordedObservation, 'valueNumeric' | 'referenceLow' | 'referenceHigh' | 'needsReview'>): RangeStatus | null {
  if (result.needsReview) return null;
  const v = result.valueNumeric;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const low = typeof result.referenceLow === 'number' ? result.referenceLow : null;
  const high = typeof result.referenceHigh === 'number' ? result.referenceHigh : null;
  if (low === null && high === null) return null;
  if (low !== null && v < low) return 'below';
  if (high !== null && v > high) return 'above';
  return 'in_range';
}

export const RANGE_STATUS_LABEL: Record<RangeStatus, string> = {
  below: 'Below range',
  in_range: 'In range',
  above: 'Above range',
};
