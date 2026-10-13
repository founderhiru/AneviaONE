# Mobile release audit — all phases

**Audited:** `main` at `03caee26101b636a2d4a2a72d336e538df24c3b5` (2026-10-13), which includes the website truth pass (PR #14) and PRs #9–#13 (M1 corrections, write timeouts, Health Memory tests, deletion fix, production-readiness docs).
**Scope:** `mobile/`, the Supabase migrations and Edge Functions it depends on, and mobile docs. `web/` and `shared/` were not changed.

**Bottom line:** the app is not yet ready for an internal release. The code is in good shape: production and demo are cleanly separated, and every automated suite passes. What's missing is evidence and deployment: the M1 migrations aren't in production, no build has been exercised on a device or simulator in this audit, Apple sign-in is unverified, and live AI extraction hasn't been run against an isolated stack.

## 1. Evidence gathered in this audit

| Check | Where | Result |
|---|---|---|
| Mobile typecheck / lint | `npx tsc --noEmit`, `npx expo lint` | pass |
| Mobile unit/screen tests | `npx jest` | 43 suites, 564 tests pass (41/557 on `main` before this branch) |
| Edge Function typecheck + tests | `deno task check`, `deno task test` (synthetic PDFs, fake AI provider, no network) | pass, 166 passed, 1 skipped (the local-stack test below) |
| Database suites, all 14 migrations | `supabase/tests/local/run-local.sh` (throwaway Postgres) | all pass: security isolation (with and without Storage writes), Gate 1 engine, document deletion, identity profile, fact corrections, correction-survives-deletion |
| Corrections → Health Memory / Trends / What Changed / Timeline / Ask (no AI) / RLS | `corrections_local_test.ts` against the **local** Supabase stack (API 127.0.0.1:54321), synthetic users, deleted afterwards | 8/8 steps pass |
| Native permissions after build plugins | `npx expo config --type introspect` | Android: `CAMERA` (+ Expo defaults); `RECORD_AUDIO`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO` removed. iOS: camera and photo-library strings only |
| Migration file hashes | `shasum -a 256` | match `M1_PRODUCTION_MIGRATION_REVIEW.md` |
| iOS simulator / device | — | **not run** (no development build in this audit) |
| Android emulator / device | — | **not run** (see `LOCAL_AI_TEST_KEY.md`: Metro on 8081 on this Mac is bound to production) |
| Production | — | **not inspected** (no production access was used) |

The local stack had migrations up to `20261012090000`, so it was missing `20261013090000`. It was left unchanged; that migration's behaviour is covered by the throwaway-Postgres suite.

## 2. Feature matrix

Classifications: **Implemented** (code exists) · **Locally verified** (real behaviour in an isolated local environment, not mocks) · **Internally release-ready** · **Production verified** · **Planned / incomplete**.
No feature is internally release-ready or production verified: no internal build has been exercised, and production has not been inspected.

"Server-side" under Locally verified means the database and Edge Function behaviour was exercised for real, but the app UI was only tested in Jest.

### Phase 1 — Mobile foundation

| Feature | Implementation | Backend | Automated evidence | Device evidence | Remaining | Classification |
|---|---|---|---|---|---|---|
| Brand, animated splash, launch routing, tabs | `app/_layout.tsx`, `components/AnimatedSplash.tsx`, `hooks/useLaunchSplash.ts` | — | `launch-routing`, `screen-header-back`, `tabs-screens` | none | device pass incl. reduced motion | Implemented |
| Email OTP sign-in | `services/auth/supabaseAuthService.ts`, `(auth)/otp.tsx` | Supabase Auth + SMTP | `auth-screens`, `email-link`, `session-and-config`, `sign-out-session` | none | `auth_email_e2e.ts` is live-only; SMTP sender not verified here | Implemented |
| Google sign-in (native) | `services/auth/googleAuth.ts`, `config/googleAuth.ts` | Supabase Google provider | `google-native-real`, `google-native-signin` | none | Android SHA-1 / Web client ID per EAS env not verified | Implemented |
| Apple sign-in | `services/auth/appleAuth.ts`, `hooks/useAppleSignInAvailable.ts` | Supabase Apple provider (client ID = bundle ID) | `apple-auth` | none | Must be verified on a real iOS device with the internal build; the original checkout has uncommitted diagnostics for it | Implemented (unverified) |
| Onboarding, identity details | `(auth)/onboarding.tsx`, `profile/identity.tsx`, `services/profile/profileService.ts` | `set_my_identity` RPC, `profiles` / `health_profiles` | `identity-onboarding`, `identity-profile`; SQL identity suite | none | device pass | Locally verified (server-side) |
| Home, Me, Help/FAQ, Privacy | `(tabs)/home.tsx`, `(tabs)/me.tsx`, `help/`, `privacy/` | health-memory | `home-dashboard-*`, `help-faq`, `me-sign-out`, `secondary-screens` | none | Privacy no longer offers non-working actions (this branch) | Implemented |
| Capture: PDF, photo, library, multi-page scan | `services/documents/capture.ts`, `add/index.tsx` | private Storage | `scan-reading`, `document-rules`, `documents-service` | none | camera/picker on both platforms, permission-denied paths | Implemented |
| Permissions | `app.json` | — | `native-permissions` (new), introspection | none | check the release APK manifest once built (see §4) | Implemented |
| Accessibility / reduced motion | 82 `accessibilityLabel`s; reduced motion in splash, welcome, help | — | partial | none | VoiceOver / TalkBack pass | Implemented |
| Build and release config | `app.json`, `eas.json` | EAS env per profile | `eas-profiles`, `demo-production-separation`, `production-safety` | none | see §4 | Implemented |

### Phase 1.5 — Real health-record workflows

| Feature | Implementation | Backend | Automated evidence | Remaining | Classification |
|---|---|---|---|---|---|
| Upload + private storage | `supabaseDocumentsService.ts`, `storagePaths.ts` | `medical-documents` bucket, `documents` (RLS) | SQL security isolation (Storage writes tested) | device upload against local stack | Locally verified (server-side) |
| Consent before AI | `services/consent/consentService.ts` (`ai-2026-11`), Privacy toggle | `consents`; re-checked server-side before any AI call | Gate 1 engine SQL; Deno pipeline; `gate1-report-reading` | — | Locally verified (server-side) |
| Extraction (text PDF + OCR) | `process-document`, `_shared/health-engine/` | Anthropic | Deno pipeline with fake provider + synthetic PDFs | **live AI against the local stack is blocked** until an isolated, budget-limited test key exists (`LOCAL_AI_TEST_KEY.md`) | Implemented |
| Report-person matching, held facts | `_shared/health-engine/identity.ts` | `engine_account_identity` | Gate 1 engine SQL; `gate1-identity-trust` | — | Locally verified (server-side) |
| Review, correct, confirm + reasons + history | `app/facts/[id].tsx`, `services/health/factCorrection.ts`, `factService.ts` | `correct_fact` RPC (migration 1) | fact-corrections SQL (59), `corrections_local_test.ts` 8/8, `fact-corrections` Jest | **migration 1 not in production** | Locally verified (server-side) |
| Source provenance | quotes + page per fact; source links on results / medications | `document_pages`, `fact_sources` | corrections local test ("keeps its source evidence") | — | Locally verified (server-side) |
| Persistence across reread / sign-out | reread guard; session storage | engine fingerprints | Gate 1 SQL (idempotency), `completed-document-read-only`, `sign-out-session` | device sign-out/in pass | Locally verified (server-side) |
| Correction survives deleting its report | migration 2 | `engine_delete_document` | correction-deletion SQL (all pass) | **migration 2 not in production** | Locally verified (throwaway Postgres) |
| Timeouts / network failure states | `useSingleFlight`, `serviceError.ts`, write timeouts (PR #10) | — | `fact-corrections`, `auto-processing`, `document-screens` | device offline pass | Implemented |
| Report deletion + cleanup | `delete-document` function | `engine_delete_document` | document deletion SQL (39), `document-deletion` Jest | — | Locally verified (server-side) |
| Tenant isolation / RLS | all tables, Storage policies | — | security isolation SQL (both modes), ownership steps in local test | — | Locally verified (server-side) |

### Phase 2 — Health Intelligence

| Milestone | State | Evidence | Classification |
|---|---|---|---|
| M1 Safe corrections and confirmation | Complete in code; blocked on production migrations | see Phase 1.5 | Locally verified (server-side) |
| M2 Timeline, Trends, What Changed | Real: the deterministic `health-memory` function reads the trusted `current_*` views only. No mock data in production | Deno memory tests; local test (corrected value used and cited) | Locally verified (server-side) |
| Ask My Health | Real: `ask-health` gives a safety screen, then retrieval as the caller (RLS), then an answer built from the records. AI only rewords it, only with consent, and each cited sentence is validated | Deno ask tests; local test (no-AI path) | Locally verified (no-AI path); AI path Implemented |
| M3 Medication history | **List only.** Memory items show name, dose as written, first recorded and source. There is no start/stop, dose-change history or timeline | `medications-screen` (new) | Planned / incomplete |
| M4 Doctor Brief | **Placeholder** screen ("isn't available yet"), unreachable from navigation | — | Planned / incomplete |
| M5 Security and privacy hardening | RLS, private Storage, redacted logs, consent gating are in place. **Missing: account deletion and data export** (the Privacy screen now says so plainly) | SQL security suites | Planned / incomplete |
| M6 Multilingual | **Not started.** No i18n layer; all copy is English | — | Planned / incomplete |

### Phase 3 — Family Health

`app/family/index.tsx` is a "Coming soon" placeholder that no navigation reaches. There are no family tables, invitations, permissions or sharing; the schema is single-person throughout (every row is owned by `auth.uid()`).
**Planned / incomplete.** Nothing gives access across members, and nothing should until it is designed and reviewed.

### Parked: WhatsApp

`services/whatsapp/whatsappService.ts` is an in-memory mock. Its screen says "Preview only" and is not linked from Me, Add or onboarding, but a deep link (`healthintelligence://whatsapp`) still opens it and its fake "connect" succeeds. Remove the route or gate it before any public release.

## 3. Changes in this branch

1. **Native permissions** (`app.json`, `package.json`):
   - removed `expo-camera`, which nothing imports; it was adding `RECORD_AUDIO`, the ML Kit barcode scanner and a microphone string;
   - Android now declares only `CAMERA` and blocks `RECORD_AUDIO` / `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO`. On Android 13+ the system photo picker needs no media permission, as `ImagePickerModule.getMediaLibraryPermissions` shows; Play policy rejects `READ_MEDIA_IMAGES` for one-off picks;
   - iOS no longer gets microphone or Face ID purpose strings for features the app doesn't have.
   - Test: `__tests__/native-permissions.test.ts`.
2. **Privacy & Security** (`app/privacy/index.tsx`): production showed "Download My Data", "Delete your data" (whose dialog said "This is a UI preview") and a "You control sharing" link to toggles that can't save. None of these work.
   - Replaced with a working **Delete a report** row (to My documents), a **Not shared** statement (accurate: the AI provider is the only outside service, and only with consent, for both reading and Ask), and one plain sentence that account deletion and data download aren't available yet.
   - The shared FAQ still describes them as planned, which remains true.
3. **Medications** (`app/medications/index.tsx`): production medications have no frequency, so rows showed a dangling `500 mg · ` or a bare ` · `. Rows now render like the Health tab, and each opens its source report. Test: `__tests__/medications-screen.test.tsx`, which fails on the old screen.
4. **Docs:** `M1_PRODUCTION_MIGRATION_REVIEW.md` still said PR #12 was unmerged; it was merged in `6221c10`.

## 4. Release blockers and next steps (priority order)

**For a controlled internal release (TestFlight / internal testing track):**

1. **Deploy M1 migrations to production (needs explicit approval).** Builds from `main` include the Result screen; without migration 1, saving a correction fails. The procedure, SQL, locking risk (migration 1 holds `AccessExclusiveLock` on six fact tables, so use `lock_timeout 5s`), backup and rollback are in `M1_PRODUCTION_MIGRATION_REVIEW.md` §5–§9. Step 1 is the read-only `prod_precheck.sql` in the SQL Editor.
2. **Device verification against the local stack.** Make an iOS development build (Xcode Device Hub) and an Android one with the dev-server host set explicitly, both pointed at `http://127.0.0.1:54321`. Walk through: sign-in → identity → consent → upload (PDF, photo, scan) → result → correct → delete → sign-out/in, plus offline and permission-denied paths, VoiceOver/TalkBack and reduced motion.
3. **Apple sign-in on a real iPhone** with the internal build (Supabase Apple provider client ID = `ai.healthintelligence.app`).
4. **Live AI extraction on the local stack** with an isolated, budget-limited key (`LOCAL_AI_TEST_KEY.md`), synthetic reports only.
5. **Release manifest check:** in the first release APK, confirm `SYSTEM_ALERT_WINDOW` is debug-only, and that `RECORD_AUDIO` / `READ_MEDIA_*` are absent (`aapt dump permissions`).

**Before any public store release (in addition):**

6. **In-app account deletion.** App Store guideline 5.1.1(v) requires it for apps that create accounts, and Google Play requires a deletion path as well. It needs a service-role Edge Function (Storage objects, all rows, `auth.admin.deleteUser`), a confirmation flow and SQL tests. Data export (M5) should follow.
7. The **shared FAQ** (`shared/faq.ts`, also used by the website) says Ask My Health and AI reading are "not active in the current version". Whether that matches production depends on whether `process-document` / `ask-health` are deployed there, which this audit could not check. The website owner should reconcile it.
8. `ios.supportsTablet: true` means iPad screenshots and iPad QA are needed; otherwise set it to `false`.
9. WhatsApp deep link (see above); App Privacy / Data Safety forms; privacy policy covering the AI provider.
