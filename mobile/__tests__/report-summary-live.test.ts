/**
 * The report screen's "N results added · M held back until checked" follows
 * confirmations and corrections made after reading. On the iOS simulator it
 * still said "1 held back" after the only held result was confirmed.
 */
import { supabaseProcessingService as processingService } from '../services/processing/processingService';
import { getSupabaseClient } from '../services/supabaseClient';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn() }));

const DOC = '22222222-2222-4222-8222-222222222222';
type Result = { data: unknown; error: unknown };
function query(result: Result) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit']) q[m] = jest.fn(() => q);
  q.maybeSingle = jest.fn(() => Promise.resolve(result));
  q.then = (resolve: (r: Result) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}
function client(held: Result) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'documents') return query({ data: { status: 'completed', failure_kind: null, processing_error: null, processing_attempts: 1, identity_check: 'consistent' }, error: null });
      if (table === 'extraction_runs') return query({ data: { facts_written: 5, facts_needs_review: 1, facts_duplicate: 0 }, error: null });
      return table === 'observations' ? query(held) : query({ data: [], error: null });
    }),
  };
}
const state = async (held: Result) => {
  (getSupabaseClient as jest.Mock).mockReturnValue(client(held));
  return processingService.getState(DOC);
};

it('still held: 4 added, 1 held back', async () => {
  expect(await state({ data: [{ document_id: DOC, review_status: 'unreviewed' }], error: null })).toMatchObject({ phase: 'ready', resultsAdded: 4, needsReview: 1 });
});

it('confirmed since: 5 added, nothing held back', async () => {
  expect(await state({ data: [], error: null })).toMatchObject({ phase: 'ready', resultsAdded: 5, needsReview: 0 });
});

it('live read fails: keeps the counts from reading time', async () => {
  expect(await state({ data: null, error: { message: 'offline' } })).toMatchObject({ resultsAdded: 4, needsReview: 1 });
});
