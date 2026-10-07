import { isDemoMode, SUPABASE_ANON_KEY, SUPABASE_URL } from '../../config/appMode';

/**
 * Which sign-in methods the project's Supabase Auth has switched on, read
 * from its public settings endpoint (the same values the Dashboard's
 * Providers page shows). Read-only and anonymous: it changes nothing and
 * carries no session. Sign-in screens use it so a method that is switched
 * off isn't offered as if it worked.
 */
export type SignInMethods = { email: boolean; phone: boolean; google: boolean; apple: boolean };

const ALL: SignInMethods = { email: true, phone: true, google: true, apple: true };
const TIMEOUT_MS = 5000;

let cached: Promise<SignInMethods | null> | null = null;

async function fetchSignInMethods(): Promise<SignInMethods | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { external?: Record<string, unknown> };
    const on = (key: string) => body.external?.[key] === true;
    return { email: on('email'), phone: on('phone'), google: on('google'), apple: on('apple') };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves to the enabled methods, or null when they couldn't be read. */
export function getSignInMethods(): Promise<SignInMethods | null> {
  // Demo builds sign in with the mock service: every method is offered.
  if (isDemoMode) return Promise.resolve(ALL);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return Promise.resolve(null);
  if (!cached) {
    const attempt = fetchSignInMethods();
    cached = attempt;
    // A failed read isn't remembered: the next screen asks again.
    attempt.then((value) => {
      if (value === null && cached === attempt) cached = null;
    });
  }
  return cached;
}
