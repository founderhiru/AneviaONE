/**
 * remove-relative — a person's custodian removes a relative they look after, with all their
 * records and files. Wiring only: all logic lives in ../_shared/person-removal/ and is
 * unit-tested there with fakes; the checks, notices and audit are tested in
 * supabase/tests/custody_test.sql.
 *
 * Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY — provided by Supabase.
 */

import { createClient } from '@supabase/supabase-js';

import { consoleLogger } from '../_shared/health-engine/log.ts';
import { createRemoveRelativeHandler } from '../_shared/person-removal/handler.ts';
import { supabasePersonRemovalDb, supabasePersonRemovalStorage } from '../_shared/person-removal/supabase-adapter.ts';
import { authenticateJwt, requiredEnv } from '../_shared/user-client.ts';

const admin = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(
  createRemoveRelativeHandler({
    authenticate: authenticateJwt,
    db: supabasePersonRemovalDb(admin),
    storage: supabasePersonRemovalStorage(admin),
    log: consoleLogger,
  }),
);
