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

const ROW = { id: 'f1', subject_id: 's1', category: 'identity', title: 'Passport', original_filename: 'p.jpg', mime_type: 'image/jpeg', file_size_bytes: 2048, storage_path: 'me/files/f1/original.jpg', uploaded_at: '2026-11-11T00:00:00Z', created_at: '2026-11-11T00:00:00Z' };

type Calls = { method: string; args: unknown[] }[];

function fakeClient(opts: { result?: { data?: unknown; error?: unknown }; upload?: { error: unknown } | null; remove?: { error: unknown }; signed?: { data?: unknown; error?: unknown } } = {}) {
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
    expect(list[0]).toMatchObject({ id: 'f1', title: 'Passport', category: 'identity', storagePath: 'me/files/f1/original.jpg' });
    const none = fakeClient();
    expect(await productionVaultService.list(null)).toEqual([]);
    expect(none).toHaveLength(0);
  });

  it('uploads in order: reserve, store at the assigned path, confirm', async () => {
    const calls = fakeClient();
    const file = await productionVaultService.upload(input);
    expect(file.id).toBe('f1');
    const order = calls.map((c) => c.method).filter((m) => ['insert', 'upload', 'update'].includes(m));
    expect(order).toEqual(['insert', 'upload', 'update']);
    expect(of(calls, 'bucket')[0]).toEqual([VAULT_BUCKET]);
    expect(of(calls, 'upload')[0][0]).toBe('me/files/f1/original.jpg');
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
    expect(of(calls, 'remove').length).toBeGreaterThan(0);
    expect(of(calls, 'delete').length).toBeGreaterThan(0);
  });

  it('rejects a path the server did not assign to this person', async () => {
    const calls = fakeClient({ result: { data: { ...ROW, storage_path: 'someone-else/files/f1/original.jpg' } } });
    await expect(productionVaultService.upload(input)).rejects.toBeTruthy();
    expect(of(calls, 'upload')).toHaveLength(0);
  });

  it('opens through a short-lived link', async () => {
    const calls = fakeClient();
    expect(await productionVaultService.openUrl({ id: 'f1', storagePath: 'me/files/f1/original.jpg' } as never)).toBe('https://signed.example/x');
    expect(of(calls, 'sign')[0]).toEqual(['me/files/f1/original.jpg', 60]);
  });

  it('deletes the file before its record, and keeps the record if the file could not be removed', async () => {
    const calls = fakeClient();
    await productionVaultService.remove({ id: 'f1', storagePath: 'me/files/f1/original.jpg' } as never);
    const order = calls.map((c) => c.method).filter((m) => m === 'remove' || m === 'delete');
    expect(order).toEqual(['remove', 'delete']);

    const failing = fakeClient({ remove: { error: { message: 'boom' } } });
    await expect(productionVaultService.remove({ id: 'f1', storagePath: 'x' } as never)).rejects.toMatchObject({ userMessage: expect.stringContaining('hasn’t been removed') });
    expect(of(failing, 'delete')).toHaveLength(0);
  });
});
