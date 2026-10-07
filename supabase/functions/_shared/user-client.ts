/**
 * Supabase access AS THE CALLER — anon key + the caller's JWT — so Row Level
 * Security applies to every query. Used by health-memory and ask-health,
 * which only read the person's own trusted records.
 */
import { createClient } from '@supabase/supabase-js';

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret ${name}`);
  return value;
}

export function userClient(jwt: string) {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Verifies the JWT with Supabase Auth; returns the user id or null. */
export async function authenticateJwt(jwt: string): Promise<string | null> {
  const { data, error } = await userClient(jwt).auth.getUser(jwt);
  return error ? null : (data.user?.id ?? null);
}
