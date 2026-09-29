/**
 * APP MODE — the single switch between real and demo behaviour.
 *
 *   production (default) — real Supabase auth, real private document storage.
 *                          If Supabase is not configured the app shows a
 *                          "configuration required" screen. It NEVER falls
 *                          back to mock data or mock sign-in.
 *   demo                 — opt-in only (`EXPO_PUBLIC_APP_MODE=demo`): mock
 *                          sign-in (code 123456) and in-memory documents, for
 *                          UI review without a backend. A visible "Demo"
 *                          badge is shown so it can't be mistaken for the
 *                          real app.
 *
 * Kept separate from `config/brand.ts` (product naming) and from the backend.
 */

export type AppMode = 'production' | 'demo';

export type AppModeConfig = {
  mode: AppMode;
  /** True when both client-safe Supabase values are present. */
  supabaseConfigured: boolean;
  /** Set when production mode cannot run; shown on the configuration screen. */
  configurationError?: string;
};

export function resolveAppMode(env: {
  appMode?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}): AppModeConfig {
  const supabaseConfigured = Boolean(env.supabaseUrl?.trim() && env.supabaseAnonKey?.trim());
  const requested = env.appMode?.trim().toLowerCase();

  if (requested === 'demo') {
    return { mode: 'demo', supabaseConfigured };
  }

  if (requested && requested !== 'production') {
    return {
      mode: 'production',
      supabaseConfigured,
      configurationError: `Unknown EXPO_PUBLIC_APP_MODE "${env.appMode}". Use "production" or "demo".`,
    };
  }

  if (!supabaseConfigured) {
    return {
      mode: 'production',
      supabaseConfigured,
      configurationError:
        'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see mobile/.env.example), or set EXPO_PUBLIC_APP_MODE=demo for a demo build.',
    };
  }

  return { mode: 'production', supabaseConfigured };
}

// `process.env.EXPO_PUBLIC_*` must be referenced literally so Expo can inline
// the values at build time.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const APP_MODE: AppModeConfig = resolveAppMode({
  appMode: process.env.EXPO_PUBLIC_APP_MODE,
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
});

export const isDemoMode = APP_MODE.mode === 'demo';
