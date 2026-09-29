# Mobile Phase 1 integration

AneviaOne — Personal Health Intelligence (working name; see
`mobile/config/brand.ts`). Branch `phase-1-mobile-integration`, built on
`phase-1-backend-integration` (GitHub `main` + the Supabase schema).

This makes the existing app **ready to connect to Supabase** without
changing its UX: real sign-in, an encrypted session, and real private PDF
uploads — while never presenting mock or sample data as a person's own.
No Supabase project, credentials or remote migrations are involved.

## 1. Architecture

```
Screens (app/…)                  never import Supabase
   │
   ├─ useAuth (hooks/useAuth.tsx) ─→ authService ─┬─ supabaseAuthService ─→ supabaseClient ─→ secureStorageAdapter (Keychain/Keystore)
   │                                              └─ mockAuthService (demo only)
   ├─ documentsService ──────────────────────────┬─ supabaseDocumentsService ─→ documents table + private "medical-documents" bucket
   │                                              └─ demoDocumentsService (demo only, in memory)
   ├─ healthService / aiService / profileService ┬─ production* (honest empty / "not available yet")
   │                                              └─ demo* (sample Health Memory)
   └─ sampleDocumentsService (sample records behind demo screens, labelled "Sample data")

config/appMode.ts  → the single switch that picks every implementation above
config/brand.ts    → product name, category, tagline, loop (presentation only)
services/serviceError.ts → user-safe error model shared by all services
```

Client vs server: the app holds only the Supabase **URL + publishable/anon
key** and acts as the signed-in user. Every rule that matters (ownership,
lifecycle, immutability, private storage) is enforced by Postgres RLS,
triggers and Storage policies (`supabase/migrations`). Anything needing
secrets or cross-user work (AI extraction, account deletion, exports) is a
future server-side Edge Function using the service role
(`supabase/functions/README.md`). The service-role key never exists in
`mobile/`.

## 2. Modes and environment variables

| Variable | Values | Notes |
|---|---|---|
| `EXPO_PUBLIC_APP_MODE` | `production` (default) \| `demo` | anything else → "not configured" |
| `EXPO_PUBLIC_SUPABASE_URL` | project URL | client-safe |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | publishable / anon key | client-safe; protected by RLS |

- **Production, configured** → real services.
- **Production, not configured** → root layout shows "AneviaOne isn’t
  configured"; no Supabase client is created; **no mock fallback**. (The
  technical detail is shown only in development builds.)
- **Demo** (explicit) → mock sign-in (code `123456`), in-memory documents,
  sample Health Memory, and a persistent "DEMO · sample data" badge. Never ship
  a demo build to users.

Template: `mobile/.env.example`. Real values go in `mobile/.env`
(git-ignored). Tests set demo mode in `jest.setup.js`.

## 3. Auth flow

1. Welcome → Mobile / **Email** / Google.
2. Email: `sendEmailOtp` → 6-digit code → `verifyEmailOtp` (Supabase Auth
   owns codes; the app never generates or stores them). Phone works the same
   once an SMS provider exists. Google uses PKCE (`exchangeCodeForSession`).
3. `useAuth` loads the user (`getSession()` + `profiles`), the root layout
   routes to onboarding or Home. Finishing onboarding writes
   `profiles.onboarding_completed_at`.
4. **Session storage:** supabase-js persists the session through
   `secureStorageAdapter` — chunked `expo-secure-store`,
   `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (not in backups/other devices).
   Tokens refresh only while the app is in the foreground.
5. **Session expiry:** if Supabase ends the session (expired/revoked refresh
   token, signed out elsewhere) the auth client clears the stored session,
   `useAuth` clears the user and sets `notice = 'session_expired'`; the root
   layout routes to Welcome, which shows "Your session has expired. Please sign
   in again to continue." A person's own sign-out shows no notice.
6. Errors shown to people are always `userMessage` text, never raw backend
   errors.

## 4. Document upload flow

```
Add Record → pick PDF (expo-document-picker, PDF only)
  1 validate   name/MIME/size, then read bytes with expo-file-system and
               check the real %PDF- header (20 MB max)
  2 reserve    INSERT documents → DB assigns id, owner, private storage path,
               status pending_upload
  3 upload     original → private bucket at exactly that path (no overwrite)
  4 confirm    status → uploaded (DB verifies the file exists)
→ result screen
```

- **With a processing summary** (demo today; real in Phase 2): main's
  "Added to Health Memory" screen with counts + "See what changed".
- **Without one** (production today): "Stored securely", the file name, and
  "…nothing from this file has been added to your Health Memory yet" +
  "View document". No invented counts.
- Failures: invalid file, unreadable file, network, expired session,
  backend not configured, upload/save failure → "Upload didn’t finish" with
  the safe message, "Try again" when retryable, "Choose another file".
- Camera scanning shows "coming soon" (images aren't accepted by the private
  bucket yet).

**Viewing:** real documents (UUID ids) show real metadata and status; "View
Original" creates a **60-second signed URL** and opens it in the in-app
browser. Another user's id returns "Document not found" (RLS). Sample records
keep main's viewer — extracted values, AI explanation, "View previous result"
— labelled **Sample data**.

## 5. Storage security expectations

- Bucket `medical-documents` is **private** (created private by migration);
  PDF only; 20 MB; path `<user_id>/documents/<document_id>/original.pdf`.
- Users can read only their own folder, upload only for their own pending
  record, never overwrite, and delete only abandoned uploads.
- No public URLs anywhere; originals are opened via short-lived signed URLs.

## 6. Service interfaces

| Interface | File | Production | Demo |
|---|---|---|---|
| `AuthService` | `services/auth/authTypes.ts` | `supabaseAuthService` | `mockAuthService` |
| `DocumentsService` | `services/documents/documentsTypes.ts` | `supabaseDocumentsService` | `demoDocumentsService` |
| `HealthService` | `services/health/healthService.ts` | `productionHealthService` (empty; real document count) | `demoHealthService` |
| `AiService` | `services/ai/aiTypes.ts` | `productionAiService` ("not available yet") | `demoAiService` |
| `ProfileService` | `services/profile/profileService.ts` | `productionProfileService` (sharing off; export/delete "not available yet") | `demoProfileService` |

Contracts for Phase 2/3 replacements: `BACKEND_CONTRACTS.md`. Remaining mocks:
`MOCK_TO_BACKEND.md`.

## 7. Files

**Added:** `config/appMode.ts`, `services/serviceError.ts`,
`services/auth/{authInput,secureStorageAdapter}.ts`,
`services/documents/{demoDocumentsService,documentStatus,documentValidation,documentsTypes,fileAccess,sampleDocuments,storagePaths,supabaseDocumentsService}.ts`,
`types/storedDocument.ts`, `components/AppModeNotices.tsx`,
`app/documents/index.tsx` (My documents), `test-support/fakeSupabase.ts`,
tests `app-mode-and-auth`, `document-rules`, `documents-service`,
`document-screens`, `production-safety`, `session-and-config`.

**Modified:** `services/supabaseClient.ts`, `services/auth/{authService,authTypes,mockAuthService,supabaseAuthService}.ts`,
`services/documents/documentsService.ts`, `services/health/healthService.ts`,
`services/ai/{aiService,aiTypes}.ts`, `services/profile/profileService.ts`,
`hooks/useAuth.tsx`, `types/{index,user}.ts`, `app/_layout.tsx`,
`app/add/index.tsx`, `app/documents/[id].tsx`,
`app/(auth)/{welcome,login,otp,onboarding}.tsx`, `app/(tabs)/{home,me}.tsx`,
`app/privacy/{index,data-sharing}.tsx`, `components/{index,AnimatedSplash}.ts(x)`,
`config/brand.ts`, `app.json` (display name + permission text only),
`jest.setup.js`, `__mocks__/expo-secure-store.js`, `__tests__/auth-screens.test.tsx`,
`package.json` / lockfile (`expo-file-system ~57.0.7`, via `npx expo install`),
`.env.example`, docs.

## 8. Testing approach

- Screen tests run in demo mode; production behaviour is tested by importing
  production implementations directly, mocking `config/appMode`, or
  re-loading modules with production env values (`jest.isolateModules`).
- Supabase is never called: `test-support/fakeSupabase.ts` records queries
  and returns queued responses. Database security is tested separately
  against PostgreSQL (`supabase/tests`, 135 checks).
- Covered: mode resolution and service selection (no mock fallback), secure
  session storage, session expiry, not-configured state, input normalisation,
  validation, storage paths, upload order/cleanup/error mapping, signed URLs,
  Add Record results (with/without processing summary, errors, retry, cancel,
  camera), My documents, real vs sample viewer, production empty states.

## 9. Known limitations

- Not verified against a real Supabase project or device yet (no project).
- Upload progress is shown in stages, not a percentage (supabase-js has no
  upload progress). Files are read into memory (≤20 MB).
- Google sign-in and SMS sign-in need provider setup and device testing.
- Health history, What Changed, Trends and Ask are empty/unavailable in
  production until Phase 2/3; account deletion/export are not available yet.
- Nothing technically prevents a demo-mode build from being shipped except
  the badge — add a build-time guard before store builds.
- The separate Expo dependency alignment on `main` (Expo Doctor 19/21) is
  unchanged.
