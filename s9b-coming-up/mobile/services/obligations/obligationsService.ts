import { isDemoMode } from '../../config/appMode';
import { loadDemoServices } from '../demo/demoServices';
import { ServiceError, toServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';
import type { Obligation, ObligationKind, ObligationState } from './comingUp';

/**
 * Reminders for one person. Reads and writes go straight to `public.obligations`
 * (row security decides who may see or change them: owners and managers write,
 * viewers only read). The app can create only user-typed, open reminders; reminders
 * proposed from a report arrive later, from the server.
 */

export type NewObligation = {
  subjectId: string;
  kind: ObligationKind;
  title: string;
  dueOn: string;
};

export interface ObligationsService {
  /** Open reminders for a person. An account without people yet has none. */
  list(subjectId: string | null): Promise<Obligation[]>;
  add(input: NewObligation): Promise<Obligation>;
  markDone(id: string): Promise<void>;
  snooze(id: string, until: string): Promise<void>;
  dismiss(id: string): Promise<void>;
}

const LOAD_FAILED = 'We couldn’t load your reminders. Please try again.';
const SAVE_FAILED = 'That didn’t go through. Nothing was changed — please try again.';

type Row = {
  id: string;
  subject_id: string;
  kind: ObligationKind;
  title: string;
  due_on: string;
  source: 'user' | 'extracted';
  state: ObligationState;
  snoozed_until: string | null;
  source_page: number | null;
};

const COLUMNS = 'id, subject_id, kind, title, due_on, source, state, snoozed_until, source_page';

const fromRow = (r: Row): Obligation => ({
  id: r.id,
  subjectId: r.subject_id,
  kind: r.kind,
  title: r.title,
  dueOn: r.due_on,
  source: r.source,
  state: r.state,
  snoozedUntil: r.snoozed_until,
  sourcePage: r.source_page,
});

export const productionObligationsService: ObligationsService = {
  async list(subjectId) {
    if (!subjectId) return [];
    const client = getSupabaseClient();
    if (!client) return [];
    const { data, error } = await client
      .from('obligations')
      .select(COLUMNS)
      .eq('subject_id', subjectId)
      .eq('state', 'open')
      .order('due_on', { ascending: true })
      .limit(200);
    if (error) throw toServiceError(error, { code: 'unknown', userMessage: LOAD_FAILED, retryable: true });
    return ((data ?? []) as Row[]).map(fromRow);
  },

  async add({ subjectId, kind, title, dueOn }) {
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', SAVE_FAILED);
    const { data: session } = await client.auth.getSession();
    const me = session.session?.user.id;
    if (!me) throw new ServiceError('not_signed_in', SAVE_FAILED);
    const { data, error } = await client
      .from('obligations')
      .insert({ subject_id: subjectId, created_by: me, kind, title, due_on: dueOn, source: 'user', state: 'open' })
      .select(COLUMNS)
      .single();
    if (error || !data) throw toServiceError(error, { code: 'save_failed', userMessage: SAVE_FAILED, retryable: true });
    return fromRow(data as Row);
  },

  async markDone(id) {
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', SAVE_FAILED);
    const { error } = await client.from('obligations').update({ state: 'done' }).eq('id', id);
    if (error) throw toServiceError(error, { code: 'save_failed', userMessage: SAVE_FAILED, retryable: true });
  },

  async snooze(id, until) {
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', SAVE_FAILED);
    const { error } = await client.from('obligations').update({ snoozed_until: until }).eq('id', id);
    if (error) throw toServiceError(error, { code: 'save_failed', userMessage: SAVE_FAILED, retryable: true });
  },

  async dismiss(id) {
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', SAVE_FAILED);
    const { error } = await client.from('obligations').update({ state: 'dismissed' }).eq('id', id);
    if (error) throw toServiceError(error, { code: 'save_failed', userMessage: SAVE_FAILED, retryable: true });
  },
};

export const obligationsService: ObligationsService = isDemoMode ? loadDemoServices().obligations : productionObligationsService;
