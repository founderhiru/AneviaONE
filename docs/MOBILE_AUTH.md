# Mobile Auth

Authentication strategy, per spec sections 5/8: **Mobile OTP is the
primary signup/login path**, Google OAuth is secondary, and both must
resolve to a single account via identity linking rather than creating
duplicate Health Memories.

## Why Mobile OTP is primary

Product direction (explicit): Mobile OTP is better suited to an
India-first consumer health product than email/password. Google is
offered as a faster secondary option for people who prefer it. There is
no password flow. Email one-time code is also offered, and is the only
method that works before an SMS provider is configured.

## Screens

- `(auth)/welcome` — sign-in entry points (`components/AuthOptions.tsx`):
  "Continue with Mobile" (→ `/login?method=mobile`, primary), "Continue
  with Google" (→ `/login?method=google`) and, on iOS where available,
  Apple's system "Continue with Apple" button (→ `/login?method=apple`);
  then "Explore <wordmark>" (→ `/explore`, a static sample history that needs
  no sign-in). The same `AuthOptions` appear in Explore's "Make it yours"
  panels and on `/explore/make-it-yours`. Email is not offered; the
  `?method=email` branch of `login` still exists but nothing links to it.
- `(auth)/login` — branches on `?method`:
  - **mobile** (default): phone number input, validated to 10 digits
    before "Send OTP" is enabled, then pushes to `/otp` with the number.
  - **google**: a single explanatory screen + "Continue with Google"
    button.
  - **apple**: explanatory screen + Apple's system button →
    `authService.signInWithApple()`. Shown only where
    `isAppleSignInAvailable()` (iOS + `AppleAuthentication.isAvailableAsync()`).
- `(auth)/otp` — 6-digit code entry (`OtpInput`), auto-verifies once 6
  digits are entered, plus an explicit "Verify" button and "Resend code".
  Shows an inline error for an incorrect code.
- `(auth)/onboarding` — 4 steps ending in the first Add Record prompt (or
  skip straight to Home).

## Service boundary

`services/auth/authTypes.ts` defines the `AuthService` interface. Screens
call only `authService` (`services/auth/authService.ts`), never Supabase
directly:

```ts
export const authService: AuthService = isDemoMode ? mockAuthService : supabaseAuthService;
```

The mode comes from `config/appMode.ts` (`EXPO_PUBLIC_APP_MODE`, default
`production`). **Production never falls back to the mock**: if the Supabase
values are missing, the root layout shows a "not configured" screen. The mock
is used only in explicit demo mode, which shows a "DEMO · sample data" badge.
Full flow: `MOBILE_PHASE1_INTEGRATION.md`.

### Mock implementation (`mockAuthService.ts`) — demo mode only

- Isolated in its own file and clearly commented as such.
- `MOCK_OTP = '123456'` — an obviously-fake fixed code; it never claims to
  send a real OTP.
- Google mock never fabricates a real Google identity token — it simulates
  the UX/timing only, using a fixed placeholder email
  (`demo.reviewer@gmail.com`).
- Session is cached via `expo-secure-store` (`secureSession.ts`) — for the
  mock flow only, never for real credentials or tokens.

### Real implementation (`supabaseAuthService.ts`)

- Phone OTP via Supabase Auth's `signInWithOtp({ phone })` /
  `verifyOtp({ phone, token, type: 'sms' })`. Supabase owns OTP generation,
  delivery, and verification — this app never generates or stores an OTP
  itself.
- Email one-time code (no password) via `signInWithOtp({ email })` /
  `verifyOtp({ email, token, type: 'email' })` — works without an SMS provider.
- Google OAuth via `signInWithOAuth({ provider: 'google', options: { skipBrowserRedirect: true } })`
  + `expo-web-browser`'s `openAuthSessionAsync`, then PKCE
  `exchangeCodeForSession(code)` (redirect URI from `expo-auth-session`'s
  `makeRedirectUri({ scheme: 'healthintelligence' })`). Not yet verified end to end.
- Sign in with Apple (iOS, native): `expo-apple-authentication` shows the
  system sheet (scopes: name, email) with a SHA-256-hashed random nonce
  (`services/auth/appleAuth.ts`); the identity token and raw nonce go to
  `signInWithIdToken({ provider: 'apple', token, nonce })`. Same auth user +
  `profiles` row (trigger) as other methods. Apple sends the name only on the
  first authorisation, so it is saved then (`user_metadata.full_name`, and
  `profiles.display_name` if empty). "Hide My Email" relay addresses are kept
  as the account email but shown as "Email hidden by Apple". Linking uses
  `linkIdentity({ provider: 'apple', token, nonce })` (manual linking must be
  on). **External setup still required** — see "Apple setup" below.
- Session persisted in the Keychain/Keystore (`secureStorageAdapter.ts`),
  never plain AsyncStorage; refreshed only while the app is in the foreground.
- If the session expires or is revoked, the app returns to Welcome and says
  so ("Your session has expired…").
- User-facing error messages are always safe text, never raw backend errors.

## Account linking (single Health Memory per person)

The critical requirement is that a person who signs up with Mobile OTP and
later also signs in with Google ends up as **one** account with one Health
Memory, not two. This is handled via Supabase's identity linking:

- `AuthService.linkIdentity(provider)` calls `client.auth.linkIdentity({ provider: 'google' })`
  on the **currently signed-in** session, which attaches the new identity
  to the existing Supabase user rather than creating a new one.
- This requires **manual linking to be enabled** in the Supabase project's
  Auth settings (off by default) — noted here as a setup requirement, not
  yet something this skeleton can configure itself since there is no
  Supabase project connected.
- The mock implementation mirrors the same contract for UI development:
  `mockAuthService.linkIdentity` appends to the same cached user's
  `linkedIdentities` array rather than replacing it.

`User.linkedIdentities` (`types/user.ts`) is an array of
`{ provider, displayValue, linkedAt }`, so `Me` and other screens can
display all linked identities on one account (`Me` currently surfaces the
mobile identity, falling back to whichever identity is linked first).

There is no UI screen yet that *offers* "Link your Google account" to an
already-mobile-OTP user (or vice versa) — the service method exists and is
tested at the type level, but wiring an entry point for it (likely from
`Me`) is follow-up work once a real Supabase project exists to verify the
linking flow against.

## Session

`hooks/useAuth.tsx` exposes `AuthProvider`/`useAuth()`, backed by
`authService.getCurrentUser()` on mount and `refreshUser()` after
sign-in/OTP-verify/sign-out. The root layout's redirect effect
(`MOBILE_NAVIGATION.md`) reacts to this context, so screens don't
individually decide where to navigate after an auth state change.

## What's still required for production

- A Supabase project with Phone (SMS) OTP and Google OAuth providers
  configured, and manual identity linking enabled.
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` set for the
  build.
- An SMS provider configured in Supabase for phone OTP delivery (e.g.
  Twilio, MSG91) — India-first delivery/costs should be evaluated here.
- Google OAuth client credentials (Web + iOS/Android) registered in the
  Supabase project and Google Cloud Console, matching the
  `healthintelligence://` redirect scheme.
- A "link your other sign-in method" entry point in `Me`, and end-to-end
  verification of the linking flow against a real Supabase project.

## Apple setup (outside the repo)

The app side is implemented; it cannot work until these are done:

1. Apple Developer → Identifiers → App ID `ai.healthintelligence.app`:
   enable **Sign in with Apple** (primary App ID).
2. Rebuild the native app so the entitlement is included (`app.json` has
   `ios.usesAppleSignIn` + the `expo-apple-authentication` plugin):
   `npx expo prebuild --clean -p ios` / `npx expo run:ios`, or an EAS build
   (EAS syncs the capability when it manages credentials).
3. Supabase → Authentication → Providers → **Apple**: enable it and add
   `ai.healthintelligence.app` to **Client IDs**. For native-only sign-in no
   secret key is needed.
4. Only for Apple sign-in on web/Android (OAuth), additionally: a Services ID
   (listed first in Client IDs) with return URL
   `https://<project-ref>.supabase.co/auth/v1/callback`, and a Sign in with
   Apple key (.p8 + Key ID + Team ID) used to generate the client secret in
   the Supabase dashboard — that secret expires every 6 months. Never commit
   the .p8 or the secret.
5. To email people who chose Hide My Email: Apple Developer → Services →
   Sign in with Apple for Email Communication — register the sending domain
   / address (SPF), or relay mail is rejected.
6. Supabase → Authentication → enable **Manual linking** if accounts should
   be able to add Apple from inside the app.

Expo Go signs in with Expo's bundle ID, so its tokens are rejected by a
provider configured for `ai.healthintelligence.app` — test in a development
build on a device (or a simulator signed into an Apple ID).
