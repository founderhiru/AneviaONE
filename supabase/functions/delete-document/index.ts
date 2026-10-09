/**
 * delete-document — Phase B. A person deletes one of their documents.
 *
 * Wiring only: real Supabase (service role) and Storage. All logic lives in
 * ../_shared/document-deletion/ and is unit-tested there with fakes; the
 * database side (ownership, source integrity, audit) is tested in
 * supabase/tests/document_deletion_test.sql.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — provided by Supabase.
 */

import { createClient } from '@supabase/supabase-js';

import { createDeleteDocumentHandler } from '../_shared/document-deletion/handler.ts';
import { supabaseDeletionDb, supabaseDeletionStorage } from '../_shared/document-deletion/supabase-adapter.ts';
import { consoleLogger } from '../_shared/health-engine/log.ts';
import { supabaseAuthenticate } from '../_shared/health-engine/supabase-adapter.ts';

const required = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret ${name}`);
  return value;
};

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(
  createDeleteDocumentHandler({
    authenticate: supabaseAuthenticate(admin),
    db: supabaseDeletionDb(admin),
    storage: supabaseDeletionStorage(admin),
    log: consoleLogger,
  }),
);
