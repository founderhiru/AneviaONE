/**
 * "Needs review" and "N results added" must follow what the person has done
 * since the report was read. The run's counts are frozen at reading time; on
 * the iOS simulator, Home kept saying "1 Needs review" after the only held
 * result was confirmed. Counts now come from the live held rows (RLS).
 */
import { supabaseDocumentsService } from '../services/documents/supabaseDocumentsService';
import { getSupabaseClient } from '../services/supabaseClient';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn() }));

const DOC = '11111111-1111-4111-8111-111111111111';
const docRow = {
  id: DOC, user_id: 'u1', source: 'upload', document_type: 'lab_report', original_filename: 'r.pdf', mime_type: 'application/pdf',
  file_size_bytes: 1000, storage_path: `u1/documents/${DOC}/original.pdf`, status: 'completed', processing_error: null,
  failure_kind: null, identity_check: 'consistent', uploaded_at: '2026-10-13T07:00:00Z', created_at: '2026-10-13T07:00:00Z', updated_at: '2026-10-13T07:00:00Z',
};
// Read with 5 results, 1 held for checking.
const runRow = { document_id: DOC, facts_written: 5, facts_needs_review: 1, facts_duplicate: 0, completed_at: '2026-10-13T07:01:00Z' };

type Result = { data: unknown; error: unknown };
/** A query builder that is thenable at any point of the chain. */
function query(result: Result) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'is', 'order', 'lt', 'limit']) q[m] = jest.fn(() => q);
  q.then = (resolve: (r: Result) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}

function client(held: Record<string, { document_id: string; review_status: string }[]>, failHeld = false) {
  return {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } }) },
    from: jest.fn((table: string) => {
      if (table === 'documents') return query({ data: [docRow], error: null });
      if (table === 'extraction_runs') return query({ data: [runRow], error: null });
      if (failHeld) return query({ data: null, error: { message: 'offline' } });
      return query({ data: held[table] ?? [], error: null });
    }),
  };
}

async function listed(c: ReturnType<typeof client>) {
  (getSupabaseClient as jest.Mock).mockReturnValue(c);
  const [doc] = await supabaseDocumentsService.listDocuments();
  return { held: doc.heldForReviewCount, added: doc.healthInfoCount };
}

it('still held: 1 needs review, 4 added', async () => {
  expect(await listed(client({ observations: [{ document_id: DOC, review_status: 'unreviewed' }] }))).toEqual({ held: 1, added: 4 });
});

it('confirmed (or corrected): nothing held, 5 added', async () => {
  expect(await listed(client({}))).toEqual({ held: 0, added: 5 });
});

it('rejected: nothing held, and not counted as added', async () => {
  expect(await listed(client({ observations: [{ document_id: DOC, review_status: 'rejected' }] }))).toEqual({ held: 0, added: 4 });
});

it('held rows in any fact table count', async () => {
  expect(await listed(client({ medications: [{ document_id: DOC, review_status: 'unreviewed' }] }))).toEqual({ held: 1, added: 4 });
});

it('if the live read fails, the counts at reading time are kept (no false "all clear")', async () => {
  expect(await listed(client({}, true))).toEqual({ held: 1, added: 4 });
});
