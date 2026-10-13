/** delete-account on real Supabase (service role): the engine RPC, the Storage API and the Auth admin API. */

import type { SupabaseClient } from '@supabase/supabase-js';

import { lastSignInFromJwt, type AccountDeletionAuth, type AccountDeletionDb, type AccountDeletionStorage, type BeginResult } from './handler.ts';

/** Every bucket that holds a person's files, all under `<user id>/`. */
export const ACCOUNT_BUCKETS = ['medical-documents', 'document-derivatives'] as const;
const PAGE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function supabaseAccountDeletionDb(admin: SupabaseClient): AccountDeletionDb {
  return {
    async begin(userId) {
      const { data, error } = await admin.rpc('engine_begin_account_deletion', { p_user_id: userId });
      if (error) throw new Error('begin_failed');
      return data as BeginResult;
    },
  };
}

/** Every object path under `<prefix>` in one bucket (folders are walked). */
async function listAll(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
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
  const own = (userId: string) => {
    if (!UUID.test(userId)) throw new Error('invalid_user');
    return userId.toLowerCase();
  };
  return {
    async removeAllUnder(userId) {
      const prefix = own(userId);
      let removed = 0;
      for (const bucket of ACCOUNT_BUCKETS) {
        const paths = await listAll(admin, bucket, prefix);
        // Defence in depth: only this person's folder, never anything else.
        if (paths.some((p) => !p.startsWith(`${prefix}/`) || p.includes('..'))) throw new Error('unexpected_path');
        for (let i = 0; i < paths.length; i += PAGE) {
          const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + PAGE));
          if (error) throw new Error('storage_remove_failed');
        }
        removed += paths.length;
      }
      return removed;
    },
    async countUnder(userId) {
      const prefix = own(userId);
      let total = 0;
      for (const bucket of ACCOUNT_BUCKETS) total += (await listAll(admin, bucket, prefix)).length;
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
