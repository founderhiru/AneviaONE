/**
 * Google Sign-In client IDs (Google Cloud → APIs & Services → Credentials).
 * These are public OAuth client identifiers — they appear in every Google
 * sign-in request — not secrets. The client SECRET lives only in Supabase.
 *
 *   iOS client      — the native Google SDK signs in with it; its reversed
 *                     form is the app's URL scheme (app.json →
 *                     @react-native-google-signin/google-signin →
 *                     iosUrlScheme) so Google can return to the app.
 *   Web client      — passed as `webClientId` so Google issues an ID token
 *                     whose audience Supabase accepts.
 *
 * Both must be listed under Supabase → Authentication → Providers → Google
 * → Client IDs. Bundle ID: ai.healthintelligence.app.
 */
export const GOOGLE_IOS_CLIENT_ID = '962876896960-vlqdlnaq86tlf0dq3vuh5p56baekquk3.apps.googleusercontent.com';
export const GOOGLE_WEB_CLIENT_ID = '962876896960-iq6dknmd24iq6h4mncr5m07h5p12gg4t.apps.googleusercontent.com';
