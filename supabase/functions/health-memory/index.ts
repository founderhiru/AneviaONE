/**
 * health-memory — Gate 2: Health Memory, Timeline, Trends and What Changed,
 * computed deterministically from the caller's trusted records (RLS).
 * Logic: ../_shared/health-memory/ (unit-tested there).
 */
import { consoleLogger } from '../_shared/health-engine/log.ts';
import { createHealthMemoryHandler } from '../_shared/health-memory/handler.ts';
import { supabaseRecordSource } from '../_shared/health-memory/records.ts';
import { authenticateJwt, userClient } from '../_shared/user-client.ts';

Deno.serve(
  createHealthMemoryHandler({
    authenticate: authenticateJwt,
    sourceFor: (jwt) => supabaseRecordSource(userClient(jwt)),
    log: consoleLogger,
  }),
);
