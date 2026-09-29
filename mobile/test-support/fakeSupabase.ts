/**
 * Minimal in-memory stand-in for the parts of supabase-js the services use,
 * so service logic can be unit-tested without a network. Records every
 * table call in order; responses are queued per operation.
 *
 * (Database-level security is tested for real in supabase/tests.)
 */

type Response = { data?: unknown; error?: unknown };
type Operation = 'select' | 'insert' | 'update' | 'delete';

export type RecordedCall = {
  table: string;
  op: Operation;
  payload?: unknown;
  filters: [string, string, unknown][];
};

export const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';

export function createFakeSupabase(options: { userId?: string | null } = {}) {
  const userId = options.userId === undefined ? TEST_USER_ID : options.userId;
  const calls: RecordedCall[] = [];
  const queues: Record<Operation, Response[]> = { select: [], insert: [], update: [], delete: [] };

  const storageBucket = {
    upload: jest.fn(async (_path: string, _body: unknown, _opts?: unknown): Promise<Response> => ({ data: { path: _path }, error: null })),
    remove: jest.fn(async (_paths: string[]): Promise<Response> => ({ data: [], error: null })),
    createSignedUrl: jest.fn(async (path: string, ttl: number): Promise<Response> => ({
      data: { signedUrl: `https://project.supabase.co/storage/v1/object/sign/medical-documents/${path}?token=t&ttl=${ttl}` },
      error: null,
    })),
    getPublicUrl: jest.fn(),
  };

  const client = {
    calls,
    storageBucket,
    storage: { from: jest.fn((_bucket: string) => storageBucket) },
    auth: {
      getSession: jest.fn(async () => ({ data: { session: userId ? { user: { id: userId } } : null } })),
    },
    /** Queue the response for the next `op` call on any table. */
    respond(op: Operation, response: Response) {
      queues[op].push(response);
    },
    from(table: string) {
      const call: RecordedCall = { table, op: 'select', filters: [] };
      const builder = {
        select: () => builder,
        insert: (payload: unknown) => ((call.op = 'insert'), (call.payload = payload), builder),
        update: (payload: unknown) => ((call.op = 'update'), (call.payload = payload), builder),
        delete: () => ((call.op = 'delete'), builder),
        eq: (column: string, value: unknown) => (call.filters.push(['eq', column, value]), builder),
        neq: (column: string, value: unknown) => (call.filters.push(['neq', column, value]), builder),
        lt: (column: string, value: unknown) => (call.filters.push(['lt', column, value]), builder),
        order: () => builder,
        limit: () => builder,
        single: () => builder,
        maybeSingle: () => builder,
        then<T>(resolve: (value: Response) => T, reject?: (reason: unknown) => T) {
          calls.push(call);
          const response = queues[call.op].shift() ?? { data: null, error: null };
          return Promise.resolve(response).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return client;
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;

/** Bytes of a tiny but valid-looking PDF. */
export function pdfBytes(size = 2048): ArrayBuffer {
  const bytes = new Uint8Array(size);
  const header = '%PDF-1.7\n';
  for (let i = 0; i < header.length; i++) bytes[i] = header.charCodeAt(i);
  return bytes.buffer;
}

export function documentRow(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) ?? '22222222-2222-4222-8222-222222222222';
  const userId = (overrides.user_id as string) ?? TEST_USER_ID;
  return {
    id,
    user_id: userId,
    source: 'upload',
    document_type: 'unclassified',
    original_filename: 'blood-test.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 2048,
    storage_path: `${userId}/documents/${id}/original.pdf`,
    status: 'pending_upload',
    processing_error: null,
    uploaded_at: null,
    created_at: '2026-09-29T10:00:00.000Z',
    updated_at: '2026-09-29T10:00:00.000Z',
    ...overrides,
  };
}
