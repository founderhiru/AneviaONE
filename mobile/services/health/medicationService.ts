import { isDemoMode } from '../../config/appMode';
import { getActivePerson, getCachedPeople, isOwnRecord, peopleService } from '../people/peopleService';
import { ServiceError, toServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';
import { demoMedicationStore } from './demoMedicationStore';
import { invalidateHealthMemory } from './healthMemoryApi';

/**
 * Medicines a person types in themselves, for when a prescription can't be read (handwritten
 * ones especially). Stored exactly as typed and marked as entered by the person, never as read
 * from a report. Only for your own record or a relative you manage; the database enforces it.
 */

export type MedicationStatusChoice = 'active' | 'as_needed' | 'stopped';
export type MedicationFields = {
  name: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  prescriber?: string;
  status?: MedicationStatusChoice;
};

export const MEDICATION_LIMITS = { name: 300, dose: 100, frequency: 100, duration: 100, instructions: 1000, prescriber: 200 } as const;
export const STATUS_CHOICES: { value: MedicationStatusChoice; label: string }[] = [
  { value: 'active', label: 'Taking now' },
  { value: 'as_needed', label: 'As needed' },
  { value: 'stopped', label: 'Stopped' },
];

const SAVE_ERROR = 'That didn’t save. Nothing was changed — please try again.';
const MESSAGES: Record<string, string> = {
  'the medicine name is required': 'Enter the medicine’s name.',
  'you can only add medicines for yourself or a relative you manage': 'You can add medicines for yourself or a relative you manage.',
  'that medicine was not found': 'That medicine is no longer in the list.',
  'that medicine has already been changed — change the newer version instead': 'That medicine was changed elsewhere. Go back and open it again.',
  'that medicine was removed': 'That medicine was already removed.',
  'that medicine was already changed or removed': 'That medicine was already changed or removed.',
  'nothing was changed': 'Nothing was changed.',
  'a medicine read from a report cannot be removed here': 'This medicine was read from a report. You can change it or mark it as stopped.',
  'this account is being deleted': 'This account is being deleted.',
};

function medicationError(error: unknown): ServiceError {
  const message = String((error as { message?: string } | null)?.message ?? '');
  const key = message.replace(/^(add|update|remove)_medication: /, '');
  if (MESSAGES[key]) return new ServiceError('invalid_input', MESSAGES[key], { cause: error });
  if (/is too long$/.test(key)) return new ServiceError('invalid_input', 'One of the entries is too long.', { cause: error });
  return toServiceError(error, { code: 'save_failed', userMessage: SAVE_ERROR, retryable: true });
}

function client() {
  const c = getSupabaseClient();
  if (!c) throw new ServiceError('not_configured', 'Your Health Memory isn’t available right now.');
  return c;
}

/** Trimmed text for the server; empty entries are sent as empty so an edit can clear them. */
function clean(fields: Partial<MedicationFields>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) if (typeof v === 'string') out[k] = v.trim();
  return out;
}

/** The record on screen: the chosen person, or your own when none is chosen. */
async function activeSubjectId(): Promise<string> {
  const pick = () => getActivePerson()?.id ?? getCachedPeople().find((p) => isOwnRecord(p))?.id ?? null;
  let id = pick();
  if (!id) {
    await peopleService.refresh();
    id = pick();
  }
  if (!id) throw new ServiceError('unknown', SAVE_ERROR);
  return id;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export type MedicationService = {
  add(fields: MedicationFields): Promise<string>;
  update(recordId: string, fields: Partial<MedicationFields>): Promise<string>;
  stop(recordId: string): Promise<string>;
  remove(recordId: string): Promise<void>;
};

export const productionMedicationService: MedicationService = {
  async add(fields) {
    if (!fields.name.trim()) throw new ServiceError('invalid_input', MESSAGES['the medicine name is required']);
    const subject = await activeSubjectId();
    const { data, error } = await client().rpc('add_medication', { p_subject_id: subject, p_fields: clean(fields) });
    if (error) throw medicationError(error);
    if (typeof data !== 'string') throw new ServiceError('unknown', SAVE_ERROR);
    invalidateHealthMemory();
    return data;
  },
  async update(recordId, fields) {
    const { data, error } = await client().rpc('update_medication', { p_medication_id: recordId, p_fields: clean(fields) });
    if (error) throw medicationError(error);
    if (typeof data !== 'string') throw new ServiceError('unknown', SAVE_ERROR);
    invalidateHealthMemory();
    return data;
  },
  async stop(recordId) {
    const { data, error } = await client().rpc('update_medication', { p_medication_id: recordId, p_fields: { status: 'stopped', end_date: today() } });
    if (error) throw medicationError(error);
    if (typeof data !== 'string') throw new ServiceError('unknown', SAVE_ERROR);
    invalidateHealthMemory();
    return data;
  },
  async remove(recordId) {
    const { error } = await client().rpc('remove_medication', { p_medication_id: recordId });
    if (error) throw medicationError(error);
    invalidateHealthMemory();
  },
};

const DEMO_STATUS = { active: 'active', as_needed: 'as_needed', stopped: 'past' } as const;
/** DEMO MODE ONLY: kept in memory for this session. */
export const demoMedicationService: MedicationService = {
  async add(fields) {
    if (!fields.name.trim()) throw new ServiceError('invalid_input', MESSAGES['the medicine name is required']);
    const c = clean(fields);
    const id = demoMedicationStore.add({ name: c.name, dosage: c.dose || undefined, frequency: c.frequency || undefined, duration: c.duration || undefined, instructions: c.instructions || undefined, prescribedBy: c.prescriber || undefined, status: DEMO_STATUS[fields.status ?? 'active'] });
    invalidateHealthMemory();
    return id;
  },
  async update(recordId, fields) {
    const c = clean(fields);
    const ok = demoMedicationStore.update(recordId, {
      ...(c.name !== undefined ? { name: c.name } : {}),
      ...(c.dose !== undefined ? { dosage: c.dose || undefined } : {}),
      ...(c.frequency !== undefined ? { frequency: c.frequency || undefined } : {}),
      ...(c.duration !== undefined ? { duration: c.duration || undefined } : {}),
      ...(c.instructions !== undefined ? { instructions: c.instructions || undefined } : {}),
      ...(c.prescriber !== undefined ? { prescribedBy: c.prescriber || undefined } : {}),
      ...(fields.status ? { status: DEMO_STATUS[fields.status] } : {}),
    });
    if (!ok) throw new ServiceError('invalid_input', 'Sample medicines can’t be changed in the demo. Add one of your own to try it.');
    invalidateHealthMemory();
    return recordId;
  },
  async stop(recordId) {
    return demoMedicationService.update(recordId, { status: 'stopped' });
  },
  async remove(recordId) {
    if (!demoMedicationStore.remove(recordId)) throw new ServiceError('invalid_input', 'Sample medicines can’t be removed in the demo.');
    invalidateHealthMemory();
  },
};

export const medicationService: MedicationService = isDemoMode ? demoMedicationService : productionMedicationService;
