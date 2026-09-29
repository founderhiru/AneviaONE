# Phase 1 backend integration

Branch `phase-1-backend-integration`, created from GitHub `main` @ `edd7b10`
("Add premium animated launch sequence"). **Not merged into `main`.**

**Rule applied:** GitHub `main` is the source of truth for the app UI, app
code and dependencies. From the local ZIP line only the Phase 1
**backend/database** artifacts were ported. Nothing was deployed; no Supabase
project, credentials or `.env` values were created; no migration was run
against any remote database.

## How the comparison was done

- The downloaded `health-intelligence-app-main.zip` is **byte-for-byte
  identical to commit `c6cdfa6`** (0 differing files), so `c6cdfa6` is the
  exact common ancestor.
- ZIP-side changes = ZIP working folder vs `c6cdfa6` (69 files; generated
  files and the local `.env` excluded).
- GitHub-side changes = `c6cdfa6..edd7b10` (22 files, 4 commits: `d50024a`,
  `544fc88`, `b8c2860`, `edd7b10`).

---

## A. Files found only in the ZIP (changed/added only on the ZIP side)

**Backend / database — PORTED**

| File | |
|---|---|
| `supabase/config.toml` | CLI project config (technical id only) |
| `supabase/functions/README.md` | where Phase 2 server code + secrets go |
| `supabase/migrations/20260929120000_profiles.sql` | profiles, signup trigger, RLS |
| `supabase/migrations/20260929120100_documents.sql` | documents, lifecycle guard triggers, status history, RLS |
| `supabase/migrations/20260929120200_document_storage.sql` | private `medical-documents` bucket + Storage policies |
| `supabase/migrations_proposed/20261001090000_health_profile_consents_audit.sql` | proposed (needs approval) |
| `supabase/migrations_proposed/20261001090100_document_pages_extraction.sql` | proposed |
| `supabase/migrations_proposed/20261001090200_clinical_facts.sql` | proposed |
| `supabase/migrations_proposed/20261001090300_timeline_insights.sql` | proposed |
| `supabase/tests/security_isolation_test.sql` | Phase 1 security test (SQL-Editor safe, rolls back) |
| `supabase/tests/proposed_health_model_test.sql` | proposed-model integrity/isolation test |
| `supabase/tests/local/run-local.sh`, `supabase_stub.sql` | local PostgreSQL test runner |
| `docs/DATABASE_SCHEMA.md`, `docs/RLS_POLICY_DESIGN.md` | ported verbatim |
| `docs/BACKEND_CONTRACTS.md`, `docs/SUPABASE_SETUP.md` | ported, **adapted** to say what is and isn't on `main` |
| `docs/MOCK_TO_BACKEND.md` | **rewritten** from an inventory of `main`'s code (the ZIP version described the ZIP app) |
| `mobile/.env.example` | **adapted** to the two variables `main`'s code reads; no values |

**Mobile app code — NOT PORTED (see E and "Mobile Phase 1 port")**

`mobile/config/appMode.ts`, `mobile/services/serviceError.ts`,
`mobile/services/supabaseClient.ts`,
`mobile/services/auth/{authService,authTypes,authInput,mockAuthService,secureStorageAdapter,supabaseAuthService}.ts`,
`mobile/services/documents/{demoDocumentsService,documentStatus,documentsTypes,documentValidation,fileAccess,sampleDocuments,storagePaths,supabaseDocumentsService}.ts`,
`mobile/services/index.ts`, `mobile/hooks/useAuth.tsx`,
`mobile/types/{index,storedDocument,user}.ts`,
`mobile/components/AppModeNotices.tsx`,
`mobile/app/(auth)/{login,otp,welcome}.tsx`, `mobile/app/(tabs)/me.tsx`,
`mobile/app/documents/index.tsx`, `mobile/app.json`, `mobile/.gitignore`,
`mobile/jest.setup.js`, `mobile/__mocks__/expo-secure-store.js`,
`mobile/test-support/fakeSupabase.ts`,
`mobile/__tests__/{auth-foundation,document-rules,documents-service,document-screens,animated-splash}.test.ts(x)`,
`docs/MOBILE_AUTH.md`, `docs/BACKEND_SETUP.md`, `mobile/expo-env.d.ts` (generated).

## B. Files found only in GitHub (changed only on the GitHub side) — all kept as-is

`docs/MOBILE_DESIGN_RULES.md`, `mobile/__tests__/secondary-screens.test.tsx`,
`mobile/app/(auth)/onboarding.tsx` (WhatsApp step), `mobile/app/(tabs)/health.tsx`
(categories), `mobile/app/(tabs)/timeline.tsx`, `mobile/app/changes/index.tsx`,
`mobile/app/medications/index.tsx`, `mobile/app/privacy/index.tsx`,
`mobile/app/trends/[metric].tsx`, `mobile/babel.config.js`,
`mobile/components/FadeInView.tsx`, `mobile/components/SuccessCheck.tsx`,
`mobile/tsconfig.json`.

## C. Files modified on both sides — GitHub version kept for every one

| File | GitHub `main` change (kept) | ZIP change (not ported — recorded here) |
|---|---|---|
| `mobile/app/_layout.tsx` | animated launch wired into `RootNavigator`; reanimated import removed | native-splash hold + launch overlay; "configuration required" screen; demo badge |
| `mobile/components/AnimatedSplash.tsx` | its own launch animation (reduce-motion aware) | a different, independently built launch animation |
| `mobile/components/index.ts` | exports `AnimatedSplash`, `FadeInView`, `SuccessCheck` | exports `AnimatedSplash`, `AppModeNotices` |
| `mobile/app/add/index.tsx` | success screen with counts + `SuccessCheck` (still simulated processing) | real PDF upload flow (validate → upload → confirm), honest result/error/retry |
| `mobile/app/documents/[id].tsx` | "AI explanation" block + "View previous result" | real stored-document view + 60 s signed "View Original"; mock records labelled "Sample data" |
| `mobile/services/documents/documentsService.ts` | `processNewDocument` returns `ProcessingResult` counts | replaced by real/demo service selector (fake pipeline removed) |
| `mobile/__tests__/auth-screens.test.tsx` | onboarding step count updated | brand read from `BRAND`; email sign-in tests |
| `mobile/package.json`, `package-lock.json` | pin `react-test-renderer`/`react-dom`, hoist `expo-modules-core` | full Expo SDK 57 alignment (Jest 29, worklets/reanimated, gesture-handler 2, async-storage 2, patch updates, `expo-file-system`) |

## D. What was ported

- The complete `supabase/` tree (13 files) — **verbatim**, zero conflicts.
- Backend documentation (5 files) + this report.
- `mobile/.env.example` (template only, no values).

No existing file on `main` was modified.

## E. Deliberately NOT ported (and why)

1. **All mobile app code** (list in A) — GitHub owns the app code, and the
   Phase 1 mobile changes touch screens that differ on both sides. Porting them
   needs a proper merge with `main`'s newer UI (see next section), reviewed on
   its own.
2. **Dependency / Expo config fixes** (`package.json`, lockfile, `app.json`
   `newArchEnabled`) — kept GitHub's state as instructed. See G-2.
3. **ZIP `AnimatedSplash` / launch overlay** — `main` has its own.
4. **Tests for unported code** — they test modules not on this branch.
5. **`docs/MOBILE_AUTH.md` edits** — they describe unported auth code.
6. **`docs/BACKEND_SETUP.md`** — only a pointer to `SUPABASE_SETUP.md`.
7. **`mobile/.gitignore` env rules** — the root `.gitignore` already ignores
   `.env` at every depth.

Nothing was discarded: the ZIP folder is untouched and remains the source for
the mobile port.

## Mobile Phase 1 port (recommended next step, needs approval)

What `main` still lacks for a real backend, and how to merge it onto `main`'s UI:

| Capability | ZIP files | Merge approach on `main` |
|---|---|---|
| No silent mock fallback; explicit demo mode | `config/appMode.ts`, `authService.ts`, `AppModeNotices.tsx`, gate in `_layout.tsx` | add gate + badge to `main`'s `_layout` without touching its splash |
| Encrypted session, foreground refresh, PKCE, **fixed Google sign-in** (session was never established) | `supabaseClient.ts`, `secureStorageAdapter.ts`, `supabaseAuthService.ts` | service-only, no UI change |
| Email one-time-code sign-in | `authInput.ts`, `authTypes.ts`, `login.tsx`, `otp.tsx`, `welcome.tsx` | add an email branch to `main`'s screens |
| Persisted onboarding, auto sign-out on revoked session | `useAuth.tsx`, `authTypes.ts` | service/hook only |
| Real PDF upload, list, secure original | `services/documents/*`, `types/storedDocument.ts`, `serviceError.ts`, `add/index.tsx`, `documents/[id].tsx`, `documents/index.tsx`, `me.tsx` | keep `main`'s success screen + `SuccessCheck`; replace the fake counts with honest "stored securely" text until Phase 2 provides real counts; keep the AI-explanation block for sample data only |
| Tests | 5 test files + `test-support/fakeSupabase.ts` | port with the code |
| Dependency alignment (needs `expo-file-system` direct dep) | `package.json`, lockfile, `app.json` | separate decision (G-2) |

## F. Conflicts

- **Backend/database:** none — every backend artifact was ZIP-only.
- **App code:** the 8 file pairs in C conflict in intent. All resolved in
  favour of GitHub for this branch; the ZIP side is deferred to the mobile port.
- **Documentation:** the ZIP docs assumed the ZIP app; `BACKEND_CONTRACTS.md`,
  `SUPABASE_SETUP.md` and `MOCK_TO_BACKEND.md` were corrected to describe
  `main` (items not yet on `main` are marked "pending mobile port").

## G. Decisions requiring founder approval

1. **Approve the mobile Phase 1 port** onto `main` (above). Without it you can
   create the database, but the app can't use it: no email sign-in, and phone
   OTP needs a paid SMS provider + India DLT registration, and Google sign-in
   on `main` doesn't complete.
2. **Dependencies on `main`** — Expo Doctor reports 19/21 on `main`
   (`newArchEnabled` in `app.json`; 12 packages off SDK 57, incl. Jest 30,
   gesture-handler 3, async-storage 3) and `npm ci` shows a `react-reconciler`
   peer warning. The ZIP line reached 21/21 with 0 warnings. Approve aligning
   `main` (a separate, dependency-only change).
3. **Proposed health data model** (`supabase/migrations_proposed/`) — apply now
   or at Phase 2 (recommended: Phase 2, after review of `DATABASE_SCHEMA.md`).
4. Open design decisions carried over from the readiness phase: facts are
   never deleted (reject/correct instead); whether unreviewed AI facts show
   immediately; audit logs kept anonymised after account deletion and consents
   deleted with the account (legal review under DPDP); immunizations stored as
   procedures; own-data-only access (no family/doctor sharing yet); Indian drug
   coding standard.
5. **Merge strategy for this branch** — this branch only adds files, so it can
   merge into `main` cleanly whenever you choose; it was not merged.
