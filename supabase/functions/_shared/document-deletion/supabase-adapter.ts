/** delete-document on real Supabase (service role): the engine RPCs and the Storage API. */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { BeginResult, DeletionDb, DeletionStorage } from './handler.ts';

export const DERIVATIVES_BUCKET = 'document-derivatives';
/** Server-generated derivative folders (see migration 20261001090100). */
const DERIVATIVE_FOLDERS = ['pages', 'runs'];

function ensure<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}_failed`);
  return result.data;
}

export function supabaseDeletionDb(admin: SupabaseClient): DeletionDb {
  return {
    async begin(documentId, userId) {
      return ensure(await admin.rpc('engine_begin_document_deletion', { p_document_id: documentId, p_user_id: userId }), 'begin') as BeginResult;
    },
    async finish(documentId, userId) {
      const r = ensure(await admin.rpc('engine_delete_document', { p_document_id: documentId, p_user_id: userId }), 'finish') as {
        facts_removed: number;
        facts_kept: number;
      };
      return { facts_removed: r.facts_removed, facts_kept: r.facts_kept };
    },
  };
}

export function supabaseDeletionStorage(admin: SupabaseClient): DeletionStorage {
  return {
    // Removing an object that is already gone succeeds (empty result), so retries are safe.
    async removeObject(bucket, path) {
      ensure(await admin.storage.from(bucket).remove([path]), 'storage_remove');
    },
    async removeDerivatives(folder) {
      for (const sub of DERIVATIVE_FOLDERS) {
        for (;;) {
          const listed = ensure(await admin.storage.from(DERIVATIVES_BUCKET).list(`${folder}${sub}`, { limit: 100 }), 'storage_list') ?? [];
          const names = listed.filter((o) => o.id !== null).map((o) => `${folder}${sub}/${o.name}`);
          if (names.length === 0) break;
          ensure(await admin.storage.from(DERIVATIVES_BUCKET).remove(names), 'storage_remove');
        }
      }
    },
  };
}
