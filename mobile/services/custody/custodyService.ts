import { isDemoMode } from '../../config/appMode';
import { ServiceError, toServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';
import { emitPeopleChanged } from '../people/activeSubject';

/**
 * Looking after other people's records: what an account is custodian of, the explicit decision to
 * delete a person (their name typed), removing a person, and short in-app notices when access ends.
 *
 * Nothing here transfers custody (not available yet) and nothing deletes silently: the server
 * refuses to delete an account that still answers for an undecided person, and a decision is only
 * recorded when the person's name is typed.
 */

export type CustodyPerson = {
  subjectId: string;
  name: string;
  relationship: string;
  vaultFiles: number;
  healthReports: number;
  otherPeopleWithAccess: number;
  legalHold: boolean;
  deleteConfirmed: boolean;
};

export type DeletionPlan = { people: CustodyPerson[]; unresolved: number; blockedByLegalHold: boolean };

export type AccountNotice = { id: string; code: 'access_ended_account_deleted' | 'access_ended_person_removed'; subjectName: string | null; createdAt: string; read: boolean };

export interface CustodyService {
  getPlan(): Promise<DeletionPlan>;
  /** Records the decision to delete this person; refused unless their name is typed. */
  confirmDeletion(subjectId: string, typedName: string): Promise<void>;
  cancelDeletion(subjectId: string): Promise<void>;
  /** Removes the person (their decision must already be recorded). */
  removePerson(subjectId: string): Promise<void>;
  listNotices(): Promise<AccountNotice[]>;
  markNoticeRead(id: string): Promise<void>;
}

export const noticeText = (n: Pick<AccountNotice, 'code' | 'subjectName'>): string => {
  const who = n.subjectName ?? 'a person';
  return n.code === 'access_ended_account_deleted'
    ? `Your access to ${who}’s records ended because an account was deleted.`
    : `Your access to ${who}’s records ended because they were removed.`;
};

const FAILED = 'That didn’t go through. Nothing was changed — please try again.';

type PlanJson = {
  subjects: { subject_id: string; name: string; relationship: string; vault_files: number; health_reports: number; other_people_with_access: number; legal_hold: boolean; delete_confirmed: boolean }[];
  unresolved: number;
  blocked_by_legal_hold: boolean;
};

/** The function's HTTP status and error code, if the failure was an HTTP response. */
async function functionError(error: unknown): Promise<string | null> {
  const response = (error as { context?: unknown })?.context;
  if (!(response instanceof Response)) return null;
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : null;
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new ServiceError('not_configured', 'This isn’t available right now.');
  return client;
}

export const productionCustodyService: CustodyService = {
  async getPlan() {
    const client = requireClient();
    const { data, error } = await client.rpc('my_account_deletion_plan');
    if (error || !data) throw toServiceError(error, { code: 'unknown', userMessage: 'We couldn’t load the people you look after. Please try again.', retryable: true });
    const plan = data as PlanJson;
    return {
      people: plan.subjects.map((s) => ({
        subjectId: s.subject_id,
        name: s.name,
        relationship: s.relationship,
        vaultFiles: Number(s.vault_files),
        healthReports: Number(s.health_reports),
        otherPeopleWithAccess: Number(s.other_people_with_access),
        legalHold: s.legal_hold,
        deleteConfirmed: s.delete_confirmed,
      })),
      unresolved: Number(plan.unresolved),
      blockedByLegalHold: plan.blocked_by_legal_hold,
    };
  },

  async confirmDeletion(subjectId, typedName) {
    const { error } = await requireClient().rpc('confirm_subject_deletion', { p_subject: subjectId, p_typed_name: typedName });
    if (!error) return;
    const message = String(error.message ?? '');
    if (/does not match/i.test(message)) throw new ServiceError('invalid_input', 'That doesn’t match their name. Type it exactly as shown.');
    if (/on hold/i.test(message)) throw new ServiceError('legal_hold', 'This record is on hold and can’t be deleted right now.');
    throw toServiceError(error, { code: 'unknown', userMessage: FAILED, retryable: true });
  },

  async cancelDeletion(subjectId) {
    const { error } = await requireClient().rpc('cancel_subject_deletion', { p_subject: subjectId });
    if (error) throw toServiceError(error, { code: 'unknown', userMessage: FAILED, retryable: true });
  },

  async removePerson(subjectId) {
    const { data, error } = await requireClient().functions.invoke('remove-relative', { body: { subject_id: subjectId } });
    if (!error && (data as { status?: string } | null)?.status === 'removed') {
      emitPeopleChanged();
      return;
    }
    const code = await functionError(error);
    if (code === 'has_health_reports') throw new ServiceError('has_health_reports', 'Delete their health reports first, then remove them.');
    if (code === 'legal_hold') throw new ServiceError('legal_hold', 'This record is on hold and can’t be deleted right now.');
    if (code === 'not_confirmed') throw new ServiceError('invalid_input', 'Type their name to confirm first.');
    throw toServiceError(error, { code: 'unknown', userMessage: 'We couldn’t finish removing this person. Please try again — it continues where it stopped.', retryable: true });
  },

  async listNotices() {
    const client = getSupabaseClient();
    if (!client) return [];
    const { data, error } = await client.from('account_notices').select('id, code, subject_name, created_at, read_at').order('created_at', { ascending: false }).limit(10);
    if (error || !data) return [];
    return (data as { id: string; code: AccountNotice['code']; subject_name: string | null; created_at: string; read_at: string | null }[]).map((n) => ({
      id: n.id,
      code: n.code,
      subjectName: n.subject_name,
      createdAt: n.created_at,
      read: n.read_at !== null,
    }));
  },

  async markNoticeRead(id) {
    const client = getSupabaseClient();
    if (!client) return;
    await client.from('account_notices').update({ read_at: new Date().toISOString() }).eq('id', id);
  },
};

/** Demo: nobody is looked after on the demo account, and there is nothing to remove. */
const demoCustodyService: CustodyService = {
  async getPlan() {
    return { people: [], unresolved: 0, blockedByLegalHold: false };
  },
  async confirmDeletion() {},
  async cancelDeletion() {},
  async removePerson() {},
  async listNotices() {
    return [];
  },
  async markNoticeRead() {},
};

export const custodyService: CustodyService = isDemoMode ? demoCustodyService : productionCustodyService;
