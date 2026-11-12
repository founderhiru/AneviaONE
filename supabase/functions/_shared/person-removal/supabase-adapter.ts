/** remove-relative on real Supabase (service role): the engine RPCs and the Storage API. */

import type { SupabaseClient } from '@supabase/supabase-js';

import { listAll } from '../account-deletion/supabase-adapter.ts';
import type { BeginResult, PersonRemovalDb, PersonRemovalStorage } from './handler.ts';

const VAULT = 'personal-vault';
const PAGE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function supabasePersonRemovalDb(admin: SupabaseClient): PersonRemovalDb {
  return {
    async begin(subjectId, userId) {
      const { data, error } = await admin.rpc('engine_begin_subject_removal', { p_subject: subjectId, p_user_id: userId });
      if (error || !data) throw new Error('begin_failed');
      return data as BeginResult;
    },
    async finish(subjectId, userId) {
      const { error } = await admin.rpc('engine_finish_subject_removal', { p_subject: subjectId, p_user_id: userId });
      if (error) throw new Error('finish_failed');
    },
  };
}

export function supabasePersonRemovalStorage(admin: SupabaseClient): PersonRemovalStorage {
  const folder = (subjectId: string) => {
    if (!UUID.test(subjectId)) throw new Error('invalid_id');
    return subjectId.toLowerCase();
  };
  return {
    async removeAll(subjectId) {
      const prefix = folder(subjectId);
      const paths = await listAll(admin, VAULT, prefix);
      // Defence in depth: only this person's folder, never anything else.
      if (paths.some((p) => !p.startsWith(`${prefix}/`) || p.includes('..'))) throw new Error('unexpected_path');
      for (let i = 0; i < paths.length; i += PAGE) {
        const { error } = await admin.storage.from(VAULT).remove(paths.slice(i, i + PAGE));
        if (error) throw new Error('storage_remove_failed');
      }
      return paths.length;
    },
    async count(subjectId) {
      return (await listAll(admin, VAULT, folder(subjectId))).length;
    },
  };
}
