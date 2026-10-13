/**
 * delete-account — a person deletes their account and everything in it.
 *
 * Wiring only: real Supabase (service role), Storage and Auth admin. All logic
 * lives in ../_shared/account-deletion/ and is unit-tested there with fakes;
 * the database side (begin, freeze, cascade, anonymous audit, isolation) is
 * tested in supabase/tests/account_deletion_test.sql.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — provided by Supabase.
 */

import { createClient } from '@supabase/supabase-js';

import { createDeleteAccountHandler } from '../_shared/account-deletion/handler.ts';
import { supabaseAccountDeletionAuth, supabaseAccountDeletionDb, supabaseAccountDeletionStorage } from '../_shared/account-deletion/supabase-adapter.ts';
import { consoleLogger } from '../_shared/health-engine/log.ts';

const required = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret ${name}`);
  return value;
};

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(
  createDeleteAccountHandler({
    auth: supabaseAccountDeletionAuth(admin),
    db: supabaseAccountDeletionDb(admin),
    storage: supabaseAccountDeletionStorage(admin),
    log: consoleLogger,
  }),
);
