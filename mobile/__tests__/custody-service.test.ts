/**
 * The custody service talks to server functions only: the plan and the typed-name decision are
 * database calls, removing a person is an Edge Function, and every refusal gets a plain message.
 */
import { noticeText, productionCustodyService } from '../services/custody/custodyService';
import { getSupabaseClient } from '../services/supabaseClient';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(), isSupabaseConfigured: true }));

const PLAN = {
  subjects: [{ subject_id: 's1', name: 'Ravi', relationship: 'father', vault_files: 2, health_reports: '3', other_people_with_access: 1, legal_hold: false, delete_confirmed: false }],
  unresolved: 1,
  blocked_by_legal_hold: false,
};
const httpError = (status: number, error: string) => ({
  data: null,
  error: Object.assign(new Error('non-2xx'), { context: new Response(JSON.stringify({ error }), { status }) }),
});

function client(opts: { rpc?: unknown; invoke?: unknown; rows?: unknown } = {}) {
  const calls: { fn: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit', 'update', 'eq']) chain[m] = (...a: unknown[]) => (calls.push({ fn: m, args: a }), chain);
  chain.then = (resolve: (v: unknown) => unknown) => resolve(opts.rows ?? { data: [], error: null });
  (getSupabaseClient as jest.Mock).mockReturnValue({
    rpc: async (fn: string, args?: unknown) => (calls.push({ fn, args: [args] }), opts.rpc ?? { data: null, error: null }),
    functions: { invoke: async (fn: string, args: unknown) => (calls.push({ fn, args: [args] }), opts.invoke ?? { data: { status: 'removed' }, error: null }) },
    from: (t: string) => (calls.push({ fn: 'from', args: [t] }), chain),
  });
  return calls;
}

describe('productionCustodyService', () => {
  it('reads the caller\'s own deletion plan and maps it', async () => {
    const calls = client({ rpc: { data: PLAN, error: null } });
    const plan = await productionCustodyService.getPlan();
    expect(calls[0].fn).toBe('my_account_deletion_plan');
    expect(plan).toEqual({
      people: [{ subjectId: 's1', name: 'Ravi', relationship: 'father', vaultFiles: 2, healthReports: 3, otherPeopleWithAccess: 1, legalHold: false, deleteConfirmed: false }],
      unresolved: 1,
      blockedByLegalHold: false,
    });
  });

  it('records the decision only with the typed name, and explains a mismatch or a hold', async () => {
    const ok = client();
    await productionCustodyService.confirmDeletion('s1', 'Ravi');
    expect(ok[0]).toEqual({ fn: 'confirm_subject_deletion', args: [{ p_subject: 's1', p_typed_name: 'Ravi' }] });
    client({ rpc: { data: null, error: { message: 'the name does not match' } } });
    await expect(productionCustodyService.confirmDeletion('s1', 'x')).rejects.toMatchObject({ userMessage: expect.stringContaining('Type it exactly') });
    client({ rpc: { data: null, error: { message: 'this record is on hold and cannot be deleted' } } });
    await expect(productionCustodyService.confirmDeletion('s1', 'Ravi')).rejects.toMatchObject({ code: 'legal_hold' });
  });

  it('removes a person through the server function, never by touching tables or storage', async () => {
    const calls = client();
    await productionCustodyService.removePerson('s1');
    expect(calls.map((c) => c.fn)).toEqual(['remove-relative']);
    expect(calls[0].args).toEqual([{ body: { subject_id: 's1' } }]);
  });

  it('gives a plain reason when removal is refused, and never claims success', async () => {
    client({ invoke: httpError(409, 'has_health_reports') });
    await expect(productionCustodyService.removePerson('s1')).rejects.toMatchObject({ code: 'has_health_reports' });
    client({ invoke: httpError(409, 'legal_hold') });
    await expect(productionCustodyService.removePerson('s1')).rejects.toMatchObject({ code: 'legal_hold' });
    client({ invoke: httpError(502, 'storage_delete_failed') });
    await expect(productionCustodyService.removePerson('s1')).rejects.toMatchObject({ userMessage: expect.stringContaining('continues where it stopped') });
    client({ invoke: { data: { status: 'weird' }, error: null } });
    await expect(productionCustodyService.removePerson('s1')).rejects.toBeTruthy();
  });

  it('lists notices and marks one read; a failure just shows nothing', async () => {
    client({ rows: { data: [{ id: 'n1', code: 'access_ended_account_deleted', subject_name: 'Ravi', created_at: '2026-11-12T00:00:00Z', read_at: null }], error: null } });
    expect(await productionCustodyService.listNotices()).toEqual([{ id: 'n1', code: 'access_ended_account_deleted', subjectName: 'Ravi', createdAt: '2026-11-12T00:00:00Z', read: false }]);
    client({ rows: { data: null, error: { message: 'boom' } } });
    expect(await productionCustodyService.listNotices()).toEqual([]);
    const calls = client();
    await productionCustodyService.markNoticeRead('n1');
    expect(calls.some((c) => c.fn === 'update')).toBe(true);
  });

  it('words notices without health content', () => {
    expect(noticeText({ code: 'access_ended_account_deleted', subjectName: 'Ravi' })).toBe('Your access to Ravi’s records ended because an account was deleted.');
    expect(noticeText({ code: 'access_ended_person_removed', subjectName: null })).toBe('Your access to a person’s records ended because they were removed.');
  });
});
