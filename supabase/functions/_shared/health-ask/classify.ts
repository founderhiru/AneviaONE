/**
 * Question classification for Ask My Health (V1) — deterministic.
 *
 * 1. Safety first: requests for diagnosis, treatment, medication changes or
 *    emergencies are answered with a fixed limitation, before any record is
 *    read or any AI is called.
 * 2. Then the intent decides the MINIMUM record kinds to retrieve.
 * Unknown questions may be classified by the model (question text only, no
 * records) — see ask.ts.
 */

export type Intent =
  | { type: 'medications'; term: string | null }
  | { type: 'medication_mentions'; term: string }
  | { type: 'last_test'; term: string | null }
  | { type: 'trend'; term: string }
  | { type: 'changes' }
  | { type: 'condition_first'; term: string | null }
  | { type: 'conditions' }
  | { type: 'allergies' }
  | { type: 'procedures' }
  | { type: 'vaccinations' }
  | { type: 'history' };

export type Classification =
  | { kind: 'safety'; reason: 'emergency' | 'diagnosis' | 'treatment' }
  | { kind: 'intent'; intent: Intent }
  | { kind: 'unknown' };

export const INTENT_TYPES = [
  'medications',
  'medication_mentions',
  'last_test',
  'trend',
  'changes',
  'condition_first',
  'conditions',
  'allergies',
  'procedures',
  'vaccinations',
  'history',
] as const;

const EMERGENCY =
  /\b(chest pain|can'?t breathe|cannot breathe|difficulty breathing|unconscious|overdos|suicid|kill myself|self[- ]harm|stroke symptoms|severe bleeding|seizure|emergency|heart attack)\b/i;
const DIAGNOSIS =
  /\b(do i have|have i got|am i (?:diabetic|sick|ill|at risk)|diagnos\w*|what(?:'s| is) wrong with me|is (?:it|this|my \w+) (?:serious|dangerous|normal|bad|cancer)|should i (?:be )?worr|what disease|prognosis|is my \w+ (?:normal|too high|too low|bad|good))\b/i;
const TREATMENT =
  /\b(should i (?:take|stop|start|increase|decrease|reduce|change|skip|continue)|can i (?:stop|skip|take|increase|reduce|double)|(?:increase|decrease|reduce|adjust|change) (?:my )?(?:dose|dosage|medication|medicine)|what (?:medicine|medication|drug|treatment) should|how (?:do|can|should) i (?:treat|cure|lower|reduce|bring down)|treat(?:ment)? for|cure for|which (?:medicine|medication|drug) (?:is best|to take)|dosage of)\b/i;

const GENERIC_TEST_TERMS = new Set(['blood', 'blood test', 'lab', 'lab test', 'test', 'tests', 'report', 'checkup', 'check up', 'health check', 'blood work', 'bloodwork']);

const clean = (t: string | undefined | null): string | null => {
  if (!t) return null;
  if (/^\s*(?:this|that|it|these|those)\b/i.test(t)) return null;
  const s = t.replace(/[?.!,"']/g, ' ').replace(/\b(my|the|a|an|level|levels|value|values|result|results|reading|readings)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return s.length >= 2 && s.length <= 60 ? s : null;
};

export function classifyQuestion(question: string): Classification {
  const q = question.replace(/\s+/g, ' ').trim();
  if (EMERGENCY.test(q)) return { kind: 'safety', reason: 'emergency' };
  if (TREATMENT.test(q)) return { kind: 'safety', reason: 'treatment' };
  if (DIAGNOSIS.test(q)) return { kind: 'safety', reason: 'diagnosis' };
  const lower = q.toLowerCase();

  let m = /which (?:reports?|documents?) (?:mention|list|include|contain|show)s? (.+)/i.exec(q);
  if (m && clean(m[1])) return { kind: 'intent', intent: { type: 'medication_mentions', term: clean(m[1])! } };

  m = /how (?:has|have|did|is|are) (.+?) (?:changed|change|trended|trending|moved|gone|varied|developed)/i.exec(q) ?? /(?:trend|history|changes?) (?:of|in|for) (.+)/i.exec(q) ?? /^(?:show )?(.+?) trend/i.exec(q);
  if (m && clean(m[1]) && !/\b(health|reports?|records?|everything)\b/i.test(m[1])) return { kind: 'intent', intent: { type: 'trend', term: clean(m[1])! } };

  if (/what (?:has )?changed|what'?s new|changes? between|compare|difference between/i.test(lower)) return { kind: 'intent', intent: { type: 'changes' } };

  m = /when was (.+?) first (?:recorded|mentioned|noted|diagnosed|found|listed)/i.exec(q);
  if (m) return { kind: 'intent', intent: { type: 'condition_first', term: clean(m[1]) } };

  if (/\ballerg/i.test(lower)) return { kind: 'intent', intent: { type: 'allergies' } };
  if (/\b(vaccin\w*|immuni[sz]\w*|jabs?|shots?)\b/i.test(lower)) return { kind: 'intent', intent: { type: 'vaccinations' } };
  if (/\b(procedures?|surger(?:y|ies)|operations?)\b/i.test(lower)) return { kind: 'intent', intent: { type: 'procedures' } };
  if (/\b(medications?|medicines?|meds|drugs|prescri\w*|tablets?|pills?)\b/i.test(lower)) return { kind: 'intent', intent: { type: 'medications', term: null } };
  if (/\b(conditions?|problems?|illness(?:es)?)\b/i.test(lower)) return { kind: 'intent', intent: { type: 'conditions' } };

  m = /when (?:was|did i have|did i get) (?:my )?(?:last|latest|most recent) (.+)/i.exec(q) ?? /(?:last|latest|most recent) (.+?)(?: result| test)?s?\??$/i.exec(q);
  if (m) {
    const term = clean(m[1]);
    return { kind: 'intent', intent: { type: 'last_test', term: term && !GENERIC_TEST_TERMS.has(term.toLowerCase()) ? term.replace(/\s*(test|result)s?$/i, '') : null } };
  }

  if (/\b(history|timeline|recent health|summary|overview|records?)\b/i.test(lower)) return { kind: 'intent', intent: { type: 'history' } };
  return { kind: 'unknown' };
}

export const SAFETY_MESSAGES = {
  emergency:
    'If this could be an emergency, contact local emergency services now (112 in India) or go to the nearest emergency department. AneviaONE can’t help with urgent medical situations.',
  diagnosis:
    'I can’t diagnose or say what your results mean for your health. I can show what your reports recorded — please discuss what it means with a qualified clinician.',
  treatment:
    'I can’t give treatment or medication advice, including starting, stopping or changing a medicine. Please discuss medical decisions with a qualified clinician. I can show what your reports recorded.',
} as const;

export const NOT_ENOUGH_INFORMATION = 'I don’t have enough information in your health records to answer that.';
