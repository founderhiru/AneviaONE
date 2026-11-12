/** delete-account on real Supabase (service role): the engine RPC, the Storage API and the Auth admin API. */

import type { SupabaseClient } from '@supabase/supabase-js';

import { lastSignInFromJwt, type AccountDeletionAuth, type AccountDeletionDb, type AccountDeletionStorage, type BeginResult, type DeletionPlan } from './handler.ts';

/** Every bucket that holds files: health buckets are keyed `<user id>/`; the vault is keyed `<subject id>/` (and a legacy `<user id>/`). */
export const ACCOUNT_BUCKETS = ['medical-documents', 'document-derivatives', 'personal-vault'] as const;
/** The bucket keyed by PERSON (<subject_id>/...), not by account. */
const PERSON_BUCKET = 'personal-vault';
const PAGE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function supabaseAccountDeletionDb(admin: SupabaseClient): AccountDeletionDb {
  return {
    async plan(userId) {
      const { data, error } = await admin.rpc('engine_account_deletion_plan', { p_user_id: userId });
      if (error || !data) throw new Error('plan_failed');
      return data as DeletionPlan;
    },
    async finishCustody(userId) {
      const { data, error } = await admin.rpc('engine_finish_account_custody', { p_user_id: userId });
      if (error || !data) throw new Error('custody_finish_failed');
      return data as { status: 'ok' | 'custody_unresolved' | 'legal_hold' };
    },
    async begin(userId) {
      const { data, error } = await admin.rpc('engine_begin_account_deletion', { p_user_id: userId });
      if (error) throw new Error('begin_failed');
      return data as BeginResult;
    },
  };
}

/** Every object path under `<prefix>` in one bucket (folders are walked). */
export async function listAll(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  const folders = [prefix];
  while (folders.length) {
    const folder = folders.pop()!;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: PAGE, offset });
      if (error) throw new Error('storage_list_failed');
      for (const entry of data ?? []) {
        // Storage lists folders as entries without an id.
        if (entry.id === null) folders.push(`${folder}/${entry.name}`);
        else files.push(`${folder}/${entry.name}`);
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return files;
}

export function supabaseAccountDeletionStorage(admin: SupabaseClient): AccountDeletionStorage {
  const valid = (id: string) => {
    if (!UUID.test(id)) throw new Error('invalid_id');
    return id.toLowerCase();
  };
  /** Where a person's files can be: their own folder in every bucket, plus each person's folder in the vault. */
  const places = (userId: string, subjectIds: string[]): { bucket: string; prefix: string }[] => {
    const own = valid(userId);
    const subjects = [...new Set(subjectIds.map(valid))];
    return ACCOUNT_BUCKETS.flatMap((bucket) => [
      { bucket, prefix: own },
      ...(bucket === PERSON_BUCKET ? subjects.map((prefix) => ({ bucket, prefix })) : []),
    ]);
  };
  return {
    async removeAllUnder(userId, subjectIds) {
      let removed = 0;
      for (const { bucket, prefix } of places(userId, subjectIds)) {
        const paths = await listAll(admin, bucket, prefix);
        // Defence in depth: only the folders named above, never anything else.
        if (paths.some((p) => !p.startsWith(`${prefix}/`) || p.includes('..'))) throw new Error('unexpected_path');
        for (let i = 0; i < paths.length; i += PAGE) {
          const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + PAGE));
          if (error) throw new Error('storage_remove_failed');
        }
        removed += paths.length;
      }
      return removed;
    },
    async countUnder(userId, subjectIds) {
      let total = 0;
      for (const { bucket, prefix } of places(userId, subjectIds)) total += (await listAll(admin, bucket, prefix)).length;
      return total;
    },
  };
}

export function supabaseAccountDeletionAuth(admin: SupabaseClient): AccountDeletionAuth {
  return {
    async authenticate(jwt) {
      // getUser verifies the token with Auth; only then are its claims read.
      const { data, error } = await admin.auth.getUser(jwt);
      if (error || !data.user) return null;
      return { userId: data.user.id, lastSignInAt: lastSignInFromJwt(jwt) };
    },
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId, false);
      // Already gone (a retry after success) is success.
      if (error && (error as { status?: number }).status !== 404) throw new Error('user_delete_failed');
    },
  };
}
