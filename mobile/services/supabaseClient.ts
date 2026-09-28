import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client factory.
 *
 * SECURITY: only the public anon key belongs here — never the service-role
 * key, and never in the mobile bundle. Values come from `app.json`'s
 * `extra` block (populated from environment variables at build/publish
 * time), never hard-coded. Session storage uses AsyncStorage for the
 * (non-sensitive) session token cache, as recommended by Supabase's
 * React Native guide, while anything more sensitive goes through
 * `expo-secure-store` in `services/auth/secureSession.ts`.
 */

type SupabaseExtra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as SupabaseExtra;

export const SUPABASE_URL = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

/** Returns the shared Supabase client, or `null` when not yet configured
 * (mock services fall back automatically — see `services/auth/authService.ts`). */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
