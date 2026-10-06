import 'react-native-url-polyfill/auto';
// Secure randomness for the PKCE code verifier — must load before the client.
import './auth/secureRandom';
import { AppState, type AppStateStatus } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { APP_MODE, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/appMode';
import { secureStorageAdapter } from './auth/secureStorageAdapter';

/**
 * Supabase client factory.
 *
 * SECURITY: only the client-safe project URL and anon (publishable) key
 * belong in the app. Every table and the document bucket are protected by
 * Row Level Security (see /supabase/migrations), so this key alone grants a
 * caller nothing beyond their own signed-in data. The service-role key and
 * any AI provider keys must NEVER be added here — they live only in
 * server-side Edge Function secrets.
 *
 * The session (access + refresh token) is persisted in the Keychain /
 * Keystore through `secureStorageAdapter`, so sign-in survives app restarts.
 */

export const isSupabaseConfigured = APP_MODE.supabaseConfigured;

let client: SupabaseClient | null = null;
let appStateSubscribed = false;

/** Returns the shared Supabase client, or `null` in demo mode / when not
 * configured (production mode then shows a configuration screen instead of
 * silently falling back to mock data). */
export function getSupabaseClient(): SupabaseClient | null {
  if (APP_MODE.mode !== 'production' || !isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: secureStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // PKCE for every flow that starts from this client (email codes,
        // account linking). Google sign-in deliberately uses Supabase's
        // implicit flow instead — see googleImplicitAuthorizeUrl in
        // services/auth/supabaseAuthService.ts.
        flowType: 'pkce',
      },
    });
    subscribeToAppState(client);
  }
  return client;
}

/** Refresh tokens only while the app is in the foreground (Supabase's
 * recommended React Native setup); on resume, the session is refreshed. */
function subscribeToAppState(supabase: SupabaseClient) {
  if (appStateSubscribed) return;
  appStateSubscribed = true;
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
