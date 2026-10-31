# App Store release: family build (1.0.0)

Order matters: **database → server functions → app build → store**. Each part has its own checks. Stop at any step that doesn't match.
Items marked **YOU** can only be done by the account owner (keys, Apple, legal). Everything else is scripted in the repo.

## 0. Merge

1. Merge PR #36 (add reports for a relative) and this PR (store-readiness fixes: parked WhatsApp preview is unreachable in real builds, iPhone-only, Family FAQ updated). CI must be green.
2. The shared FAQ now says family records are available. The website shows it as soon as it deploys, so merge this PR when you are ready for that to be public.

## 1. Production database: migration 20261103090000

Rehearsed locally with synthetic data (apply, verify, fingerprint unchanged, rollback, re-apply): `supabase/release/family-uploads/rehearse.sh`.

```sh
cd ~/aneviaone && git checkout main && git pull
```
1. **Backup** (Free plan keeps none): `pg_dump -Fc "<Session pooler string>" -f ~/aneviaone-backup-$(date +%Y%m%d).dump`
2. **Precheck**: `cat supabase/release/family-uploads/precheck.sql | pbcopy`, paste in the SQL Editor, run. Rows 1, 2, 3, 4, 7 must be `true`. If not, stop.
3. **Fingerprint before**: `cat supabase/release/family/row_fingerprint.sql | pbcopy`, run, keep the output.
4. **Dry run**: `npx supabase db push --dry-run` must list **only** `20261103090000_family_report_uploads.sql`.
5. **Apply**: `npx supabase db push` (answer Y).
6. **Verify**: `cat supabase/release/family-uploads/verify_after.sql | pbcopy`, run. **ALL CHECKS** must be `true`.
7. **Fingerprint after**: run `row_fingerprint.sql` again. Every value must equal step 3.
8. **Deploy both changed functions**: `npx supabase functions deploy process-document health-memory`

Rollback (only with approval): run `supabase/release/family-uploads/rollback.sql` in the SQL Editor (it refuses if a relative's report already exists), then `npx supabase migration repair --status reverted 20261103090000`.

## 2. Safety pass

| # | Step | Who |
|---|---|---|
| 2.1 | Create a **new Anthropic API key** with a monthly spend limit (console.anthropic.com → Settings → Limits). Put it in production: `npx supabase secrets set ANTHROPIC_API_KEY=<new key>`. Then **revoke the old key**. | **YOU** |
| 2.2 | Remove the unused Ask function from production: `npx supabase functions delete ask-health` (the app has no Ask tab; nothing calls it). | **YOU** |
| 2.3 | End-to-end deletion test with a **new test account** (not yours): sign up, upload a synthetic report, add a relative, delete the account in the app, then confirm the account and its reports are gone and a new sign-up with the same email works. | **YOU** (I can write the checks) |
| 2.4 | Confirm the **help@aneviaone.com** inbox receives mail. | **YOU** |
| 2.5 | **Lawyer review** of Terms, Privacy Policy and consent wording (health data, adults managing relatives, minors, DPDP Act). Do not submit before this. | **YOU** |
| 2.6 | Real-device pass of the build (section 4) with two synthetic test accounts. | **YOU** |

## 3. Build and test (TestFlight)

```sh
cd ~/aneviaone/mobile
npx eas-cli@latest build --platform ios --profile production
```
The build number increases automatically. When it finishes, install it from TestFlight and walk through `docs/TESTFLIGHT_E2E_CHECKLIST.md`, plus the family flows below. Use **synthetic reports only**.

Family flows (two test accounts, A and B):
1. A: Family → Add a relative → switch to them → upload a synthetic report → it shows under them, not under A's own record.
2. A: switch back to Me: the relative's results are not there.
3. A: invite B (Family → their record → Invite). B: Family → Enter code. A: approve. B sees A's records, view only; "Add report" is not offered; the original PDF opens.
4. A revokes. B's access ends immediately.
5. Account deletion for B still works.

## 4. App Store Connect

Submit: `npx eas-cli@latest submit --platform ios --profile production --latest` (app id `6819075705`).

| Item | What to enter |
|---|---|
| Devices | iPhone only (iPad off in this build). Screenshots: 6.9" and 6.5" iPhone. |
| App Privacy | Health & Fitness (health records), Contact info (email / phone), User content (uploaded documents), Identifiers. All **linked to the user**, **not used for tracking**. Disclose the AI provider as a third party that processes documents **only with the person's consent**. |
| Privacy Policy URL, Support URL | Live pages on aneviaone.com (must match what the lawyer approved). |
| Account deletion | In the app: Me → Privacy → Delete account (Guideline 5.1.1(v)). Mention it in the review notes. |
| Sign in with Apple | Offered (Guideline 4.8). |
| Review notes | Say: "AneviaONE stores and organises a person's own health reports. It gives no diagnosis or treatment advice." Explain how the reviewer signs in (see below). |
| Age rating | Medical/health information: answer honestly; 12+ or 17+ depending on the questionnaire. |

**Decision for you:** the reviewer needs a way in. Email-code sign-in can't be completed by Apple's reviewer. Easiest: they use **Sign in with Apple** with their own Apple ID, and the review notes say so. If you prefer a ready test account, tell me and I'll set one up with a fixed sign-in.

## 5. After approval

Release manually. Then, optionally: first accuracy run on generated PDFs (`docs/LOCAL_AI_TEST_KEY.md`, own key, spend-limited), and Android.
