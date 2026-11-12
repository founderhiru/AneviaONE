/**
 * delete-vault-file — a person's controller, or the family member who uploaded a document,
 * deletes it. Wiring only: all logic lives in ../_shared/vault-deletion/ and is unit-tested
 * there with fakes; the permission rules, audit and activity log are tested in
 * supabase/tests/vault_files_test.sql.
 *
 * Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY — provided by Supabase.
 */

import { createClient } from '@supabase/supabase-js';

import { consoleLogger } from '../_shared/health-engine/log.ts';
import { authenticateJwt, requiredEnv } from '../_shared/user-client.ts';
import { createDeleteVaultFileHandler } from '../_shared/vault-deletion/handler.ts';
import { supabaseVaultDeletionDb, supabaseVaultDeletionStorage } from '../_shared/vault-deletion/supabase-adapter.ts';

const admin = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(
  createDeleteVaultFileHandler({
    authenticate: authenticateJwt,
    db: supabaseVaultDeletionDb(),
    storage: supabaseVaultDeletionStorage(admin),
    log: consoleLogger,
  }),
);
