import type { ConfidenceBand, ReviewGate, ReviewReason } from './types.ts';

export function confidenceBand(confidence: number, threshold: number): ConfidenceBand {
  if (confidence >= 0.9 && confidence >= threshold) return 'high';
  if (confidence >= threshold) return 'medium';
  return 'low';
}

/**
 * The trust gate. A fact enters longitudinal use only when it is at or above
 * the threshold AND nothing forced a review. Otherwise it is stored as
 * needs_review and excluded from every current_* view until a person
 * confirms it.
 */
export function decideGate(
  confidence: number,
  threshold: number,
  forcedReasons: ReviewReason[],
): { gate: ReviewGate; reason: ReviewReason | null } {
  if (forcedReasons.length > 0) return { gate: 'needs_review', reason: forcedReasons[0] };
  if (confidence < threshold) return { gate: 'needs_review', reason: 'low_confidence' };
  return { gate: 'unreviewed', reason: null };
}

/** Caps applied when the evidence is weaker than the model claims. */
export const CONFIDENCE_CAPS = {
  unitNotInQuote: 0.5,
  ambiguous: 0.5,
  kindUncertain: 0.5,
} as const;
