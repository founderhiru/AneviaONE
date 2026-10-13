# TestFlight internal E2E checklist

**Build under test:** iOS 1.0.0 from `main` at `2ec2692` (EAS production profile, so it uses the **production** Supabase project).
**Testers:** internal App Store Connect users only.
**Data:** synthetic only. Use dedicated test accounts (e.g. `+e2e` email sub-addresses) and the fictional reports in `supabase/tests/e2e/` or similar, clearly marked as synthetic. **Never upload a real health document.** Never use a personal account.

## Backend prerequisites (each needs separate approval; none is done)

| # | Prerequisite | Needed for | Status |
|---|---|---|---|
| P1 | Read-only pre-check `supabase/release/m1/prod_precheck_single_query.sql` (SQL Editor) | knowing what production has | **not run** |
| P2 | M1 migration 1 `20261012090000_fact_corrections.sql` | saving a correction (section 4) | **not applied**: the build's Correct screen fails with a generic error until it is |
| P3 | M1 migration 2 `20261013090000_corrections_survive_report_deletion.sql` | a correction surviving report deletion (section 7) | **not applied** |
| P4 | Migration `20261014090000_account_deletion.sql` and `supabase functions deploy delete-account` | account deletion (section 9) | **not applied / not deployed**: the build's Delete account screen reports a failure until they are |
| P5 | `process-document` / `health-memory` / `ask-health` deployed with a production AI key | reading, Health/Timeline, Ask in production | **unverified** from this side |

Run P1 first and compare with `docs/M1_PRODUCTION_MIGRATION_REVIEW.md` §10.

## Checklist

Mark each: ✅ pass · ❌ fail (note what you saw) · ⏸ blocked (name the prerequisite).

### 1. Install and launch
- [ ] Install from TestFlight; the splash animation plays; Welcome shows Google, **Apple**, Email and the mobile-number field.
- [ ] Reduced Motion on (Settings → Accessibility): the splash and Welcome don't animate heavily.

### 2. Authentication
- [ ] **Sign in with Apple** on a real iPhone, with a test Apple ID if possible. Try both "Share My Email" and "Hide My Email". Expected: you are signed in; first sign-in goes to "Set up your health profile".
- [ ] Google sign-in, with a test Google account.
- [ ] Email code: the code arrives; **tapping the code boxes opens the keyboard** (fixed in #15); a wrong code shows an error.
- [ ] Cancelling Apple or Google returns to Welcome with no error.
- [ ] Sign out → force-quit → relaunch: Welcome is shown and no session is restored.

### 3. Profile and onboarding
- [ ] Enter a fictional name and date of birth → onboarding → **"Upload a document" opens Add Record** (fixed in #15); "Take a photo" does too.

### 4. Upload and reading *(P5; real extraction uses the production AI key, so use synthetic reports only)*
- [ ] Upload a synthetic text PDF: the consent prompt appears before any reading; "Not now" leaves it stored and unread.
- [ ] Allow: the report is read; results appear with page and range; any held result shows "Not yet checked".
- [ ] Photo, multi-page scan and choose-photo paths. Camera and Photos permission prompts appear only when used. **No microphone prompt.**
- [ ] Airplane mode during upload or reading: an honest error and a working retry.

### 5. Review, correction, confirmation *(P2)*
- [ ] Confirm a held result: it enters Health Memory; **Home "Needs review" and the report's "held back" count drop** (fixed in #15).
- [ ] Correct a value with a reason: "Correction saved."; the history shows the original.

### 6. Health, Timeline, Ask
- [ ] Health shows the corrected value and its source report and page; Medications rows have no stray "·".
- [ ] The Timeline event lists the results; "View Original Document" opens the right report.
- [ ] Ask a factual question: the answer cites the report and page.
- [ ] Ask a diagnosis question ("Do I have diabetes?"): it is refused, with no interpretation.

### 7. Persistence and report deletion *(P3 for the cross-report case)*
- [ ] Sign out and in: corrections and confirmations are still there.
- [ ] Delete a report from its screen: "Health record deleted."; going **back to its Timeline event says it's gone** (fixed in #15).
- [ ] With two reports holding the same result plus a correction, delete one: the correction stays (needs P3).

### 8. Privacy screen
- [ ] Report reading consent toggle works both ways. "Not shared" is shown. "Download My Data" is stated as unavailable (not a button). **Delete account** is offered.

### 9. Account deletion *(P4; use a throwaway synthetic account only)*
- [ ] The Delete button stays disabled until `DELETE` is typed exactly.
- [ ] If the last sign-in was more than 15 minutes ago: "sign in again", and nothing is deleted.
- [ ] Delete: you are signed out, and Welcome says the account was deleted. Signing in again with the same email creates a **new, empty** account.
- [ ] With an Apple-ID account: the app's note about removing it from Apple Account settings. Apple token revocation is **not implemented** yet.

## Not covered by this build or plan
- Android (no Android build in this round).
- Data export, Family Health, Doctor Brief, WhatsApp: not available, and the app says so or doesn't show them.
- Live AI against a non-production stack needs the separate spend-limited test key (`docs/LOCAL_AI_TEST_KEY.md`).
