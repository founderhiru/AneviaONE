/**
 * The production reminders service talks to `public.obligations` only, scopes every
 * read to one person, creates only user-typed open reminders, and never shows a raw
 * database message.
 */
import { productionObligationsService } from '../services/obligations/obligationsService';
import { ServiceError } from '../services/serviceError';
import { getSupabaseClient } from '../services/supabaseClient';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(), isSupabaseConfigured: true }));

const ROW = { id: 'o1', subject_id: 's1', kind: 'renewal', title: 'Renew policy', due_on: '2026-12-01', source: 'user', state: 'open', snoozed_until: null, source_page: null };

/** A chainable stand-in for the Supabase query builder that records what was asked. */
function fakeClient(result: { data?: unknown; error?: unknown }, userId: string | null = 'me') {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'insert', 'update']) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return chain;
    };
  }
  chain.single = async () => result;
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  const client = {
    auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }) },
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] });
      return chain;
    },
  };
  (getSupabaseClient as jest.Mock).mockReturnValue(client);
  return calls;
}

const called = (calls: { method: string; args: unknown[] }[], method: string) => calls.filter((c) => c.method === method).map((c) => c.args);

describe('productionObligationsService', () => {
  it('lists open reminders for one person only', async () => {
    const calls = fakeClient({ data: [ROW] });
    const list = await productionObligationsService.list('s1');
    expect(called(calls, 'from')).toEqual([['obligations']]);
    expect(called(calls, 'eq')).toEqual([['subject_id', 's1'], ['state', 'open']]);
    expect(list).toEqual([{ id: 'o1', subjectId: 's1', kind: 'renewal', title: 'Renew policy', dueOn: '2026-12-01', source: 'user', state: 'open', snoozedUntil: null, sourcePage: null }]);
  });

  it('has nothing to list before a person is chosen, without asking the database', async () => {
    const calls = fakeClient({ data: [ROW] });
    expect(await productionObligationsService.list(null)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('creates only a user-typed, open reminder, attributed to the signed-in person', async () => {
    const calls = fakeClient({ data: ROW });
    await productionObligationsService.add({ subjectId: 's1', kind: 'renewal', title: 'Renew policy', dueOn: '2026-12-01' });
    expect(called(calls, 'insert')[0][0]).toEqual({ subject_id: 's1', created_by: 'me', kind: 'renewal', title: 'Renew policy', due_on: '2026-12-01', source: 'user', state: 'open' });
  });

  it('refuses to add when nobody is signed in', async () => {
    fakeClient({ data: ROW }, null);
    await expect(productionObligationsService.add({ subjectId: 's1', kind: 'other', title: 'x', dueOn: '2026-12-01' })).rejects.toMatchObject({ code: 'not_signed_in' });
  });

  it('marks done, snoozes and dismisses by id with a single-field change', async () => {
    let calls = fakeClient({ error: null });
    await productionObligationsService.markDone('o1');
    expect(called(calls, 'update')).toEqual([[{ state: 'done' }]]);
    expect(called(calls, 'eq')).toEqual([['id', 'o1']]);

    calls = fakeClient({ error: null });
    await productionObligationsService.snooze('o1', '2026-11-18');
    expect(called(calls, 'update')).toEqual([[{ snoozed_until: '2026-11-18' }]]);

    calls = fakeClient({ error: null });
    await productionObligationsService.dismiss('o1');
    expect(called(calls, 'update')).toEqual([[{ state: 'dismissed' }]]);
  });

  it('shows a safe message, never the database error text', async () => {
    fakeClient({ error: { message: 'new row violates row-level security policy for table "obligations"', code: '42501' } });
    const error = await productionObligationsService.markDone('o1').catch((e) => e);
    expect(error).toBeInstanceOf(ServiceError);
    expect(error.userMessage).toMatch(/Nothing was changed/);
    expect(error.userMessage).not.toMatch(/row-level|obligations|42501/i);
  });

  it('does not crash when the backend is not configured', async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(null);
    expect(await productionObligationsService.list('s1')).toEqual([]);
    await expect(productionObligationsService.markDone('o1')).rejects.toMatchObject({ code: 'not_configured' });
  });
});
