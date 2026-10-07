import * as Linking from 'expo-linking';

/**
 * Where an email sign-in link returns to: this app, never a website.
 *
 * Supabase sends people back to `emailRedirectTo` after they tap the link
 * in a sign-in email. Without it, Supabase falls back to the project's Site
 * URL (by default http://localhost:3000 — the "connection refused" page).
 * The address is built from the app's own URL scheme (app.json `scheme`),
 * so it is `healthintelligence://auth-callback` in development builds and
 * production alike (and the Expo Go equivalent when run there). It must be
 * listed under Supabase → Authentication → URL Configuration → Redirect URLs.
 *
 * The link lands on app/(auth)/auth-callback.tsx, which completes sign-in.
 */
export const EMAIL_LINK_PATH = 'auth-callback';

export function emailLinkRedirect(): string {
  return Linking.createURL(EMAIL_LINK_PATH);
}
