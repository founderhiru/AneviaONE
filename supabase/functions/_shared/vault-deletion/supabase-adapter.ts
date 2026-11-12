/** delete-vault-file on real Supabase: permission and the row delete run AS THE CALLER (RLS and
 *  the database's own checks apply); only the Storage removal uses the service role. */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { VaultCheck, VaultDeletionDb, VaultDeletionStorage } from './handler.ts';
import { userClient } from '../user-client.ts';

export function supabaseVaultDeletionDb(): VaultDeletionDb {
  return {
    async check(jwt, fileId): Promise<VaultCheck> {
      const { data, error } = await userClient(jwt).rpc('vault_delete_check', { p_file: fileId });
      if (error) {
        // 42501 = not yours / not found (the database does not say which).
        if (error.code === '42501') return { status: 'not_found' };
        throw new Error('check_failed');
      }
      return typeof data === 'string' && data ? { status: 'ok', storage_path: data } : { status: 'not_found' };
    },
    async finish(jwt, fileId) {
      const { error } = await userClient(jwt).rpc('vault_delete_file', { p_file: fileId });
      if (error) throw new Error('finish_failed');
    },
  };
}

export function supabaseVaultDeletionStorage(admin: SupabaseClient): VaultDeletionStorage {
  return {
    // Removing an object that is already gone succeeds, so retries are safe.
    async removeObject(bucket, path) {
      const { error } = await admin.storage.from(bucket).remove([path]);
      if (error) throw new Error('storage_remove_failed');
    },
  };
}
