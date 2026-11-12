/**
 * The production vault service talks to `vault_files` and the private `personal-vault`
 * bucket only, validates before uploading, cleans up a reservation when the upload fails,
 * deletes the file before its record, and never shows a raw backend message.
 */
import { productionVaultService, VAULT_BUCKET } from '../services/vault/vaultService';
import { getSupabaseClient } from '../services/supabaseClient';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(), isSupabaseConfigured: true }));
jest.mock('../services/documents/fileAccess', () => ({ readLocalFile: jest.fn(async () => new ArrayBuffer(2048)) }));
jest.mock('../services/vault/ownership', () => ({ isOwnRecordFor: jest.fn(() => true) }));

const ROW = { id: 'f1', subject_id: 's1', uploaded_by: 'me', category: 'identity', kind: 'Passport', title: 'Passport', original_filename: 'p.jpg', mime_type: 'image/jpeg', file_size_bytes: 2048, storage_path: 's1/files/f1/original.jpg', uploaded_at: '2026-11-11T00:00:00Z', created_at: '2026-11-11T00:00:00Z' };

type Calls = { method: string; args: unknown[] }[];

function fakeClient(opts: { invoke?: { data?: unknown; error?: unknown }; result?: { data?: unknown; error?: unknown }; upload?: { error: unknown } | null; remove?: { error: unknown }; signed?: { data?: unknown; error?: unknown } } = {}) {
  const calls: Calls = [];
  const result = opts.result ?? { data: ROW };
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'delete']) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return chain;
    };
  }
  chain.single = async () => result;
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ method: 'rpc', args: [fn, args] });
      return { data: null, error: null };
    },
    functions: {
      invoke: async (...a: unknown[]) => {
        calls.push({ method: 'invoke', args: a });
        return opts.invoke ?? { data: { status: 'deleted' }, error: null };
      },
    },
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
    from: (t: string) => {
      calls.push({ method: 'from', args: [t] });
      return chain;
    },
    storage: {
      from: (b: string) => {
        calls.push({ method: 'bucket', args: [b] });
        return {
          upload: async (...a: unknown[]) => {
            calls.push({ method: 'upload', args: a });
            return opts.upload ?? { error: null };
          },
          remove: async (...a: unknown[]) => {
            calls.push({ method: 'remove', args: a });
            return opts.remove ?? { error: null };
          },
          createSignedUrl: async (...a: unknown[]) => {
            calls.push({ method: 'sign', args: a });
            return opts.signed ?? { data: { signedUrl: 'https://signed.example/x' }, error: null };
          },
        };
      },
    },
  };
  (getSupabaseClient as jest.Mock).mockReturnValue(client);
  return calls;
}
const of = (calls: Calls, m: string) => calls.filter((c) => c.method === m).map((c) => c.args);
const input = { subjectId: 's1', category: 'identity' as const, title: 'Passport', file: { uri: 'file:///p.jpg', name: 'p.jpg', mimeType: 'image/jpeg', size: 2048, source: 'upload' as const } };

describe('productionVaultService', () => {
  it('lists stored files for one person, and nothing before a person is chosen', async () => {
    const calls = fakeClient({ result: { data: [ROW] } });
    const list = await productionVaultService.list('s1');
    expect(of(calls, 'from')).toEqual([['vault_files']]);
    expect(of(calls, 'eq')).toEqual([['subject_id', 's1'], ['status', 'stored']]);
    expect(list[0]).toMatchObject({ id: 'f1', title: 'Passport', category: 'identity', kind: 'Passport', storagePath: 's1/files/f1/original.jpg', addedBy: 'you' });
    const none = fakeClient();
    expect(await productionVaultService.list(null)).toEqual([]);
    expect(none).toHaveLength(0);
  });

  it('labels who added a file from the viewer\'s side, never by name', async () => {
    fakeClient({ result: { data: [{ ...ROW, id: 'a', uploaded_by: 'someone-else' }, { ...ROW, id: 'b', uploaded_by: null }, ROW] } });
    const list = await productionVaultService.list('s1');
    expect(list.map((f) => f.addedBy)).toEqual(['family_member', 'former_family_member', 'you']);
  });

  it('uploads in order: reserve, store at the assigned path, confirm', async () => {
    const calls = fakeClient();
    const file = await productionVaultService.upload(input);
    expect(file.id).toBe('f1');
    const order = calls.map((c) => c.method).filter((m) => ['insert', 'upload', 'update'].includes(m));
    expect(order).toEqual(['insert', 'upload', 'update']);
    expect(of(calls, 'bucket')[0]).toEqual([VAULT_BUCKET]);
    expect(of(calls, 'upload')[0][0]).toBe('s1/files/f1/original.jpg');
    expect(of(calls, 'update')[0]).toEqual([{ status: 'stored' }]);
  });

  it('refuses a bad file before anything is sent', async () => {
    const calls = fakeClient();
    await expect(productionVaultService.upload({ ...input, file: { ...input.file, name: 'x.exe', mimeType: 'application/x-msdownload' } })).rejects.toMatchObject({ code: 'invalid_file' });
    expect(calls).toHaveLength(0);
  });

  it('removes the reservation when the upload fails, with a safe message', async () => {
    const calls = fakeClient({ upload: { error: { message: 'secret backend detail' } } });
    await expect(productionVaultService.upload(input)).rejects.toMatchObject({ code: 'upload_failed' });
    await expect(productionVaultService.upload(input)).rejects.not.toThrow(/secret backend detail/);
    // the app can no longer delete storage objects or rows itself: the reservation is dropped through the database function
    expect(of(calls, 'rpc').some((a) => a[0] === 'vault_delete_file')).toBe(true);
    expect(of(calls, 'delete')).toHaveLength(0);
    expect(of(calls, 'remove')).toHaveLength(0);
  });

  it('rejects a path the server did not assign to this person', async () => {
    const calls = fakeClient({ result: { data: { ...ROW, storage_path: 'someone-else/files/f1/original.jpg' } } });
    await expect(productionVaultService.upload(input)).rejects.toBeTruthy();
    expect(of(calls, 'upload')).toHaveLength(0);
  });

  it('opens through a short-lived link', async () => {
    const calls = fakeClient();
    expect(await productionVaultService.openUrl({ id: 'f1', storagePath: 's1/files/f1/original.jpg' } as never)).toBe('https://signed.example/x');
    expect(of(calls, 'sign')[0]).toEqual(['s1/files/f1/original.jpg', 60]);
  });

  it('deletes through the server function only, never by touching storage or the table itself', async () => {
    const calls = fakeClient();
    await productionVaultService.remove({ id: 'f1', storagePath: 's1/files/f1/original.jpg' } as never);
    expect(of(calls, 'invoke')).toEqual([['delete-vault-file', { body: { file_id: 'f1' } }]]);
    expect(of(calls, 'remove')).toHaveLength(0);
    expect(of(calls, 'delete')).toHaveLength(0);
  });

  it('shows a safe message and does not claim success when the server could not delete', async () => {
    fakeClient({ invoke: { data: null, error: { message: 'secret backend detail' } } });
    await expect(productionVaultService.remove({ id: 'f1', storagePath: 'x' } as never)).rejects.toMatchObject({ userMessage: expect.stringContaining('couldn’t delete') });
    fakeClient({ invoke: { data: { status: 'something_else' }, error: null } });
    await expect(productionVaultService.remove({ id: 'f1', storagePath: 'x' } as never)).rejects.toBeTruthy();
  });

  it('reads the activity log for a person; an error means an empty list, never a failure', async () => {
    fakeClient({ result: { data: [{ id: 'x', action: 'added', entity_title: 'Passport', actor_role: 'manager', at: '2026-11-11T00:00:00Z' }] } });
    expect(await productionVaultService.listActivity('s1')).toEqual([{ id: 'x', action: 'added', title: 'Passport', actorRole: 'manager', at: '2026-11-11T00:00:00Z' }]);
    fakeClient({ result: { error: { message: 'denied' } } });
    expect(await productionVaultService.listActivity('s1')).toEqual([]);
    expect(await productionVaultService.listActivity(null)).toEqual([]);
  });
});
