# Mobile Auth

Authentication strategy, per spec sections 5/8: **Mobile OTP is the
primary signup/login path**, Google OAuth is secondary, and both must
resolve to a single account via identity linking rather than creating
duplicate Health Memories.

## Why Mobile OTP is primary

Product direction (explicit): Mobile OTP is better suited to an
India-first consumer health product than email/password. Google is
offered as a faster secondary option for people who prefer it. There is
no email/password flow in this app at all.

## Screens

- `(auth)/welcome` — two entry points: "Continue with mobile number" (→
  `/login?method=mobile`) and "Continue with Google" (→
  `/login?method=google`). Mobile is listed first and is the default
  (`method` unset falls through to the mobile flow).
- `(auth)/login` — branches on `?method`:
  - **mobile** (default): phone number input, validated to 10 digits
    before "Send OTP" is enabled, then pushes to `/otp` with the number.
  - **google**: a single explanatory screen + "Continue with Google"
    button.
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
export const authService: AuthService = isSupabaseConfigured ? supabaseAuthService : mockAuthService;
```

`isSupabaseConfigured` (from `services/supabaseClient.ts`) is true once
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set in
the environment. Until then, `mockAuthService` is used automatically — no
code change is needed to go live once Supabase credentials exist.

### Mock implementation (`mockAuthService.ts`)

- Development-only, isolated in its own file, and clearly commented as
  such.
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
- Google OAuth via `signInWithOAuth({ provider: 'google', options: { skipBrowserRedirect: true } })`
  + `expo-web-browser`'s `openAuthSessionAsync`, with the redirect URI built
  from `expo-auth-session`'s `makeRedirectUri({ scheme: 'healthintelligence' })`.

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
