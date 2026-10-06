/**
 * Condition / allergy assertion guards. A mention is not a diagnosis.
 *  "Family history of diabetes"  → rejected (not the patient's condition)
 *  "No history of asthma"        → rejected (negated)
 *  "Suspected hypothyroidism"    → at most "mentioned"
 *  "Diagnosis: Type 2 diabetes"  → may be "diagnosed"
 */
import type { RejectionReason } from './types.ts';

export type Assertion = 'mentioned' | 'reported' | 'diagnosed';

const FAMILY =
  /\b(family history|fam\.? hx|f\/h|fh:|mother|father|brother|sister|sibling|parents?|grand(?:mother|father|parent)s?|maternal|paternal|relatives?|uncle|aunt|cousin)\b/i;
const NEGATION =
  /\b(no (?:known |significant |h\/o |history of |evidence of |signs? of )|denies|denied|negative for|ruled out|rule out|not diagnosed|absence of|free of|no complaints? of)\b/i;
const HYPOTHETICAL = /\b(suspected|suspicion|possible|probable|likely|query|r\/o|\?|risk of|screen(?:ing)? for|to rule out)\b/i;
const DIAGNOSIS_CUES =
  /\b(diagnos(?:ed|is)|dx\b|impression|assessment|known case of|k\/c\/o|kco|confirmed|consistent with|admitted with|discharge diagnosis)\b/i;
const REPORTED_CUES =
  /\b(history of|h\/o|c\/o|complains? of|complaint of|reports?|reported|patient states|self[- ]reported|presents? with|allergic to|allergy to|hypersensitiv\w+ to)\b/i;
const NO_ALLERGY =
  /\b(nkda|nka|nkfa|no known (?:drug |food )?allerg\w*|no allerg\w*|allerg\w* (?:nil|none|not known))\b/i;

export type AssertionResult =
  | { ok: true; assertion: Assertion; downgraded: boolean }
  | { ok: false; reason: RejectionReason };

function resolve(modelAssertion: string | null, quote: string, allowDiagnosed: boolean): { assertion: Assertion; downgraded: boolean } {
  const claimed: Assertion = modelAssertion === 'diagnosed' || modelAssertion === 'reported' ? modelAssertion : 'mentioned';
  const hypothetical = HYPOTHETICAL.test(quote);
  const diagnosisCue = allowDiagnosed && DIAGNOSIS_CUES.test(quote) && !hypothetical;
  const reportedCue = REPORTED_CUES.test(quote) && !hypothetical;

  let assertion: Assertion = 'mentioned';
  if (claimed === 'diagnosed' && diagnosisCue) assertion = 'diagnosed';
  else if ((claimed === 'diagnosed' || claimed === 'reported') && reportedCue) assertion = 'reported';
  // The model can never raise an assertion above what the quote supports.
  return { assertion, downgraded: assertion !== claimed };
}

export function assessCondition(modelAssertion: string | null, quote: string): AssertionResult {
  if (FAMILY.test(quote) || NEGATION.test(quote)) return { ok: false, reason: 'not_patient_condition' };
  return { ok: true, ...resolve(modelAssertion, quote, true) };
}

export function assessAllergy(modelAssertion: string | null, quote: string, substance: string): AssertionResult {
  if (NO_ALLERGY.test(quote) || NO_ALLERGY.test(substance) || /^(nil|none|nka|nkda|n\/a|-)$/i.test(substance.trim())) {
    return { ok: false, reason: 'not_an_allergy' };
  }
  if (FAMILY.test(quote) || NEGATION.test(quote)) return { ok: false, reason: 'not_an_allergy' };
  return { ok: true, ...resolve(modelAssertion, quote, true) };
}

const IMMUNIZATION_CUES = /\b(vaccin\w*|immuni[sz]\w*|booster|dose \d|jab|toxoid|bcg|mmr|opv|dpt|hepatitis [ab]\b|hpv|influenza)\b/i;
export function looksLikeImmunization(quote: string): boolean {
  return IMMUNIZATION_CUES.test(quote);
}
